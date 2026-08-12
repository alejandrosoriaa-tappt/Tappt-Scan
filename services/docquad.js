'use strict';

const { DocQuadDetector } = require('../scanner/docquad/detector');

let detectorPromise = null;
let detectorListo = null;
let ultimoError = null;
let inicioCarga = null;

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
 * Un resultado que los guardrails de DocQuad marcan como sospechoso NO se
 * muestra en el overlay y NO se usa para recortar. Antes conservábamos el
 * quad si era geométricamente convexo aunque la confianza fuese baja; eso
 * hacía visibles franjas internas falsas como si fueran sugerencias útiles.
 * La UI debe quedarse en BUSCANDO hasta tener un quad realmente válido.
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
    chosenSource: resultado.chosenSource || null,
    penalties: resultado.penalties || null,
  };

  if (!resultado.valid) {
    return {
      esquinas: null,
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
