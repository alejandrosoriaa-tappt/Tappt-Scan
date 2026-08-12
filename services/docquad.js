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

/**
 * Contrato de producto para cámara/WhatsApp.
 *
 * Si DocQuad no tiene evidencia suficiente, NO devuelve cuatro puntos
 * "aproximados": esquinas=null obliga a la UI a seguir en BUSCANDO y al
 * flujo sin UI a conservar la foto original. Es preferible no recortar a
 * destruir un documento por un falso positivo.
 */
async function detectarDocumento(buffer) {
  const detector = await obtenerDetector();
  const resultado = await detector.detectarBuffer(buffer);

  if (!resultado.valid) {
    return {
      esquinas: null,
      confiable: false,
      fuente: 'docquad',
      razon: resultado.suspiciousReason || 'INVALID_GEOMETRY',
      diagnostico: {
        area: resultado.area,
        minConfidenceZ: resultado.minConfidenceZ,
        mask: resultado.mask,
        timing: resultado.timing,
      },
    };
  }

  const esquinas = resultado.corners.map((p) => ({
    x: Math.max(0, Math.min(1, p.x)),
    y: Math.max(0, Math.min(1, p.y)),
  }));

  return {
    esquinas,
    confiable: true,
    fuente: 'docquad',
    diagnostico: {
      area: resultado.area,
      minConfidenceZ: resultado.minConfidenceZ,
      mask: resultado.mask,
      timing: resultado.timing,
    },
  };
}

module.exports = {
  detectarDocumento,
  obtenerDetector,
  prepararDetector,
  estadoDetector,
};
