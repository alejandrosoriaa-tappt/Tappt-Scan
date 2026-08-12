'use strict';

const { DocQuadDetector } = require('../scanner/docquad/detector');
const { OpenCvDocumentDetector } = require('../scanner/opencv/detector');

let detectorPromise = null;
let detectorListo = null;
let ultimoError = null;
let inicioCarga = null;

let fallbackPromise = null;
let fallbackListo = null;
let ultimoErrorFallback = null;
let inicioCargaFallback = null;

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

function prepararFallback() {
  if (fallbackListo) return Promise.resolve(fallbackListo);
  if (fallbackPromise) return fallbackPromise;

  inicioCargaFallback = Date.now();
  ultimoErrorFallback = null;

  fallbackPromise = new OpenCvDocumentDetector()
    .init()
    .then((detector) => {
      fallbackListo = detector;
      fallbackPromise = null;
      console.log(`[opencv] detector listo en ${Date.now() - inicioCargaFallback}ms`);
      return detector;
    })
    .catch((err) => {
      ultimoErrorFallback = err;
      fallbackPromise = null;
      console.error('[opencv] no se pudo preparar el fallback', err);
      throw err;
    });

  return fallbackPromise;
}

function prepararMotores() {
  return Promise.allSettled([prepararDetector(), prepararFallback()]);
}

async function obtenerDetector() {
  if (detectorListo) return detectorListo;
  return prepararDetector();
}

async function obtenerFallback() {
  if (fallbackListo) return fallbackListo;
  return prepararFallback();
}

function estadoDetector() {
  return {
    listo: Boolean(detectorListo),
    cargando: Boolean(detectorPromise),
    error: ultimoError ? ultimoError.message : null,
    ms: inicioCarga && !detectorListo ? Date.now() - inicioCarga : null,
    opencv: {
      listo: Boolean(fallbackListo),
      cargando: Boolean(fallbackPromise),
      error: ultimoErrorFallback ? ultimoErrorFallback.message : null,
      ms:
        inicioCargaFallback && !fallbackListo
          ? Date.now() - inicioCargaFallback
          : null,
    },
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

function diagnosticoDocQuad(resultado) {
  if (!resultado) return null;
  return {
    area: resultado.area,
    minConfidenceZ: resultado.minConfidenceZ,
    mask: resultado.mask,
    timing: resultado.timing,
    validation: resultado.validation,
    chosenSource: resultado.chosenSource || null,
    penalties: resultado.penalties || null,
    razon: resultado.suspiciousReason || null,
  };
}

function diagnosticoOpenCv(resultado) {
  if (!resultado) return null;
  return {
    source: resultado.source,
    area: resultado.area,
    score: resultado.score,
    aspect: resultado.aspect,
    angles: resultado.angles,
    epsilon: resultado.epsilon,
    thresholdValue: resultado.thresholdValue,
    timing: resultado.timing,
    razon: resultado.reason || null,
  };
}

async function intentarDocQuad(buffer) {
  if (!detectorListo) return null;
  try {
    return await detectorListo.detectarBuffer(buffer);
  } catch (err) {
    console.error('[docquad] inferencia falló; se intentará OpenCV', err.message);
    return { valid: false, suspiciousReason: 'DOCQUAD_ERROR', error: err.message };
  }
}

async function intentarOpenCv(buffer) {
  if (!fallbackListo) return null;
  try {
    return await fallbackListo.detectarBuffer(buffer);
  } catch (err) {
    console.error('[opencv] fallback falló', err.message);
    return { valid: false, reason: 'OPENCV_ERROR', error: err.message };
  }
}

/**
 * Detector compuesto de producto.
 *
 * Prioridad:
 *   1. DocQuad si está listo y sus guardrails lo consideran válido.
 *   2. OpenCV clásico si DocQuad es inválido/no está listo/falla.
 *   3. Sin esquinas si ambos fallan. Nunca se dibuja un quad inválido.
 *
 * OpenCV trabaja sobre una copia reducida (máx 720px) sólo para localizar
 * el papel. Las coordenadas se devuelven normalizadas y la perspectiva se
 * aplica después sobre la captura original full-resolution.
 */
async function detectarDocumento(buffer) {
  const docquad = await intentarDocQuad(buffer);

  if (docquad?.valid) {
    return {
      esquinas: normalizarEsquinas(docquad.corners),
      confiable: true,
      fuente: 'docquad',
      diagnostico: {
        docquad: diagnosticoDocQuad(docquad),
        opencv: null,
      },
    };
  }

  const opencv = await intentarOpenCv(buffer);

  if (opencv?.valid) {
    return {
      esquinas: normalizarEsquinas(opencv.corners),
      confiable: true,
      fuente: opencv.source || 'opencv',
      razonDocQuad:
        docquad?.suspiciousReason ||
        (docquad ? 'DOCQUAD_INVALID' : 'DOCQUAD_NOT_READY'),
      diagnostico: {
        docquad: diagnosticoDocQuad(docquad),
        opencv: diagnosticoOpenCv(opencv),
      },
    };
  }

  return {
    esquinas: null,
    confiable: false,
    fuente: 'scanner',
    razon:
      opencv?.reason ||
      docquad?.suspiciousReason ||
      (!docquad && !opencv ? 'DETECTORS_NOT_READY' : 'NO_VALID_QUAD'),
    diagnostico: {
      docquad: diagnosticoDocQuad(docquad),
      opencv: diagnosticoOpenCv(opencv),
    },
  };
}

module.exports = {
  detectarDocumento,
  obtenerDetector,
  obtenerFallback,
  prepararDetector,
  prepararFallback,
  prepararMotores,
  estadoDetector,
};
