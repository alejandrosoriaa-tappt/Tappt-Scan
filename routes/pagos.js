const express = require('express');
const router = express.Router();

const stripe = require('../services/stripe');
const iap = require('../services/iap');
const supabase = require('../services/supabase');
const whatsapp = require('../services/whatsapp');
const { t } = require('../services/i18n');
const { requireAuth } = require('../services/auth');

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

/**
 * Activa el plan a partir de una compra IAP ya verificada con la tienda.
 *
 * La app manda el recibo/token justo después de que `react-native-iap`
 * confirma la compra. El backend es quien de verdad valida contra Apple/
 * Google — nunca se confía en lo que diga el cliente por sí solo, o
 * cualquiera podría mandar un plan falso con la app modificada.
 */
router.post('/iap/verificar', requireAuth, async (req, res) => {
  const { plataforma, productoId, recibo, token } = req.body;

  try {
    let resultado;
    if (plataforma === 'apple') {
      if (!recibo) return res.status(400).json({ error: 'falta_recibo' });
      resultado = await iap.verificarApple(recibo);
    } else if (plataforma === 'google') {
      if (!productoId || !token) return res.status(400).json({ error: 'falta_producto_o_token' });
      resultado = await iap.verificarGoogle(productoId, token);
    } else {
      return res.status(400).json({ error: 'plataforma_no_soportada' });
    }

    const campoIdentidad =
      plataforma === 'apple' ? 'apple_original_transaction_id' : 'google_purchase_token';
    const valorIdentidad =
      plataforma === 'apple' ? resultado.originalTransactionId : resultado.purchaseToken;

    await supabase
      .from('scan_users')
      .update({ plan: resultado.plan, plan_vence: resultado.expiraEn, [campoIdentidad]: valorIdentidad })
      .eq('id', req.usuario.id);

    // Idempotente a propósito: este mismo endpoint atiende la compra Y el
    // "restaurar compras", que el usuario puede tocar las veces que quiera.
    // Sin esto, cada restauración dejaría una fila de pago repetida y las
    // cuentas de ingresos saldrían infladas.
    const { data: yaRegistrado } = await supabase
      .from('scan_payments')
      .select('id')
      .eq('user_id', req.usuario.id)
      .eq('payment_id', valorIdentidad)
      .eq('fuente', plataforma)
      .maybeSingle();

    if (!yaRegistrado) {
      await supabase.from('scan_payments').insert({
        user_id: req.usuario.id,
        plan: resultado.plan,
        monto: 0, // el monto real lo cobra la tienda directo; aquí solo se registra el evento
        moneda: req.usuario.moneda || 'mxn',
        estado: 'pagado',
        payment_id: valorIdentidad,
        fuente: plataforma,
      });
    }

    // Una compra restaurada puede estar VENCIDA: el recibo de Apple trae el
    // historial completo, no solo lo vigente. `planVigente` ya lo trata como
    // gratis, pero la app necesita saberlo para no decir "listo, restaurado"
    // cuando en realidad no quedó nada activo.
    const vigente = new Date(resultado.expiraEn) > new Date();

    res.json({ plan: resultado.plan, planVence: resultado.expiraEn, vigente });
  } catch (err) {
    console.error('[pagos] error verificando compra IAP', err);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
