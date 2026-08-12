'use strict';

/*
 * Postproceso compatible con DocQuadNet-256, reimplementado para TapptScan
 * a partir de la especificación/código Apache-2.0 de MakeACopy
 * (Christian Kierdorf). Ver scanner/docquad/NOTICE.md.
 */

const { inversaLetterbox } = require('./preprocess');

const GRID = 64;
const CHANNELS = 4;
const STRIDE_64_TO_256 = 4;
const CORNER_NAMES = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

function indice(c, y, x) {
  return c * GRID * GRID + y * GRID + x;
}

function validarHeatmaps(tensor) {
  if (!tensor?.data || tensor.data.length !== CHANNELS * GRID * GRID) {
    throw new Error(`docquad_bad_corner_heatmaps:${tensor?.data?.length || 0}`);
  }
  const dims = tensor.dims || [];
  if (dims.length && dims.join('x') !== '1x4x64x64') {
    throw new Error(`docquad_bad_corner_shape:${dims.join('x')}`);
  }
}

function estadisticaCanal(data, c) {
  const offset = c * GRID * GRID;
  const n = GRID * GRID;
  let sum = 0;
  let best = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = data[offset + i];
    sum += v;
    if (v > best) best = v;
  }
  const mean = sum / n;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const d = data[offset + i] - mean;
    sumSq += d * d;
  }
  const std = Math.sqrt(sumSq / n);
  return { peak: best, mean, std, z: std > 1e-9 ? (best - mean) / std : Infinity };
}

/**
 * Refina cada peak igual que el modo REFINE_5X5_QUADRATIC de MakeACopy:
 * argmax + ajuste parabólico 1D por eje; si ambos ejes son degenerados,
 * cae a centroide softmax 5x5.
 */
function refinarEsquina(data, c) {
  let best = -Infinity;
  let bestX = 0;
  let bestY = 0;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const v = data[indice(c, y, x)];
      if (v > best) {
        best = v;
        bestX = x;
        bestY = y;
      }
    }
  }

  let dx = 0;
  let dxValid = false;
  if (bestX > 0 && bestX < GRID - 1) {
    const l = data[indice(c, bestY, bestX - 1)];
    const center = data[indice(c, bestY, bestX)];
    const r = data[indice(c, bestY, bestX + 1)];
    const denom = l - 2 * center + r;
    if (denom < -1e-12) {
      dx = 0.5 * (l - r) / denom;
      dx = Math.max(-0.5, Math.min(0.5, dx));
      dxValid = true;
    }
  }

  let dy = 0;
  let dyValid = false;
  if (bestY > 0 && bestY < GRID - 1) {
    const t = data[indice(c, bestY - 1, bestX)];
    const center = data[indice(c, bestY, bestX)];
    const b = data[indice(c, bestY + 1, bestX)];
    const denom = t - 2 * center + b;
    if (denom < -1e-12) {
      dy = 0.5 * (t - b) / denom;
      dy = Math.max(-0.5, Math.min(0.5, dy));
      dyValid = true;
    }
  }

  let x64;
  let y64;

  if (dxValid || dyValid) {
    x64 = bestX + 0.5 + dx;
    y64 = bestY + 0.5 + dy;
  } else {
    const x0 = Math.max(0, bestX - 2);
    const x1 = Math.min(GRID - 1, bestX + 2);
    const y0 = Math.max(0, bestY - 2);
    const y1 = Math.min(GRID - 1, bestY + 2);

    let maxLogit = -Infinity;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        maxLogit = Math.max(maxLogit, data[indice(c, y, x)]);
      }
    }

    let sumW = 0;
    let sumX = 0;
    let sumY = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const w = Math.exp(data[indice(c, y, x)] - maxLogit);
        sumW += w;
        sumX += w * (x + 0.5);
        sumY += w * (y + 0.5);
      }
    }

    if (!Number.isFinite(sumW) || sumW === 0) {
      x64 = bestX + 0.5;
      y64 = bestY + 0.5;
    } else {
      x64 = sumX / sumW;
      y64 = sumY / sumW;
    }
  }

  return {
    x256: x64 * STRIDE_64_TO_256,
    y256: y64 * STRIDE_64_TO_256,
    argmax: { x: bestX, y: bestY, logit: best },
    refinement: dxValid || dyValid ? 'quadratic' : 'centroid5x5',
  };
}

function cross(a, b, c) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  return abx * bcy - aby * bcx;
}

function esConvexoTLTRBRBL(points) {
  if (!Array.isArray(points) || points.length !== 4) return false;
  let sign = null;
  for (let i = 0; i < 4; i++) {
    const v = cross(points[i], points[(i + 1) % 4], points[(i + 2) % 4]);
    if (!Number.isFinite(v) || Math.abs(v) < 1e-9) return false;
    const actual = Math.sign(v);
    // En coordenadas de imagen (y crece hacia abajo), TL→TR→BR→BL da cross positivo.
    if (i === 0 && actual < 0) return false;
    if (sign === null) sign = actual;
    else if (actual !== sign) return false;
  }
  return true;
}

function areaNormalizada(points) {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function postprocesarEsquinas(cornerTensor, letterbox, srcW, srcH) {
  validarHeatmaps(cornerTensor);
  const data = cornerTensor.data;

  const detalles = [];
  const pixels = [];
  const normalizadas = [];
  const confidence = [];

  for (let c = 0; c < CHANNELS; c++) {
    const refined = refinarEsquina(data, c);
    const original = inversaLetterbox(refined.x256, refined.y256, letterbox);
    const stat = estadisticaCanal(data, c);

    detalles.push({ name: CORNER_NAMES[c], ...refined, heatmap: stat });
    pixels.push({ x: original.x, y: original.y });
    normalizadas.push({ x: original.x / srcW, y: original.y / srcH });
    confidence.push(stat.z);
  }

  const finite = normalizadas.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const plausibleBounds = normalizadas.every(
    (p) => p.x >= -0.25 && p.x <= 1.25 && p.y >= -0.25 && p.y <= 1.25
  );
  const convex = esConvexoTLTRBRBL(normalizadas);
  const area = finite ? areaNormalizada(normalizadas) : 0;

  return {
    corners: normalizadas,
    cornersPixels: pixels,
    confidenceZ: confidence,
    minConfidenceZ: Math.min(...confidence),
    area,
    valid: finite && plausibleBounds && convex && area > 0.01,
    validation: { finite, plausibleBounds, convex, area },
    details: detalles,
  };
}

module.exports = {
  postprocesarEsquinas,
  esConvexoTLTRBRBL,
  areaNormalizada,
  refinarEsquina,
};
