const express = require('express');
const router = express.Router();

const stripe = require('../services/stripe');
const supabase = require('../services/supabase');
const whatsapp = require('../services/whatsapp');
const { t } = require('../services/i18n');

const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Webhook de Stripe.
 *
 * Necesita el cuerpo CRUDO para verificar la firma, por eso `server.js`
 * monta `express.raw` en esta ruta antes del parser JSON global.
 */
router.post('/webhook', async (req, res) => {
  let evento;
  try {
    evento = stripe.verificarEvento(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('[pagos] firma inválida', err.message);
    return res.status(400).send(`firma_invalida: ${err.message}`);
  }

  res.json({ recibido: true }); // ack inmediato; Stripe reintenta si tardamos

  if (evento.type !== 'checkout.session.completed') return;

  try {
    const sesion = evento.data.object;
    if (sesion.payment_status !== 'paid') return;

    const pagoId = sesion.client_reference_id;
    if (!pagoId) return;

    const { data: registro, error } = await supabase
      .from('scan_payments')
      .select('*')
      .eq('id', pagoId)
      .maybeSingle();
    if (error) throw error;

    // Stripe puede reintentar el mismo evento: si ya lo procesamos, salir.
    if (!registro || registro.estado === 'pagado') return;

    await supabase
      .from('scan_payments')
      .update({ estado: 'pagado', payment_id: sesion.payment_intent || sesion.id })
      .eq('id', registro.id);

    await supabase
      .from('scan_users')
      .update({
        plan: registro.plan,
        plan_vence: new Date(Date.now() + UN_ANIO_MS).toISOString(),
      })
      .eq('id', registro.user_id);

    const { data: usuario } = await supabase
      .from('scan_users')
      .select('whatsapp_phone, idioma')
      .eq('id', registro.user_id)
      .maybeSingle();

    if (usuario?.whatsapp_phone) {
      await whatsapp.sendText(
        usuario.whatsapp_phone,
        t(usuario.idioma, 'planActivo', { plan: registro.plan })
      );
    }
  } catch (err) {
    console.error('[pagos] error procesando evento', err);
  }
});

module.exports = router;
