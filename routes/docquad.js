'use strict';

const express = require('express');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const scanner = require('../services/docquad');

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
    fixturesDebug.delete(fixturesDebug.keys().next().value);
  }
}

function puntosResultado(resultado) {
  const pts = resultado?.esquinas || resultado?.corners || resultado?.diagnostico?.corners || null;
  return Array.isArray(pts) && pts.length === 4 ? pts : null;
}

async function renderFixture(fixture) {
  const buffer = Buffer.from(fixture.imagen, 'base64');
  const image = await loadImage(buffer);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, image.width, image.height);

  const r = fixture.resultado || {};
  const pts = puntosResultado(r);
  if (pts) {
    const normalizados = pts.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    const xy = pts.map((p) => ({
      x: normalizados ? p.x * image.width : p.x,
      y: normalizados ? p.y * image.height : p.y,
    }));
    ctx.save();
    ctx.strokeStyle = '#00ff88';
    ctx.fillStyle = 'rgba(0,255,136,0.16)';
    ctx.lineWidth = Math.max(4, Math.round(image.width / 120));
    ctx.beginPath();
    ctx.moveTo(xy[0].x, xy[0].y);
    for (let i = 1; i < xy.length; i++) ctx.lineTo(xy[i].x, xy[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const p of xy) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#00ff88';
      ctx.fill();
    }
    ctx.restore();
  }

  const d = r.diagnostico || r;
  const fuente = r.fuente || d.source || 'sin-fuente';
  const area = d.area ?? r.area;
  const score = d.score ?? r.score;
  const lineas = [
    `fuente: ${fuente}`,
    `confiable: ${String(r.confiable ?? d.valid ?? false)}`,
    `area: ${Number.isFinite(area) ? Number(area).toFixed(4) : 'n/a'}`,
    `score: ${Number.isFinite(score) ? Number(score).toFixed(4) : 'n/a'}`,
    `fecha: ${fixture.fecha}`,
  ];
  const fontSize = Math.max(16, Math.round(image.width / 30));
  const pad = 12;
  const alto = lineas.length * (fontSize + 5) + pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, image.width, alto);
  ctx.font = `600 ${fontSize}px sans-serif`;
  ctx.fillStyle = '#7CF5C0';
  lineas.forEach((linea, i) => ctx.fillText(linea, pad, pad + fontSize + i * (fontSize + 5)));

  return canvas.toBuffer('image/jpeg', 0.92);
}

router.get('/debug-fixture', (req, res) => {
  const clave = cookie(req, 'tapptscan_scanner_debug');
  const fixture = clave ? fixturesDebug.get(clave) : null;
  if (!fixture) return res.status(404).json({ error: 'fixture_no_disponible' });
  res.json(fixture);
});

router.get('/debug-fixture-visual', async (req, res) => {
  try {
    const clave = cookie(req, 'tapptscan_scanner_debug');
    const fixture = clave ? fixturesDebug.get(clave) : null;
    if (!fixture) return res.status(404).json({ error: 'fixture_no_disponible' });
    const jpeg = await renderFixture(fixture);
    res.setHeader('Cache-Control', 'no-store');
    res.type('jpeg').send(jpeg);
  } catch (err) {
    console.error('[scanner] error renderizando fixture visual', err);
    res.status(500).json({ error: 'fixture_visual_error' });
  }
});

router.post('/detectar-bordes', requireAuth, async (req, res) => {
  try {
    const { imagen } = req.body;
    if (!imagen) return res.status(400).json({ error: 'falta_imagen' });
    const estado = scanner.estadoDetector();
    const algunMotorListo = estado.listo || estado.opencv?.listo;
    if (!algunMotorListo) {
      scanner.prepararMotores().catch(() => {});
      const resultado = { esquinas: null, confiable: false, fuente: 'scanner', razon: estado.error && estado.opencv?.error ? 'DETECTORS_RETRYING' : 'DETECTORS_WARMING' };
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
    const resultado = { esquinas: null, confiable: false, fuente: 'scanner', razon: 'DETECTION_ERROR' };
    if (req.body?.imagen) guardarFixtureDebug(req, req.body.imagen, resultado);
    res.json(resultado);
  }
});

module.exports = router;
