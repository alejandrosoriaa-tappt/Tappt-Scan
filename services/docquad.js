'use strict';

const { DocQuadDetector } = require('../scanner/docquad/detector');

let detectorPromise = null;
let detectorListo = null;
let ultimoError = null;
let inicioCarga = null;

/**
 * Inicia la descarga/carga del modelo una sola vez.
 *
 * DocQuad pesa ~13.4 MB y ORT/WASM necesita inicializar su runtime. Ese trabajo
 * NO debe ocurrir por primera vez dentro de una request de cámara: en Railway
 * puede superar el tiempo del proxy y manifestarse como HTTP 502 aunque el
 * código del endpoint tenga try/catch. Lo calentamos en background al arrancar
 * el servidor y dejamos que las requests consulten el estado sin bloquear.
 */
function prepararDetector() {
  if (detectorListo) return Promise.resolve(detectorListo);
  if (detectorPromise) return detectorPromise;

  inicioCarga = Date.now();
  ultimoError = null;

  detectorPromise = new DocQuadDetector()
    .init()
    .then((detector) => {
      detectorListo = detector;
      detectorPromise = null;
      console.log(`[docquad] modelo listo en ${Date.now() - inicioCarga}ms`);
      return detector;
    })
    .catch((err) => {
      ultimoError = err;
      detectorPromise = null;
      console.error('[docquad] no se pudo preparar el modelo', err);
      throw err;
    });

  return detectorPromise;
}

async function obtenerDetector() {
  if (detectorListo) return detectorListo;
  return prepararDetector();
}

function estadoDetector() {
  return {
    listo: Boolean(detectorListo),
    cargando: Boolean(detectorPromise),
    error: ultimoError ? ultimoError.message : null,
    ms: inicioCarga && !detectorListo ? Date.now() - inicioCarga : null,
  };
}

function normalizarEsquinas(corners) {
  if (!Array.isArray(corners) || corners.length !== 4) return null;
  const normalizadas = corners.map((p) => ({
    x: Math.max(0, Math.min(1, p.x)),
    y: Math.max(0, Math.min(1, p.y)),
  }));
  return normalizadas.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    ? normalizadas
    : null;
}

/**
 * Contrato de producto para cámara/WhatsApp.
 *
 * Regla importante:
 * - geometría inválida => no se devuelve quad;
 * - geometría válida pero confianza baja => se devuelve como detección PARCIAL
 *   (`confiable:false`) para que la cámara pueda mostrar lo que DocQuad está
 *   proponiendo sin usarlo todavía como recorte final;
 * - geometría válida + confianza suficiente => `confiable:true`.
 *
 * Esto mantiene la seguridad del guardado (solo una detección confiable se usa
 * automáticamente) pero evita que el overlay quede completamente ciego cuando
 * el modelo sí ve la hoja y únicamente falla un guardrail de confianza.
 */
async function detectarDocumento(buffer) {
  const detector = await obtenerDetector();
  const resultado = await detector.detectarBuffer(buffer);

  const diagnostico = {
    area: resultado.area,
    minConfidenceZ: resultado.minConfidenceZ,
    mask: resultado.mask,
    timing: resultado.timing,
    validation: resultado.validation,
  };

  if (!resultado.valid) {
    const geometriaValida = Boolean(resultado.validation?.geometryValid);
    const esquinas = geometriaValida ? normalizarEsquinas(resultado.corners) : null;

    return {
      esquinas,
      confiable: false,
      fuente: 'docquad',
      razon: resultado.suspiciousReason || 'INVALID_GEOMETRY',
      diagnostico,
    };
  }

  return {
    esquinas: normalizarEsquinas(resultado.corners),
    confiable: true,
    fuente: 'docquad',
    diagnostico,
  };
}

module.exports = {
  detectarDocumento,
  obtenerDetector,
  prepararDetector,
  estadoDetector,
};
