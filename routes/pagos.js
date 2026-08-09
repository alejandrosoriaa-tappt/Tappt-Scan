const express = require('express');
const router = express.Router();

const mercadopago = require('../services/mercadopago');
const supabase = require('../services/supabase');
const whatsapp = require('../services/whatsapp');

const UN_ANIO_MS = 365 * 24 * 60 * 60 * 1000;

// Webhook de MercadoPago: al confirmarse el pago, sube el plan del usuario.
router.post('/webhook', async (req, res) => {
  res.sendStatus(200); // ack inmediato

  try {
    const paymentId = req.body?.data?.id;
    if (!paymentId || req.body?.type !== 'payment') return;

    const pago = await mercadopago.consultarPago(paymentId);
    if (pago.status !== 'approved') return;

    const { data: registro, error } = await supabase
      .from('scan_payments')
      .select('*')
      .eq('id', pago.external_reference)
      .maybeSingle();
    if (error) throw error;
    if (!registro || registro.estado === 'pagado') return;

    await supabase
      .from('scan_payments')
      .update({ estado: 'pagado', payment_id: String(paymentId) })
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
      .select('whatsapp_phone')
      .eq('id', registro.user_id)
      .maybeSingle();

    if (usuario?.whatsapp_phone) {
      await whatsapp.sendText(
        usuario.whatsapp_phone,
        `Tu plan ${registro.plan} quedó activo. Ya tienes escaneos ilimitados y edición de PDF.`
      );
    }
  } catch (err) {
    console.error('[pagos] error procesando webhook', err);
  }
});

module.exports = router;
