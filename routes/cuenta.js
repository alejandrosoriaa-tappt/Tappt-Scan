const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const planes = require('../services/planes');
const stripe = require('../services/stripe');
const drive = require('../services/drive');
const whatsapp = require('../services/whatsapp');
const supabase = require('../services/supabase');
const { t, IDIOMAS } = require('../services/i18n');

// Perfil + estado de conexiones y consumo del mes.
router.get('/', requireAuth, async (req, res) => {
  try {
    const usados = await planes.escaneosDelMes(req.usuario.id);
    const vigente = planes.planVigente(req.usuario);
    const limite = planes.limiteDe(vigente);

    res.json({
      id: req.usuario.id,
      email: req.usuario.email,
      whatsapp: req.usuario.whatsapp_phone,
      driveConectado: Boolean(req.usuario.drive_tokens),
      plan: vigente,
      planVence: req.usuario.plan_vence || null,
      idioma: req.usuario.idioma || null,
      moneda: req.usuario.moneda || null,
      escaneosUsados: usados,
      escaneosLimite: limite === Infinity ? null : limite,
      // La app lo necesita para armar los enlaces wa.me; sin esto los
      // botones de WhatsApp abren la app sin destinatario.
      numeroTapptScan: (process.env.WHATSAPP_NUMERO || '').replace(/\D/g, ''),
    });
  } catch (err) {
    console.error('[cuenta] error', err);
    res.status(500).json({ error: 'error_cuenta' });
  }
});

// La app manda aquí el idioma del dispositivo (o el que el usuario eligió)
// para que el bot de WhatsApp le hable igual, y la moneda para cobrarle en
// la suya.
router.put('/preferencias', requireAuth, async (req, res) => {
  try {
    const cambios = {};

    if (req.body.idioma !== undefined) {
      if (!IDIOMAS.includes(req.body.idioma)) {
        return res.status(400).json({ error: 'idioma_no_soportado', soportados: IDIOMAS });
      }
      cambios.idioma = req.body.idioma;
    }

    if (req.body.moneda !== undefined) cambios.moneda = String(req.body.moneda).toLowerCase();

    if (!Object.keys(cambios).length) return res.status(400).json({ error: 'sin_cambios' });

    const { error } = await supabase.from('scan_users').update(cambios).eq('id', req.usuario.id);
    if (error) throw error;

    res.json({ ok: true, ...cambios });
  } catch (err) {
    console.error('[cuenta] error guardando preferencias', err);
    res.status(500).json({ error: 'error_preferencias' });
  }
});

// Genera el link de pago y lo manda por WhatsApp (nunca cobro in-app).
router.post('/upgrade', requireAuth, async (req, res) => {
  try {
    const { plan, moneda } = req.body;
    if (!['personal', 'negocio'].includes(plan)) {
      return res.status(400).json({ error: 'plan_invalido' });
    }

    const link = await stripe.crearLinkDePago(req.usuario, plan, moneda);

    if (req.usuario.whatsapp_phone) {
      await whatsapp.sendText(
        req.usuario.whatsapp_phone,
        t(req.usuario.idioma, 'linkPago', { plan, link })
      );
    }

    res.json({ link, enviadoPorWhatsapp: Boolean(req.usuario.whatsapp_phone) });
  } catch (err) {
    console.error('[cuenta] error generando pago', err);
    res.status(500).json({ error: 'error_pago' });
  }
});

/**
 * Borrado de cuenta — requisito de la App Store (guía 5.1.1(v)): una app que
 * deja crear una cuenta tiene que dejar borrarla DESDE ADENTRO. Aquí la
 * cuenta nace sola con el primer mensaje de WhatsApp (`services/sesiones.js`),
 * así que aplica igual.
 *
 * Qué borra y qué no, a propósito:
 *
 * - **Sus documentos NO se borran de Drive.** Viven en el Drive del propio
 *   usuario y son suyos; borrarlos sería destruir sus archivos, no los
 *   nuestros. Lo que se borra es nuestra metadata y nuestro acceso.
 * - Se revoca el permiso de Drive, porque olvidar el token no lo revoca del
 *   lado de Google: el usuario seguiría viendo el permiso concedido.
 * - Se cancela la suscripción de Stripe si la hay, o se le seguiría cobrando
 *   a alguien que ya no tiene cuenta.
 * - Una suscripción de **IAP no se puede cancelar desde aquí**: Apple y
 *   Google solo dejan cancelarla desde los ajustes del sistema. Por eso la
 *   respuesta avisa, y la app lo muestra antes de confirmar.
 *
 * Las tablas hijas (`scan_documents`, `scan_versiones`, `scan_sesiones`,
 * `scan_payments`, `scan_firmas`) tienen `on delete cascade` sobre
 * `user_id`, así que se van con la fila del usuario.
 */
router.delete('/', requireAuth, async (req, res) => {
  try {
    // Salvaguarda contra un DELETE por accidente: la app manda la palabra
    // explícita que el usuario tecleó. Es barato y esto no tiene deshacer.
    if (req.body?.confirmacion !== 'ELIMINAR') {
      return res.status(400).json({ error: 'confirmacion_requerida' });
    }

    const usuario = req.usuario;

    // Ninguna de las dos puede impedir el borrado: son limpieza de afuera,
    // y las dos tragan sus errores.
    if (usuario.drive_tokens) await drive.revocarAcceso(usuario.drive_tokens);
    if (usuario.stripe_subscription_id) {
      await stripe.cancelarSuscripcion(usuario.stripe_subscription_id);
    }

    const { error } = await supabase.from('scan_users').delete().eq('id', usuario.id);
    if (error) throw error;

    const suscripcionDeTienda = Boolean(
      usuario.apple_original_transaction_id || usuario.google_purchase_token
    );

    console.log(`[cuenta] cuenta borrada: ${usuario.id}`);
    res.json({ ok: true, suscripcionDeTienda });
  } catch (err) {
    console.error('[cuenta] error borrando la cuenta', err);
    res.status(500).json({ error: 'error_borrando_cuenta' });
  }
});

module.exports = router;
