/**
 * La taxonomía de TapptScan: el árbol de carpetas que se le crea al usuario
 * al conectar su Drive, y contra el que clasifica Claude.
 *
 * Es **una sola fuente de verdad** para tres cosas:
 *   1. las carpetas que se crean en el onboarding,
 *   2. el catálogo cerrado que se le pasa al modelo en el prompt,
 *   3. la validación de lo que el modelo responde.
 *
 * Cambiar el árbol aquí cambia las tres a la vez. Cualquier sección o
 * subcarpeta que el modelo invente y no esté en esta lista se descarta y el
 * documento cae en `99 · Por revisar`.
 *
 * Los prefijos numéricos existen porque Drive ordena alfabéticamente: sin
 * ellos "Casa" quedaría antes que "Dinero" y el orden sería arbitrario.
 */

const ESTRUCTURA = [
  {
    clave: 'personal',
    carpeta: '01 · Personal',
    sub: [
      { clave: 'identificaciones', carpeta: 'Identificaciones' },
      { clave: 'pasaportes', carpeta: 'Pasaportes y visas' },
      { clave: 'actas', carpeta: 'Actas y certificados' },
      { clave: 'otros', carpeta: 'Otros' },
    ],
  },
  {
    clave: 'dinero',
    carpeta: '02 · Dinero',
    sub: [
      { clave: 'recibos', carpeta: 'Recibos y tickets' },
      { clave: 'facturas', carpeta: 'Facturas' },
      { clave: 'estados_cuenta', carpeta: 'Estados de cuenta' },
      { clave: 'impuestos', carpeta: 'Impuestos' },
      { clave: 'comprobantes_pago', carpeta: 'Comprobantes de pago' },
    ],
  },
  {
    clave: 'casa',
    carpeta: '03 · Casa',
    sub: [
      { clave: 'servicios', carpeta: 'Servicios' },
      { clave: 'contratos', carpeta: 'Contratos' },
      { clave: 'garantias', carpeta: 'Garantías y compras' },
      { clave: 'propiedades', carpeta: 'Propiedades' },
    ],
  },
  {
    clave: 'trabajo',
    carpeta: '04 · Trabajo',
    sub: [
      { clave: 'contratos', carpeta: 'Contratos' },
      { clave: 'recibos', carpeta: 'Recibos y comprobantes' },
      { clave: 'otros', carpeta: 'Otros' },
    ],
  },
  {
    clave: 'salud',
    carpeta: '05 · Salud',
    sub: [
      { clave: 'estudios', carpeta: 'Estudios' },
      { clave: 'recetas', carpeta: 'Recetas' },
      { clave: 'resultados', carpeta: 'Resultados' },
      { clave: 'seguros', carpeta: 'Seguros' },
    ],
  },
  {
    clave: 'legal',
    carpeta: '06 · Legal',
    sub: [
      { clave: 'contratos', carpeta: 'Contratos' },
      { clave: 'escrituras', carpeta: 'Escrituras' },
      { clave: 'poderes', carpeta: 'Poderes' },
      { clave: 'otros', carpeta: 'Otros' },
    ],
  },
  {
    clave: 'vehiculos',
    carpeta: '07 · Vehículos',
    sub: [
      { clave: 'documentos', carpeta: 'Documentos' },
      { clave: 'seguros', carpeta: 'Seguros' },
      { clave: 'servicios', carpeta: 'Servicios' },
      { clave: 'multas', carpeta: 'Multas y pagos' },
    ],
  },
  {
    clave: 'por_revisar',
    carpeta: '99 · Por revisar',
    sub: [],
  },
];

const POR_REVISAR = ESTRUCTURA.find((s) => s.clave === 'por_revisar');

// Todas las rutas del andamiaje, para crearlas de golpe en el onboarding.
// `99 · Por revisar` no tiene subcarpetas: es un buzón plano.
function rutasDelAndamiaje() {
  const rutas = [];
  for (const seccion of ESTRUCTURA) {
    rutas.push([seccion.carpeta]);
    for (const sub of seccion.sub) rutas.push([seccion.carpeta, sub.carpeta]);
  }
  return rutas;
}

/**
 * Traduce lo que respondió el modelo a nombres de carpeta reales.
 * Devuelve siempre algo válido: si la sección no existe, o la subcarpeta no
 * pertenece a esa sección, cae en `99 · Por revisar`.
 */
function carpetasDe(seccionClave, subClave) {
  const seccion = ESTRUCTURA.find((s) => s.clave === normalizar(seccionClave));
  if (!seccion || seccion.clave === 'por_revisar') {
    return { tramos: [POR_REVISAR.carpeta], confiable: false };
  }

  const sub = seccion.sub.find((x) => x.clave === normalizar(subClave));
  if (!sub) {
    // La sección se entendió pero la subcarpeta no: mejor dejarlo en el
    // buzón que meterlo en una subcarpeta al azar.
    return { tramos: [POR_REVISAR.carpeta], confiable: false };
  }

  return { tramos: [seccion.carpeta, sub.carpeta], confiable: true };
}

function normalizar(valor) {
  return valor ? String(valor).trim().toLowerCase().replace(/[\s-]+/g, '_') : null;
}

// Catálogo en texto para el prompt del clasificador.
function catalogoParaPrompt() {
  return ESTRUCTURA.filter((s) => s.sub.length)
    .map((s) => `- ${s.clave}: ${s.sub.map((x) => x.clave).join(', ')}`)
    .join('\n');
}

module.exports = {
  ESTRUCTURA,
  POR_REVISAR,
  rutasDelAndamiaje,
  carpetasDe,
  catalogoParaPrompt,
};
