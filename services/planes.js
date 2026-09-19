const supabase = require('./supabase');

const LIMITES = {
  gratis: 15,
  pro: Infinity,
  // Conservados únicamente para respetar suscripciones anteriores.
  personal: Infinity,
  negocio: Infinity,
};

// Precios por moneda. Para salir a otros países basta agregar la divisa
// aquí — Stripe Checkout cobra en la que se le pase.
const PRECIOS = {
  pro: {
    titulo: { es: 'Tappt Pro (1 año)', en: 'Tappt Pro (1 year)' },
    montos: { mxn: 490, usd: 29, eur: 28 },
  },
};

/**
 * El plan vigente del usuario.
 *
 * Un plan vencido NO es un plan: sin esta comprobación, quien pagó una vez
 * se queda con el beneficio para siempre. `plan_vence` se fija a un año al
 * confirmarse el pago (ver `routes/pagos.js`).
 */
function planVigente(usuario) {
  if (!usuario?.plan || usuario.plan === 'gratis') return 'gratis';
  if (usuario.plan_vence && new Date(usuario.plan_vence) < new Date()) return 'gratis';
  // Los planes históricos mantienen lo que ya pagaron, pero comercialmente
  // desde V19 existe una sola membresía.
  if (usuario.plan === 'personal' || usuario.plan === 'negocio') return 'pro';
  return usuario.plan === 'pro' ? 'pro' : 'gratis';
}

function limiteDe(plan) {
  return LIMITES[plan] ?? LIMITES.gratis;
}

// El plan gratuito dispone de 15 documentos en una ventana móvil de 30 días.
// Esto mantiene vivo el uso orgánico y la marca de agua sin regalar volumen
// ilimitado a quien procesa documentos de forma intensiva.
async function escaneosGratisUsados(userId) {
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('scan_documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', desde);

  if (error) throw error;
  return count || 0;
}

// Devuelve { permitido, usados, limite } — el webhook lo consulta antes de
// procesar una imagen.
async function puedeEscanear(usuario) {
  const limite = limiteDe(planVigente(usuario));
  if (limite === Infinity) return { permitido: true, usados: 0, limite };

  const usados = await escaneosGratisUsados(usuario.id);
  return { permitido: usados < limite, usados, limite };
}

// Tappt Pro incluye el control de gastos (hoja y preguntas por chat).
function tieneControlDeGastos(usuario) {
  return planVigente(usuario) === 'pro';
}

module.exports = {
  LIMITES,
  planVigente,
  PRECIOS,
  limiteDe,
  puedeEscanear,
  escaneosGratisUsados,
  tieneControlDeGastos,
};
