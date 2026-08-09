const Stripe = require('stripe');
const supabase = require('./supabase');
const { PRECIOS } = require('./planes');

let clienteCache = null;
function cliente() {
  if (!clienteCache) clienteCache = new Stripe(process.env.STRIPE_SECRET_KEY);
  return clienteCache;
}

// Stripe cobra en la unidad mínima (centavos).
function aCentavos(monto) {
  return Math.round(monto * 100);
}

/**
 * Crea una sesión de Checkout y devuelve su URL.
 *
 * El cobro NUNCA pasa por la app nativa (evita la comisión de 15-30% de
 * Apple/Google): el link se manda por WhatsApp y el usuario paga en el
 * navegador. Checkout además nos da tarjetas internacionales, Apple Pay y
 * Google Pay sin trabajo extra, que es el punto de usar Stripe.
 */
async function crearLinkDePago(usuario, plan, moneda) {
  const precio = PRECIOS[plan];
  if (!precio) throw new Error(`plan_desconocido: ${plan}`);

  const divisa = (moneda || usuario.moneda || process.env.STRIPE_MONEDA || 'mxn').toLowerCase();
  const monto = precio.montos[divisa];
  if (!monto) throw new Error(`moneda_no_soportada: ${divisa}`);

  const { data: pago, error } = await supabase
    .from('scan_payments')
    .insert({ user_id: usuario.id, plan, monto, moneda: divisa, estado: 'pendiente' })
    .select()
    .single();
  if (error) throw error;

  const sesion = await cliente().checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: divisa,
          unit_amount: aCentavos(monto),
          product_data: { name: precio.titulo[usuario.idioma === 'en' ? 'en' : 'es'] },
        },
      },
    ],
    // `client_reference_id` es lo que amarra la sesión con nuestro registro:
    // el webhook lo lee para saber a quién subirle el plan.
    client_reference_id: pago.id,
    customer_email: usuario.email || undefined,
    metadata: { user_id: usuario.id, plan, pago_id: pago.id },
    success_url: process.env.STRIPE_SUCCESS_URL || 'https://tappt.lat/scan/gracias',
    cancel_url: process.env.STRIPE_CANCEL_URL || 'https://tappt.lat/scan',
  });

  await supabase
    .from('scan_payments')
    .update({ session_id: sesion.id, link: sesion.url })
    .eq('id', pago.id);

  return sesion.url;
}

// Verifica la firma del webhook. Sin esto cualquiera podría mandarnos un
// "pago aprobado" falso y regalarse un plan.
function verificarEvento(cuerpoCrudo, firma) {
  return cliente().webhooks.constructEvent(
    cuerpoCrudo,
    firma,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

module.exports = { crearLinkDePago, verificarEvento };
