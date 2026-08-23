'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluarCorroboracion, normalizarRespuesta, quadValido } = require('../services/alineacionIA');

const rect = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

test('acepta un cuadrilátero convexo, ordenado y con área suficiente', () => {
  assert.equal(quadValido(rect), true);
});

test('rechaza quads cruzados, diminutos y puntos fuera de la imagen', () => {
  assert.equal(quadValido([rect[0], rect[2], rect[1], rect[3]]), false);
  assert.equal(quadValido([
    { x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.2, y: 0.2 }, { x: 0.1, y: 0.2 },
  ]), false);
  assert.equal(quadValido([{ x: -0.1, y: 0 }, ...rect.slice(1)]), false);
});

test('convierte porcentajes de la IA a coordenadas normalizadas', () => {
  const resultado = normalizarRespuesta({
    document_present: true,
    corners: rect.map((p) => ({ x: p.x * 100, y: p.y * 100 })),
  });
  assert.deepEqual(resultado.corners, rect);
});

test('descarta una respuesta con geometría inválida aunque sea JSON válido', () => {
  assert.equal(normalizarRespuesta({ corners: [{ x: 1, y: 1 }] }), null);
});

test('solo confirma cuando calidad, confianza y acuerdo geométrico alcanzan el umbral', () => {
  const resultado = {
    document_present: true,
    all_edges_visible: true,
    confidence: 0.91,
    recommended_action: 'accept',
    corners: rect.map((p) => ({ x: p.x + 0.01, y: p.y })),
  };
  assert.equal(evaluarCorroboracion(resultado, rect).confirmada, true);
  assert.equal(evaluarCorroboracion({ ...resultado, confidence: 0.5 }, rect).confirmada, false);
  assert.equal(evaluarCorroboracion({ ...resultado, recommended_action: 'retake_glare' }, rect).confirmada, false);
});

test('rechaza una propuesta visual que no coincide con el quad local', () => {
  const resultado = {
    document_present: true,
    all_edges_visible: true,
    confidence: 0.99,
    recommended_action: 'accept',
    corners: [
      { x: 0.55, y: 0.55 }, { x: 0.95, y: 0.55 }, { x: 0.95, y: 0.95 }, { x: 0.55, y: 0.95 },
    ],
  };
  const evaluacion = evaluarCorroboracion(resultado, rect);
  assert.equal(evaluacion.confirmada, false);
  assert.equal(evaluacion.razon, 'IA_SIN_ACUERDO');
});
