'use strict';

const { DocQuadDetector } = require('../scanner/docquad/detector');

let detectorPromise = null;

async function obtenerDetector() {
  if (!detectorPromise) {
    detectorPromise = new DocQuadDetector()
      .init()
      .then((detector) => {
        console.log('[docquad] modelo listo');
        return detector;
      })
      .catch((err) => {
        // Permite reintentar en la siguiente solicitud si la descarga o la
        // inicialización falló temporalmente.
        detectorPromise = null;
        throw err;
      });
  }
  return detectorPromise;
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

  // Clamp final al dominio que consume el resto de TapptScan. El modelo
  // permite una pequeña tolerancia fuera del frame durante validación, pero
  // corregirPerspectiva y la UI trabajan con fracciones 0..1.
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
};
