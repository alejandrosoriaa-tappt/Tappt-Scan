const supabase = require('./supabase');

const LIMITES = {
  gratis: 5,
  personal: Infinity,
  negocio: Infinity,
};

const PRECIOS = {
  personal: { titulo: 'TapptScan Personal (1 año)', monto: 299 },
  negocio: { titulo: 'TapptScan Negocio (1 año)', monto: 499 },
};

function limiteDe(plan) {
  return LIMITES[plan] ?? LIMITES.gratis;
}

function inicioDelMes() {
  const ahora = new Date();
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();
}

async function escaneosDelMes(userId) {
  const { count, error } = await supabase
    .from('scan_documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', inicioDelMes());

  if (error) throw error;
  return count || 0;
}

// Devuelve { permitido, usados, limite } — el webhook lo consulta antes de
// procesar una imagen.
async function puedeEscanear(usuario) {
  const limite = limiteDe(usuario.plan);
  if (limite === Infinity) return { permitido: true, usados: 0, limite };

  const usados = await escaneosDelMes(usuario.id);
  return { permitido: usados < limite, usados, limite };
}

module.exports = { LIMITES, PRECIOS, limiteDe, puedeEscanear, escaneosDelMes };
