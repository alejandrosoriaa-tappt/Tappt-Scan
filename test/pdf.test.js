const test = require('node:test');
const assert = require('node:assert/strict');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
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

test('tapar censura con un rectángulo negro por defecto', async () => {
  const canvas = createCanvas(120, 80);
  const contexto = canvas.getContext('2d');
  contexto.fillStyle = '#fff';
  contexto.fillRect(0, 0, 120, 80);

  const original = await pdf.desdeImagen(canvas.toBuffer('image/png'), 'image/png');
  const { pdf: editado } = await pdf.aplicarAnotaciones(original, [
    { tipo: 'tapar', x: 0.1, y: 0.1, ancho: 0.4, alto: 0.2 },
  ]);
  const png = await pdf.renderizarPagina(editado, 0, 1);
  const imagen = await loadImage(png);
  const salida = createCanvas(120, 80);
  const contextoSalida = salida.getContext('2d');
  contextoSalida.drawImage(imagen, 0, 0, 120, 80);
  const pixel = contextoSalida.getImageData(24, 14, 1, 1).data;

  assert.ok(pixel[0] < 20 && pixel[1] < 20 && pixel[2] < 20);
});
