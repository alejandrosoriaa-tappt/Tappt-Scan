const axios = require('axios');
const supabase = require('./supabase');
const { PRECIOS } = require('./planes');

const API = 'https://api.mercadopago.com';

// El cobro NUNCA pasa por la app nativa (evita la comisión de las tiendas):
// se genera un link y se manda por WhatsApp.
async function crearLinkDePago(usuario, plan) {
  const precio = PRECIOS[plan];
  if (!precio) throw new Error(`plan_desconocido: ${plan}`);

  const { data: pago, error } = await supabase
    .from('scan_payments')
    .insert({ user_id: usuario.id, plan, monto: precio.monto, estado: 'pendiente' })
    .select()
    .single();
  if (error) throw error;

  const { data } = await axios.post(
    `${API}/checkout/preferences`,
    {
      items: [
        {
          title: precio.titulo,
          quantity: 1,
          unit_price: precio.monto,
          currency_id: 'MXN',
        },
      ],
      external_reference: pago.id,
      notification_url: process.env.MERCADOPAGO_NOTIFICATION_URL,
    },
    { headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` } }
  );

  await supabase
    .from('scan_payments')
    .update({ preference_id: data.id, link: data.init_point })
    .eq('id', pago.id);

  return data.init_point;
}

async function consultarPago(paymentId) {
  const { data } = await axios.get(`${API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
  });
  return data;
}

module.exports = { crearLinkDePago, consultarPago };
