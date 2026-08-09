/**
 * Convierte lo que Claude extrajo en una ruta de carpetas y un nombre de
 * archivo — la parte que hace que el usuario sienta que el documento se
 * guardó solo.
 *
 *   foto de un recibo de luz  →  CFE_Agosto_2026_$1,847.pdf
 *                                en  TapptScan/Casa/Servicios/CFE/2026/
 */

const MESES = {
  es: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

const AMBITOS = ['Casa', 'Trabajo', 'Personal', 'Vehiculo'];
const CATEGORIAS = [
  'Servicios', 'Impuestos', 'Salud', 'Legal', 'Educacion',
  'Compras', 'Banco', 'Seguros', 'Identificaciones', 'Otros',
];

// Al prompt se le pide la marca corta, pero si el modelo devuelve
// "Office Depot México, S.A. de C.V." el nombre queda impresentable.
const SUFIJOS_LEGALES =
  /[,.]?\s*\b(S\.? ?A\.? ?P\.? ?I\.?|S\.? ?A\.? ?B\.?|S\.? ?A\.?|S\.? ?de ?R\.? ?L\.?|S\.? ?L\.?|de ?C\.? ?V\.?|C\.? ?V\.?|Inc|LLC|Ltd|Corp|GmbH)\b\.?/gi;

// Google Drive acepta casi cualquier cosa en un nombre, pero una carpeta
// con "/" o saltos de línea vuelve la ruta ilegible y rompe el explorador.
function limpiarSegmento(valor, maximo = 40) {
  if (!valor) return null;
  const limpio = String(valor)
    .replace(SUFIJOS_LEGALES, ' ')
    .replace(/[\/\\<>:"|?*]/g, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximo)
    .replace(/[\s.,-]+$/, '')
    .trim();
  return limpio || null;
}

// Solo se aceptan valores del catálogo: si el modelo inventa un ámbito, se
// descarta en vez de crear carpetas basura en el Drive del usuario.
function deCatalogo(valor, catalogo) {
  if (!valor) return null;
  const normalizado = String(valor).trim().toLowerCase();
  return catalogo.find((v) => v.toLowerCase() === normalizado) || null;
}

function periodoDe(extraido) {
  const desdeFecha = extraido.fecha ? new Date(`${extraido.fecha}T00:00:00Z`) : null;
  const valida = desdeFecha && !Number.isNaN(desdeFecha.getTime());

  const mes = extraido.periodo_mes || (valida ? desdeFecha.getUTCMonth() + 1 : null);
  const anio = extraido.periodo_anio || (valida ? desdeFecha.getUTCFullYear() : null);

  return {
    mes: mes >= 1 && mes <= 12 ? mes : null,
    anio: anio >= 1900 && anio <= 2200 ? anio : null,
  };
}

/**
 * Ruta de carpetas bajo `TapptScan/`, de lo general a lo específico:
 *   ámbito → categoría → emisor → año
 *
 * Los tramos que no se pudieron determinar se omiten, así que un documento
 * mal leído cae en algo como `Otros/` en vez de `null/undefined/`.
 */
function rutaPara(extraido) {
  const { anio } = periodoDe(extraido);

  const tramos = [
    deCatalogo(extraido.ambito, AMBITOS),
    deCatalogo(extraido.categoria, CATEGORIAS) || 'Otros',
    limpiarSegmento(extraido.emisor),
    anio ? String(anio) : null,
  ];

  return tramos.filter(Boolean);
}

function montoLegible(monto, moneda) {
  if (monto == null || Number.isNaN(Number(monto))) return null;

  const numero = Number(monto).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(Number(monto)) ? 0 : 2,
    maximumFractionDigits: 2,
  });

  // El símbolo va sin espacio para que el nombre se lea de corrido:
  // CFE_Agosto_2026_$1,847.pdf
  const simbolo = moneda === 'USD' || moneda === 'MXN' || !moneda ? '$' : '';
  return `${simbolo}${numero}`;
}

/**
 * Nombre del archivo: emisor, periodo y monto, en ese orden.
 * Lo que falte se omite; si no queda nada útil, cae a algo con fecha.
 */
function nombreArchivo(extraido, idioma = 'es', extension = 'pdf') {
  const { mes, anio } = periodoDe(extraido);
  const meses = MESES[idioma] || MESES.es;

  const partes = [
    limpiarSegmento(extraido.emisor),
    mes ? meses[mes - 1] : null,
    anio ? String(anio) : null,
    montoLegible(extraido.monto, extraido.moneda),
  ].filter(Boolean);

  if (!partes.length) {
    const hoy = new Date().toISOString().slice(0, 10);
    partes.push(limpiarSegmento(extraido.tipo) || 'documento', hoy);
  }

  // Espacios a guion bajo; el resto ya viene saneado.
  return `${partes.join('_').replace(/\s+/g, '_')}.${extension}`;
}

// Ruta legible para mostrarle al usuario en el chat: /Casa/Servicios/CFE/2026/
function rutaLegible(tramos) {
  return `/${tramos.join('/')}/`;
}

module.exports = { rutaPara, nombreArchivo, rutaLegible, periodoDe, AMBITOS, CATEGORIAS, MESES };
