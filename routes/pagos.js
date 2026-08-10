const express = require('express');
const router = express.Router();

const stripe = require('../services/stripe');
const supabase = require('../services/supabase');
const whatsapp = require('../services/whatsapp');
const { t } = require('../services/i18n');

/**
 * Webhook de Stripe.
 *
 * Necesita el cuerpo CRUDO para verificar la firma, por eso `server.js`
 * monta `express.raw` en esta ruta antes del parser JSON global.
 *
 * Cuatro eventos cubren el ciclo completo de una suscripción:
 *   - `checkout.session.completed`  → primera compra
 *   - `invoice.paid`                → renovación anual
 *   - `invoice.payment_failed`      → la tarjeta falló
 *   - `customer.subscription.deleted` → canceló y ya venció su periodo
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

  try {
    const manejador = {
      'checkout.session.completed': primeraCompra,
      'invoice.paid': renovacion,
      'invoice.payment_failed': cobroFallido,
      'customer.subscription.deleted': cancelacion,
    }[evento.type];

    if (manejador) await manejador(evento.data.object);
  } catch (err) {
    console.error(`[pagos] error procesando ${evento.type}`, err);
  }
});

async function traerUsuario(campo, valor) {
  const { data } = await supabase.from('scan_users').select('*').eq(campo, valor).maybeSingle();
  return data;
}

async function avisar(usuario, clave, valores) {
  if (!usuario?.whatsapp_phone) return;
  await whatsapp.sendText(usuario.whatsapp_phone, t(usuario.idioma, clave, valores));
}

// Fecha hasta la que el plan queda pagado, según la propia suscripción.
async function vigenciaDe(suscripcionId) {
  const suscripcion = await stripe.traerSuscripcion(suscripcionId);
  return new Date(suscripcion.current_period_end * 1000).toISOString();
}

async function primeraCompra(sesion) {
  if (sesion.payment_status !== 'paid') return;

  const pagoId = sesion.client_reference_id;
  if (!pagoId) return;

  const { data: registro } = await supabase
    .from('scan_payments')
    .select('*')
    .eq('id', pagoId)
    .maybeSingle();

  // Stripe reintenta el mismo evento: si ya se procesó, salir.
  if (!registro || registro.estado === 'pagado') return;

  await supabase
    .from('scan_payments')
    .update({ estado: 'pagado', payment_id: sesion.subscription || sesion.id })
    .eq('id', registro.id);

  await supabase
    .from('scan_users')
    .update({
      plan: registro.plan,
      plan_vence: await vigenciaDe(sesion.subscription),
      stripe_customer_id: sesion.customer,
      stripe_subscription_id: sesion.subscription,
    })
    .eq('id', registro.user_id);

  const usuario = await traerUsuario('id', registro.user_id);
  await avisar(usuario, 'planActivo', { plan: registro.plan });
}

// Renovación anual. La primera factura de una suscripción también dispara
// este evento, pero ahí `primeraCompra` ya hizo el trabajo.
async function renovacion(factura) {
  if (!factura.subscription || factura.billing_reason === 'subscription_create') return;

  const usuario = await traerUsuario('stripe_customer_id', factura.customer);
  if (!usuario) return;

  await supabase
    .from('scan_users')
    .update({ plan_vence: await vigenciaDe(factura.subscription) })
    .eq('id', usuario.id);

  await avisar(usuario, 'planRenovado', { plan: usuario.plan });
}

/**
 * Cobro fallido. NO se baja el plan aquí: Stripe reintenta durante días y
 * bajarlo al primer intento castigaría a quien solo cambió de tarjeta. Se
 * avisa para que lo arregle; si nunca paga, Stripe cancela la suscripción y
 * eso sí baja el plan.
 */
async function cobroFallido(factura) {
  const usuario = await traerUsuario('stripe_customer_id', factura.customer);
  if (!usuario) return;

  await avisar(usuario, 'cobroFallido');
}

async function cancelacion(suscripcion) {
  const usuario = await traerUsuario('stripe_subscription_id', suscripcion.id);
  if (!usuario) return;

  await supabase
    .from('scan_users')
    .update({ plan: 'gratis', plan_vence: null, stripe_subscription_id: null })
    .eq('id', usuario.id);

  await avisar(usuario, 'planTerminado');
}

module.exports = router;
