'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const scanner = require('../services/docquad');

/**
 * Detector compuesto del scanner. Este router se monta ANTES de
 * documentos.js, por lo que reemplaza de facto el endpoint Otsu legado.
 *
 * Contrato conservado para la app:
 *   { esquinas: [{x,y} x4] | null, confiable: boolean }
 */
router.post('/detectar-bordes', requireAuth, async (req, res) => {
  try {
    const { imagen } = req.body;
    if (!imagen) return res.status(400).json({ error: 'falta_imagen' });

    const estado = scanner.estadoDetector();
    const algunMotorListo = estado.listo || estado.opencv?.listo;

    if (!algunMotorListo) {
      // Ambos motores se calientan fuera del request. No esperamos aquí para
      // evitar que Railway corte la conexión con 502. En cuanto uno esté
      // listo, el siguiente frame ya podrá detectar.
      scanner.prepararMotores().catch(() => {});
      return res.json({
        esquinas: null,
        confiable: false,
        fuente: 'scanner',
        razon:
          estado.error && estado.opencv?.error
            ? 'DETECTORS_RETRYING'
            : 'DETECTORS_WARMING',
      });
    }

    // Si DocQuad aún no está listo pero OpenCV sí, seguimos de inmediato con
    // OpenCV. En paralelo se mantiene/reintenta el warm-up de DocQuad.
    if (!estado.listo) scanner.prepararDetector().catch(() => {});
    if (!estado.opencv?.listo) scanner.prepararFallback().catch(() => {});

    const limpio = imagen.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(limpio, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'imagen_vacia' });

    const resultado = await scanner.detectarDocumento(buffer);
    res.json(resultado);
  } catch (err) {
    console.error('[scanner] error detectando bordes', err);
    res.json({
      esquinas: null,
      confiable: false,
      fuente: 'scanner',
      razon: 'DETECTION_ERROR',
    });
  }
});

module.exports = router;
