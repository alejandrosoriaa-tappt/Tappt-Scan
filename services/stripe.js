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
 * Es **suscripción anual**, no pago único: con pago único habría que
 * perseguir a cada usuario cada año, y en la práctica eso significa perder
 * la renovación. Stripe cobra solo y avisa por webhook.
 *
 * El cobro NUNCA pasa por la app nativa (evita la comisión de 15-30% de
 * Apple/Google): el link se manda por WhatsApp y se paga en el navegador.
 * Checkout además da tarjetas internacionales, Apple Pay y Google Pay sin
 * trabajo extra.
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
    mode: 'subscription',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: divisa,
          unit_amount: aCentavos(monto),
          recurring: { interval: 'year' },
          product_data: { name: precio.titulo[usuario.idioma === 'en' ? 'en' : 'es'] },
        },
      },
    ],
    // Amarra la sesión con nuestro registro y con el usuario. `metadata` se
    // copia a la suscripción para poder identificarla en las renovaciones.
    client_reference_id: pago.id,
    customer: usuario.stripe_customer_id || undefined,
    customer_email: usuario.stripe_customer_id ? undefined : usuario.email || undefined,
    metadata: { user_id: usuario.id, plan, pago_id: pago.id },
    subscription_data: { metadata: { user_id: usuario.id, plan } },
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

// Portal de facturación: el usuario cancela o cambia su tarjeta desde ahí.
// Se abre por WhatsApp, igual que el cobro.
async function portalDeCliente(usuario) {
  if (!usuario.stripe_customer_id) return null;

  const sesion = await cliente().billingPortal.sessions.create({
    customer: usuario.stripe_customer_id,
    return_url: process.env.STRIPE_SUCCESS_URL || 'https://tappt.lat/scan',
  });

  return sesion.url;
}

async function traerSuscripcion(id) {
  return cliente().subscriptions.retrieve(id);
}

module.exports = { crearLinkDePago, verificarEvento, portalDeCliente, traerSuscripcion };
