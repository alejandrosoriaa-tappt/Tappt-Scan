'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalizarQuad, areaNormalizada } = require('../scanner/docquad/postprocess');

function ordenarPorSumaDiferencia(puntos) {
  const sumas = puntos.map((p) => p.x + p.y);
  const diferencias = puntos.map((p) => p.y - p.x);
  return [
    puntos[sumas.indexOf(Math.min(...sumas))],
    puntos[diferencias.indexOf(Math.min(...diferencias))],
    puntos[sumas.indexOf(Math.max(...sumas))],
    puntos[diferencias.indexOf(Math.max(...diferencias))],
  ];
}

test('centroide y ángulo conservan cuatro esquinas bajo perspectiva fuerte', () => {
  // Quad convexo realista donde suma/diferencia elige el punto derecho como
  // TR y BR a la vez. Ésta es la clase de inclinación que rompe ese atajo.
  const puntos = [
    { x: 191.507, y: 100.229 },
    { x: 80.498, y: 161.97 },
    { x: 50.892, y: 84.408 },
    { x: 64.277, y: -7.963 },
  ];

  const fragil = ordenarPorSumaDiferencia(puntos);
  assert.equal(new Set(fragil.map((p) => `${p.x},${p.y}`)).size, 3);

  const ordenado = canonicalizarQuad([puntos[2], puntos[0], puntos[3], puntos[1]]);
  assert.equal(new Set(ordenado.map((p) => `${p.x},${p.y}`)).size, 4);
  assert.ok(areaNormalizada(ordenado) > 0);
});
