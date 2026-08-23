'use strict';

const CHANNELS = 4;
const DEFAULT_THRESHOLD = 0.3;

function validar(tensor) {
  const dims = tensor?.dims || [];
  if (!tensor?.data || dims.length !== 4 || dims[0] !== 1 || dims[1] !== CHANNELS) {
    throw new Error(`docaligner_bad_heatmap:${dims.join('x')}`);
  }
  const h = dims[2];
  const w = dims[3];
  if (!(h > 0 && w > 0) || tensor.data.length !== CHANNELS * h * w) {
    throw new Error('docaligner_bad_heatmap_data');
  }
  return { h, w };
}

// Replica la intención del upstream: centroide del componente conexo más
// grande por canal. Trabajar en la rejilla del modelo da el mismo centroide
// normalizado que redimensionar primero el heatmap al tamaño original.
function componenteMayor(data, offset, w, h, threshold) {
  const visto = new Uint8Array(w * h);
  let mejor = null;
  const vecinos = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let seed = 0; seed < w * h; seed++) {
    if (visto[seed] || data[offset + seed] < threshold) continue;
    visto[seed] = 1;
    const cola = [seed];
    let head = 0;
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let peak = -Infinity;

    while (head < cola.length) {
      const i = cola[head++];
      const x = i % w;
      const y = Math.floor(i / w);
      const value = data[offset + i];
      count++;
      sumX += x + 0.5;
      sumY += y + 0.5;
      peak = Math.max(peak, value);

      for (const [dx, dy] of vecinos) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (!visto[ni] && data[offset + ni] >= threshold) {
          visto[ni] = 1;
          cola.push(ni);
        }
      }
    }

    if (!mejor || count > mejor.count) {
      mejor = { count, x: sumX / count, y: sumY / count, peak };
    }
  }
  return mejor;
}

function postprocesarHeatmaps(tensor, srcW, srcH, threshold = DEFAULT_THRESHOLD) {
  const { h, w } = validar(tensor);
  const corners = [];
  const channels = [];

  for (let c = 0; c < CHANNELS; c++) {
    const componente = componenteMayor(tensor.data, c * w * h, w, h, threshold);
    channels.push(componente);
    if (!componente) continue;
    corners.push({
      x: (componente.x / w) * srcW,
      y: (componente.y / h) * srcH,
    });
  }

  return {
    corners: corners.length === CHANNELS ? corners : null,
    complete: corners.length === CHANNELS,
    channels,
    threshold,
  };
}

module.exports = { DEFAULT_THRESHOLD, postprocesarHeatmaps };
