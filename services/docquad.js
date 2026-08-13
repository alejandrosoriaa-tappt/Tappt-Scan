'use strict';

const { DocQuadDetector } = require('../scanner/docquad/detector');
const { OpenCvDocumentDetector } = require('../scanner/opencv/detector');
const { iou } = require('../scanner/fixtures/iou');

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

// Dos detectores independientes que caen sobre el mismo papel es la
// evidencia más fuerte que tenemos de que el papel está ahí. Medido en el
// banco de fixtures: cuando ambos aciertan su IoU mutuo pasa de 0.9; cuando
// uno se equivoca, se desploma. Ver `scripts/scanner-fixtures.js`.
const IOU_ACUERDO = 0.8;

/**
 * Detector compuesto de producto.
 *
 * Tres niveles de respuesta, no dos:
 *
 *   confiable  → se puede recortar solo. DocQuad pasa sus guardrails, o
 *                DocQuad y OpenCV coinciden en el mismo papel.
 *   parcial    → hay un quad con geometría válida pero sin evidencia
 *                suficiente. Se dibuja en pantalla para que el usuario lo
 *                vea y lo ajuste; NO se recorta solo.
 *   sin quad   → no hay nada que dibujar.
 *
 * El nivel intermedio existe porque antes faltaba, y eso costó caro: un
 * quad de DocQuad geométricamente perfecto pero marcado `suspicious` se
 * descartaba entero y la app no dibujaba nada. En el banco de fixtures ese
 * mismo quad descartado tiene IoU 0.948 contra el ground truth — era
 * correcto y lo tirábamos. `PEAK_SIGMA_THRESHOLD` (5.0, heredado de
 * MakeACopy) casi nunca se alcanza con fotos reales: los picos medidos van
 * de 2.4 a 4.0. Hasta tener las 20 fotos con ground truth que pide el plan,
 * NO se toca ese umbral a ojo; lo que se hace es dejar de tirar la
 * información y mostrarla como parcial.
 *
 * OpenCV trabaja sobre una copia reducida (máx 720px) sólo para localizar
 * el papel. Las coordenadas se devuelven normalizadas y la perspectiva se
 * aplica después sobre la captura original full-resolution.
 */
async function detectarDocumento(buffer) {
  const docquad = await intentarDocQuad(buffer);
  const esquinasDocQuad = docquad?.corners ? normalizarEsquinas(docquad.corners) : null;

  if (docquad?.valid) {
    return {
      esquinas: esquinasDocQuad,
      confiable: true,
      fuente: 'docquad',
      diagnostico: { docquad: diagnosticoDocQuad(docquad), opencv: null },
    };
  }

  const opencv = await intentarOpenCv(buffer);
  const razonDocQuad =
    docquad?.suspiciousReason || (docquad ? 'DOCQUAD_INVALID' : 'DOCQUAD_NOT_READY');

  if (opencv?.valid) {
    const esquinasOpenCv = normalizarEsquinas(opencv.corners);
    // ¿Coincide con lo que vio DocQuad, aunque a DocQuad lo hayamos
    // descartado por confianza? Si sí, dos métodos distintos apuntan al
    // mismo papel y eso basta para recortar solo. Si no, hay un quad pero
    // nadie lo respalda: se muestra, no se recorta.
    const acuerdo =
      esquinasDocQuad && esquinasOpenCv
        ? iou(esquinasDocQuad, esquinasOpenCv)
        : null;
    const respaldado = acuerdo === null ? true : acuerdo >= IOU_ACUERDO;

    // Si NO hay acuerdo, alguno de los dos se equivocó, y lo que se dibuje
    // debe ser la mejor apuesta disponible. Medido en Safari sobre una mesa
    // de madera: con el documento chico, OpenCV devolvía áreas de 0.23-0.25
    // —más grandes que el propio papel, o sea la mesa o el reflejo de la
    // ventana— mientras DocQuad seguía en el documento. Contra ground truth
    // DocQuad da 0.948 y 0.951; el umbral por brillo se deja engañar por la
    // veta y los reflejos. Así que en desacuerdo se muestra el de DocQuad.
    // Sigue siendo parcial: se dibuja para ajustar, no se recorta solo.
    const geometriaDocQuad = Boolean(esquinasDocQuad && docquad?.validation?.geometryValid);
    const esquinasMostradas =
      !respaldado && geometriaDocQuad ? esquinasDocQuad : esquinasOpenCv;

    return {
      esquinas: esquinasMostradas,
      confiable: respaldado,
      fuenteDibujada: !respaldado && geometriaDocQuad ? 'docquad' : 'opencv',
      fuente: opencv.source || 'opencv',
      razonDocQuad,
      razon: respaldado ? undefined : 'SIN_ACUERDO_ENTRE_DETECTORES',
      acuerdoIoU: acuerdo,
      diagnostico: {
        docquad: diagnosticoDocQuad(docquad),
        opencv: diagnosticoOpenCv(opencv),
      },
    };
  }

  // OpenCV no encontró nada, pero DocQuad puede traer un quad con geometría
  // válida que solo falló por confianza. Antes se perdía aquí.
  if (esquinasDocQuad && docquad?.validation?.geometryValid) {
    return {
      esquinas: esquinasDocQuad,
      confiable: false,
      fuente: 'docquad-parcial',
      razon: razonDocQuad,
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
