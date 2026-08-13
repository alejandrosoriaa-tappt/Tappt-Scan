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
    marcoCompleto: Boolean(resultado.marcoCompleto),
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

  const geometriaDocQuad = Boolean(esquinasDocQuad && docquad?.validation?.geometryValid);

  // INTENTO REVERTIDO (2026-08-13). Se probó dejar que DocQuad SOLO marcara
  // confiable cuando su única objeción fuera LOW_PEAK_MARGIN y no hubiera
  // señal de imagen ya recortada. En granito claro eso se rompió: DocQuad
  // devolvía quads bastante más grandes que el papel (áreas 0.315 y 0.363,
  // uno saliéndose del cuadro) y quedaban marcados confiables, o sea que se
  // habría recortado mal en automático.
  //
  // Un verde equivocado es PEOR que un blanco correcto: el blanco pide
  // ajuste, el verde recorta solo. Así que la confianza sigue exigiendo
  // ACUERDO entre los dos detectores. DocQuad sin corroborar se dibuja como
  // parcial, que es donde ya aporta valor: en granito y madera es el único
  // que se queda en el documento cuando OpenCV se va a la mesa.
  const docquadConfiable = false;

  if (opencv?.valid) {
    const esquinasOpenCv = normalizarEsquinas(opencv.corners);
    const acuerdo =
      esquinasDocQuad && esquinasOpenCv ? iou(esquinasDocQuad, esquinasOpenCv) : null;

    // Coinciden los dos: la mejor evidencia posible.
    if (acuerdo === null || acuerdo >= IOU_ACUERDO) {
      return {
        esquinas: esquinasOpenCv,
        confiable: true,
        fuente: opencv.source || 'opencv',
        fuenteDibujada: 'opencv',
        razonDocQuad,
        acuerdoIoU: acuerdo,
        diagnostico: {
          docquad: diagnosticoDocQuad(docquad),
          opencv: diagnosticoOpenCv(opencv),
        },
      };
    }

    // No coinciden. Medido en Safari: sobre madera y sobre granito claro
    // OpenCV devolvía la mesa entera (áreas 0.66-0.77) mientras DocQuad se
    // quedaba en el documento (0.15). El umbral por brillo se deja engañar
    // por vetas y reflejos; DocQuad no. Así que gana DocQuad.
    return {
      esquinas: geometriaDocQuad ? esquinasDocQuad : esquinasOpenCv,
      confiable: docquadConfiable,
      fuente: docquadConfiable ? 'docquad' : opencv.source || 'opencv',
      fuenteDibujada: geometriaDocQuad ? 'docquad' : 'opencv',
      razon: docquadConfiable ? undefined : 'SIN_ACUERDO_ENTRE_DETECTORES',
      razonDocQuad,
      acuerdoIoU: acuerdo,
      diagnostico: {
        docquad: diagnosticoDocQuad(docquad),
        opencv: diagnosticoOpenCv(opencv),
      },
    };
  }

  // OpenCV no encontró nada. Si DocQuad trae geometría válida, es lo único
  // que hay — y con el guardrail de arriba puede valer como confiable.
  if (geometriaDocQuad) {
    return {
      esquinas: esquinasDocQuad,
      confiable: docquadConfiable,
      fuente: docquadConfiable ? 'docquad' : 'docquad-parcial',
      fuenteDibujada: 'docquad',
      razon: docquadConfiable ? undefined : razonDocQuad,
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
