'use strict';

const INPUT_SIZE = 256;

/**
 * Preproceso compatible con DocAligner heatmap-regression.
 * A diferencia de DocQuad, DocAligner estira el frame a 256x256 (no usa
 * letterbox) y fue entrenado con canales BGR en NCHW, normalizados a 0..1.
 */
function rgbaANchwBgr(rgba, width, height) {
  if (width !== INPUT_SIZE || height !== INPUT_SIZE) {
    throw new Error('docaligner_bad_input_size');
  }
  if (!rgba || rgba.length !== width * height * 4) {
    throw new Error('docaligner_bad_rgba');
  }

  const hw = width * height;
  const input = new Float32Array(3 * hw);
  for (let i = 0; i < hw; i++) {
    const p = i * 4;
    input[i] = rgba[p + 2] / 255; // B
    input[hw + i] = rgba[p + 1] / 255; // G
    input[2 * hw + i] = rgba[p] / 255; // R
  }
  return input;
}

async function prepararEntrada(buffer) {
  // Lazy para que el postproceso y sus pruebas no dependan del decoder.
  const { createCanvas, loadImage } = require('@napi-rs/canvas');
  const imagen = await loadImage(buffer);
  const canvas = createCanvas(INPUT_SIZE, INPUT_SIZE);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imagen, 0, 0, INPUT_SIZE, INPUT_SIZE);
  const rgba = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data;

  return {
    input: rgbaANchwBgr(rgba, INPUT_SIZE, INPUT_SIZE),
    srcW: imagen.width,
    srcH: imagen.height,
  };
}

module.exports = { INPUT_SIZE, rgbaANchwBgr, prepararEntrada };
