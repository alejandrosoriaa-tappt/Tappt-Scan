'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const docquad = require('../services/docquad');

/**
 * Detector nuevo del scanner. Este router se monta ANTES de documentos.js,
 * por lo que reemplaza de facto el endpoint Otsu sin mezclar ambos motores.
 *
 * Contrato conservado para la app:
 *   { esquinas: [{x,y} x4] | null, confiable: boolean }
 */
router.post('/detectar-bordes', requireAuth, async (req, res) => {
  try {
    const { imagen } = req.body;
    if (!imagen) return res.status(400).json({ error: 'falta_imagen' });

    const limpio = imagen.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(limpio, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'imagen_vacia' });

    const resultado = await docquad.detectarDocumento(buffer);
    res.json(resultado);
  } catch (err) {
    console.error('[docquad] error detectando bordes', err);
    // Falla segura: no inventar esquinas y no bloquear la captura manual.
    res.json({
      esquinas: null,
      confiable: false,
      fuente: 'docquad',
      razon: 'DETECTION_ERROR',
    });
  }
});

module.exports = router;
