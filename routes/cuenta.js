const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const planes = require('../services/planes');
const stripe = require('../services/stripe');
const whatsapp = require('../services/whatsapp');
const supabase = require('../services/supabase');
const { t, IDIOMAS } = require('../services/i18n');

// Perfil + estado de conexiones y consumo del mes.
router.get('/', requireAuth, async (req, res) => {
  try {
    const usados = await planes.escaneosDelMes(req.usuario.id);
    const limite = planes.limiteDe(req.usuario.plan);

    res.json({
      id: req.usuario.id,
      email: req.usuario.email,
      whatsapp: req.usuario.whatsapp_phone,
      driveConectado: Boolean(req.usuario.drive_tokens),
      plan: req.usuario.plan,
      idioma: req.usuario.idioma || null,
      moneda: req.usuario.moneda || null,
      escaneosUsados: usados,
      escaneosLimite: limite === Infinity ? null : limite,
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

module.exports = router;
