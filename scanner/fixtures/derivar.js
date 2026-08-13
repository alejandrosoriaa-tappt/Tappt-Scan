'use strict';

const { createCanvas, loadImage } = require('@napi-rs/canvas');

/**
 * Construye un fixture "documento chico en cuadro amplio" a partir de una
 * foto real, pegándola centrada dentro de un lienzo `factor` veces más
 * grande sobre un fondo de mesa.
 *
 * POR QUÉ: al abrir la cámara a ultra-wide (0.5x) el documento pasa a ocupar
 * ~5-10% del cuadro, y ese es el encuadre que el producto PIDE — el
 * benchmark es capturar de lejos, con margen. Los mínimos de área del
 * detector se habían calibrado con la cámara recortada, cuando el papel
 * llenaba la pantalla, así que justo el encuadre bueno se caía por
 * `AREA_TOO_SMALL`. Este fixture fija ese caso para que no vuelva a pasar.
 *
 * Es sintético y se marca como tal: sirve para el umbral de ÁREA, no para
 * juzgar calidad de bordes. Las fotos reales del banco siguen siendo las
 * que mandan.
 */
async function derivarDocumentoChico(bufferOrigen, groundTruthOrigen, factor = 2.6) {
  const imagen = await loadImage(bufferOrigen);
  const w = imagen.width;
  const h = imagen.height;
  const W = Math.round(w * factor);
  const H = Math.round(h * factor);
  const offX = Math.round((W - w) / 2);
  const offY = Math.round((H - h) / 2);

  const lienzo = createCanvas(W, H);
  const ctx = lienzo.getContext('2d');
  // Fondo tipo mesa de madera, no gris neutro: un fondo plano y muy distinto
  // del papel le regalaría el trabajo al detector y el fixture mentiría.
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#6b4626');
  grad.addColorStop(0.5, '#8a5c31');
  grad.addColorStop(1, '#5c3b20');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(imagen, offX, offY, w, h);

  const groundTruth = groundTruthOrigen.map((p) => ({
    x: (p.x * w + offX) / W,
    y: (p.y * h + offY) / H,
  }));

  return { buffer: lienzo.toBuffer('image/jpeg', 92), groundTruth };
}

module.exports = { derivarDocumentoChico };
