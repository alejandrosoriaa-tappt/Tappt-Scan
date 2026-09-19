const supabase = require('./supabase');

const LIMITES = {
  gratis: 15,
  personal: Infinity,
  negocio: Infinity,
};

// Precios por moneda. Para salir a otros países basta agregar la divisa
// aquí — Stripe Checkout cobra en la que se le pase.
const PRECIOS = {
  personal: {
    titulo: { es: 'TapptScan Personal (1 año)', en: 'TapptScan Personal (1 year)' },
    montos: { mxn: 299, usd: 19, eur: 18 },
  },
  negocio: {
    titulo: { es: 'TapptScan Negocio (1 año)', en: 'TapptScan Business (1 year)' },
    montos: { mxn: 499, usd: 29, eur: 28 },
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
  return usuario.plan;
}

function limiteDe(plan) {
  return LIMITES[plan] ?? LIMITES.gratis;
}

// La prueba gratuita es una bolsa única de 15 documentos, no se reinicia
// cada mes. Así funciona como demostración real antes de contratar.
async function escaneosGratisUsados(userId) {
  const { count, error } = await supabase
    .from('scan_documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

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

// El control de gastos (hoja de cálculo y preguntas por chat) es el
// beneficio que justifica el plan Negocio.
function tieneControlDeGastos(usuario) {
  return planVigente(usuario) === 'negocio';
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
