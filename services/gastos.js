const supabase = require('./supabase');
const taxonomia = require('./taxonomia');

/**
 * Agregaciones de gasto.
 *
 * El modelo NUNCA toca la base: traduce la pregunta a un objeto de filtros
 * (`services/consultas.js`) y aquí se valida campo por campo antes de
 * construir la consulta. Un LLM escribiendo consultas contra los datos de
 * un usuario es una inyección esperando a pasar.
 */

const LIMITE_FILAS = 2000;

// No basta con que tenga forma de fecha: "2026-13-99" pasa el patrón pero
// no existe, y llegaría a la consulta como basura.
function fechaValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;

  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return null;

  // JavaScript "corrige" el 31 de febrero al 3 de marzo; si al volver a
  // formatear no coincide, la fecha original no existía.
  return fecha.toISOString().slice(0, 10) === valor ? valor : null;
}

// Texto libre que acaba en un `ilike`. Se quitan los comodines de PostgREST
// y los caracteres que enredan la consulta; el resto es inofensivo porque
// supabase-js parametriza, pero conviene no darle superficie.
function textoBusqueda(valor) {
  const limpio = String(valor)
    .slice(0, 60)
    .replace(/[%_,()'"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpio || null;
}

function saneaFiltros(filtros = {}) {
  const limpio = {};

  const desde = fechaValida(filtros.desde);
  const hasta = fechaValida(filtros.hasta);
  if (desde) limpio.desde = desde;
  if (hasta) limpio.hasta = hasta;

  // Un rango invertido no devuelve nada y parece un bug del producto.
  if (limpio.desde && limpio.hasta && limpio.desde > limpio.hasta) {
    [limpio.desde, limpio.hasta] = [limpio.hasta, limpio.desde];
  }

  const categoria = taxonomia.categoriaGastoValida(filtros.categoria_gasto);
  if (categoria) limpio.categoria_gasto = categoria;

  if (filtros.emisor) {
    const emisor = textoBusqueda(filtros.emisor);
    if (emisor) limpio.emisor = emisor;
  }

  if (filtros.proyecto) {
    const proyecto = textoBusqueda(filtros.proyecto);
    if (proyecto) limpio.proyecto = proyecto;
  }

  return limpio;
}

async function consultar(userId, filtrosCrudos = {}) {
  const filtros = saneaFiltros(filtrosCrudos);

  let query = supabase
    .from('scan_documents')
    .select('fecha, emisor, monto, moneda, categoria_gasto, concepto, proyecto, nombre_archivo')
    .eq('user_id', userId)
    .eq('es_gasto', true)
    .not('monto', 'is', null)
    .order('fecha', { ascending: false })
    .limit(LIMITE_FILAS);

  if (filtros.desde) query = query.gte('fecha', filtros.desde);
  if (filtros.hasta) query = query.lte('fecha', filtros.hasta);
  if (filtros.categoria_gasto) query = query.eq('categoria_gasto', filtros.categoria_gasto);
  if (filtros.emisor) query = query.ilike('emisor', `%${filtros.emisor}%`);
  if (filtros.proyecto) query = query.ilike('proyecto', `%${filtros.proyecto}%`);

  const { data, error } = await query;
  if (error) throw error;

  return { filtros, documentos: data || [], resumen: resumir(data || []) };
}

function resumir(documentos) {
  const total = documentos.reduce((suma, d) => suma + (Number(d.monto) || 0), 0);

  const acumular = (campo) => {
    const mapa = {};
    for (const d of documentos) {
      const clave = d[campo] || 'sin_clasificar';
      mapa[clave] = (mapa[clave] || 0) + (Number(d.monto) || 0);
    }
    return Object.entries(mapa)
      .sort((a, b) => b[1] - a[1])
      .map(([clave, monto]) => ({ clave, monto }));
  };

  return {
    total,
    cantidad: documentos.length,
    porCategoria: acumular('categoria_gasto'),
    porEmisor: acumular('emisor').slice(0, 10),
  };
}

module.exports = { consultar, resumir, saneaFiltros };
