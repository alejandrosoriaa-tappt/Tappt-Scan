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

test('una firma rotada conserva el mismo centro visual al guardarse', async () => {
  const hoja = createCanvas(200, 200);
  const contextoHoja = hoja.getContext('2d');
  contextoHoja.fillStyle = '#fff';
  contextoHoja.fillRect(0, 0, 200, 200);
  const original = await pdf.desdeImagen(hoja.toBuffer('image/png'), 'image/png');

  const firma = createCanvas(40, 20);
  const contextoFirma = firma.getContext('2d');
  contextoFirma.fillStyle = '#0055ff';
  contextoFirma.fillRect(0, 0, 40, 20);
  const datos = `data:image/png;base64,${firma.toBuffer('image/png').toString('base64')}`;

  for (const rotacion of [0, 45, 90, 180]) {
    const { pdf: editado } = await pdf.aplicarAnotaciones(original, [
      { tipo: 'firma', x: 0.2, y: 0.3, ancho: 0.3, rotacion, datos },
    ]);
    const png = await pdf.renderizarPagina(editado, 0, 1);
    const imagen = await loadImage(png);
    const salida = createCanvas(200, 200);
    const contexto = salida.getContext('2d');
    contexto.drawImage(imagen, 0, 0, 200, 200);
    const pixeles = contexto.getImageData(0, 0, 200, 200).data;
    let sumaX = 0;
    let sumaY = 0;
    let cantidad = 0;
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 200; x += 1) {
        const i = (y * 200 + x) * 4;
        if (pixeles[i + 2] > 180 && pixeles[i] < 80) {
          sumaX += x;
          sumaY += y;
          cantidad += 1;
        }
      }
    }
    assert.ok(cantidad > 100, `firma visible a ${rotacion}°`);
    assert.ok(Math.abs(sumaX / cantidad - 70) < 2, `centro X estable a ${rotacion}°`);
    assert.ok(Math.abs(sumaY / cantidad - 75) < 2, `centro Y estable a ${rotacion}°`);
  }
});
