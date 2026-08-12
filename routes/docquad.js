'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const scanner = require('../services/docquad');

// Fixtures de diagnóstico efímeros, aislados por cookie aleatoria creada al
// abrir /?scannerDebug=1. Sólo se guardan en memoria y se reemplazan con el
// frame más reciente; nunca forman parte del flujo normal del producto.
const fixturesDebug = new Map();
const MAX_FIXTURES_DEBUG = 20;

function cookie(req, nombre) {
  const cabecera = req.headers.cookie || '';
  for (const parte of cabecera.split(';')) {
    const [k, ...resto] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(resto.join('='));
  }
  return null;
}

function guardarFixtureDebug(req, imagen, resultado) {
  const clave = cookie(req, 'tapptscan_scanner_debug');
  if (!clave) return;

  fixturesDebug.delete(clave);
  fixturesDebug.set(clave, {
    fecha: new Date().toISOString(),
    imagen: imagen.replace(/^data:[^;]+;base64,/, ''),
    resultado,
  });

  while (fixturesDebug.size > MAX_FIXTURES_DEBUG) {
    const primera = fixturesDebug.keys().next().value;
    fixturesDebug.delete(primera);
  }
}

// Endpoint deliberadamente fuera de requireAuth: la cookie aleatoria de debug
// es la capacidad temporal. No expone fixtures de otros navegadores y deja de
// servir en cuanto el proceso de Railway reinicia o la cookie cambia.
router.get('/debug-fixture', (req, res) => {
  const clave = cookie(req, 'tapptscan_scanner_debug');
  const fixture = clave ? fixturesDebug.get(clave) : null;
  if (!fixture) return res.status(404).json({ error: 'fixture_no_disponible' });
  res.json(fixture);
});

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
      scanner.prepararMotores().catch(() => {});
      const resultado = {
        esquinas: null,
        confiable: false,
        fuente: 'scanner',
        razon:
          estado.error && estado.opencv?.error
            ? 'DETECTORS_RETRYING'
            : 'DETECTORS_WARMING',
      };
      guardarFixtureDebug(req, imagen, resultado);
      return res.json(resultado);
    }

    if (!estado.listo) scanner.prepararDetector().catch(() => {});
    if (!estado.opencv?.listo) scanner.prepararFallback().catch(() => {});

    const limpio = imagen.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(limpio, 'base64');
    if (!buffer.length) return res.status(400).json({ error: 'imagen_vacia' });

    const resultado = await scanner.detectarDocumento(buffer);
    guardarFixtureDebug(req, imagen, resultado);
    res.json(resultado);
  } catch (err) {
    console.error('[scanner] error detectando bordes', err);
    const resultado = {
      esquinas: null,
      confiable: false,
      fuente: 'scanner',
      razon: 'DETECTION_ERROR',
    };
    if (req.body?.imagen) guardarFixtureDebug(req, req.body.imagen, resultado);
    res.json(resultado);
  }
});

module.exports = router;
