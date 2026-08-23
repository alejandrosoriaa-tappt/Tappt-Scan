'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { umbralAdaptativo } = require('../scanner/filters/adaptive-threshold');

test('conserva texto oscuro bajo un gradiente fuerte de iluminación', () => {
  const ancho = 80;
  const alto = 40;
  const grises = new Uint8ClampedArray(ancho * alto);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      // Papel que pasa de sombra (90) a zona iluminada (230).
      grises[y * ancho + x] = 90 + Math.round((140 * x) / (ancho - 1));
    }
  }
  // Dos trazos con el mismo contraste local, uno en sombra y otro en luz.
  for (let y = 12; y < 28; y++) {
    grises[y * ancho + 18] -= 45;
    grises[y * ancho + 62] -= 45;
  }

  const salida = umbralAdaptativo(grises, ancho, alto, { bloque: 15, c: 8 });
  assert.equal(salida[20 * ancho + 18], 0);
  assert.equal(salida[20 * ancho + 62], 0);
  assert.equal(salida[20 * ancho + 10], 255);
  assert.equal(salida[20 * ancho + 70], 255);
});

test('rechaza dimensiones y bloques inválidos', () => {
  assert.throws(() => umbralAdaptativo(new Uint8Array(3), 2, 2));
  assert.throws(() => umbralAdaptativo(new Uint8Array(4), 2, 2, { bloque: 4 }));
});
