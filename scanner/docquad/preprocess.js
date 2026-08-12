'use strict';

const { createCanvas, loadImage } = require('@napi-rs/canvas');

const INPUT_W = 256;
const INPUT_H = 256;
const LETTERBOX_GRAY = 128;

function crearLetterbox(srcW, srcH, dstW = INPUT_W, dstH = INPUT_H) {
  if (!(srcW > 0 && srcH > 0 && dstW > 0 && dstH > 0)) {
    throw new Error('docquad_invalid_dimensions');
  }

  const scale = Math.min(dstW / srcW, dstH / srcH);
  const scaledW = srcW * scale;
  const scaledH = srcH * scale;
  return {
    srcW,
    srcH,
    dstW,
    dstH,
    scale,
    offsetX: (dstW - scaledW) / 2,
    offsetY: (dstH - scaledH) / 2,
  };
}

function inversaLetterbox(x, y, lb) {
  return {
    x: (x - lb.offsetX) / lb.scale,
    y: (y - lb.offsetY) / lb.scale,
  };
}

/**
 * Replica el preproceso de MakeACopy DocQuadDetector:
 * - letterbox 256x256 preservando aspect ratio
 * - padding RGB(128,128,128)
 * - resize bilinear
 * - RGB float32 0..1 en layout NCHW [1,3,256,256]
 */
async function prepararEntrada(buffer) {
  const imagen = await loadImage(buffer);
  const srcW = imagen.width;
  const srcH = imagen.height;
  const lb = crearLetterbox(srcW, srcH);

  const canvas = createCanvas(INPUT_W, INPUT_H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${LETTERBOX_GRAY},${LETTERBOX_GRAY},${LETTERBOX_GRAY})`;
  ctx.fillRect(0, 0, INPUT_W, INPUT_H);
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    imagen,
    lb.offsetX,
    lb.offsetY,
    srcW * lb.scale,
    srcH * lb.scale
  );

  const rgba = ctx.getImageData(0, 0, INPUT_W, INPUT_H).data;
  const hw = INPUT_W * INPUT_H;
  const nchw = new Float32Array(3 * hw);

  for (let i = 0; i < hw; i++) {
    const p = i * 4;
    nchw[i] = rgba[p] / 255;
    nchw[hw + i] = rgba[p + 1] / 255;
    nchw[2 * hw + i] = rgba[p + 2] / 255;
  }

  return { input: nchw, letterbox: lb, srcW, srcH };
}

module.exports = {
  INPUT_W,
  INPUT_H,
  LETTERBOX_GRAY,
  crearLetterbox,
  inversaLetterbox,
  prepararEntrada,
};
