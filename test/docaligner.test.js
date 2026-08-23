'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { rgbaANchwBgr } = require('../scanner/docaligner/preprocess');
const { postprocesarHeatmaps } = require('../scanner/docaligner/postprocess');

test('prepara DocAligner en BGR NCHW 0..1', () => {
  const rgba = new Uint8ClampedArray(256 * 256 * 4);
  rgba.set([255, 128, 0, 255], 0);
  const tensor = rgbaANchwBgr(rgba, 256, 256);
  const hw = 256 * 256;
  assert.equal(tensor[0], 0);
  assert.ok(Math.abs(tensor[hw] - 128 / 255) < 1e-7);
  assert.equal(tensor[2 * hw], 1);
});

test('extrae el centroide del componente mayor de cada esquina', () => {
  const w = 8;
  const h = 8;
  const data = new Float32Array(4 * w * h);
  const centros = [[1, 1], [6, 1], [6, 6], [1, 6]];
  centros.forEach(([cx, cy], c) => {
    for (let y = cy; y <= cy + 1; y++) {
      for (let x = cx; x <= cx + 1; x++) data[c * w * h + y * w + x] = 0.9;
    }
    // Ruido aislado: no debe ganar al componente 2x2.
    data[c * w * h] = 0.95;
  });
  const result = postprocesarHeatmaps({ data, dims: [1, 4, h, w] }, 800, 400);
  assert.equal(result.complete, true);
  assert.deepEqual(result.corners[0], { x: 200, y: 100 });
  assert.deepEqual(result.corners[2], { x: 700, y: 350 });
});

test('no devuelve cuadrilátero si falta una esquina', () => {
  const data = new Float32Array(4 * 4 * 4);
  data[0] = data[16] = data[32] = 0.8;
  const result = postprocesarHeatmaps({ data, dims: [1, 4, 4, 4] }, 100, 100);
  assert.equal(result.complete, false);
  assert.equal(result.corners, null);
});
