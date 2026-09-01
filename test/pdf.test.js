const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const pdf = require('../services/pdf');

test('rasteriza en PNG un PDF con imagen sin depender de node-canvas', async () => {
  const canvas = createCanvas(120, 80);
  const contexto = canvas.getContext('2d');
  contexto.fillStyle = '#fff';
  contexto.fillRect(0, 0, 120, 80);
  contexto.fillStyle = '#000';
  contexto.fillText('TapptScan', 10, 30);

  const documento = await pdf.desdeImagen(canvas.toBuffer('image/png'), 'image/png');
  const pagina = await pdf.renderizarPagina(documento, 0, 1);

  assert.deepEqual([...pagina.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(pagina.length > 100);
});
