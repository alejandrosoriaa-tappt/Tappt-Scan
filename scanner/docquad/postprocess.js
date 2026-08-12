'use strict';

/*
 * Postproceso de DocQuadNet-256 para TapptScan.
 *
 * Reimplementa el pipeline PRODUCT de MakeACopy (Apache-2.0):
 *   corner heatmaps -> refinamiento subpixel
 *   mask logits     -> quad por PCA
 *   scoring geométrico + desacuerdo con máscara
 *   elección CORNERS vs MASK
 *   guardrails de producto
 *
 * Upstream fijado en scanner/docquad/NOTICE.md.
 */

const { inversaLetterbox } = require('./preprocess');

const GRID = 64;
const CHANNELS = 4;
const STRIDE = 4;
const CORNER_NAMES = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

const PEAK_SIGMA_THRESHOLD = 5.0;
const MASK_DIFFUSE_MEAN_THRESHOLD = 0.45;
const MASK_DIFFUSE_MIN_AREA = 100;
const GEOMETRY_IMPLAUSIBLE_THRESHOLD = 1e4;
const HARD_PENALTY_THRESHOLD = 1e5;
const AGREEMENT_MAX_CORNER_DIST = 32.0;
const MASK_SCORE_MARGIN = 50.0;

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

function validarMask(tensor) {
  if (!tensor?.data || tensor.data.length !== GRID * GRID) {
    throw new Error(`docquad_bad_mask_logits:${tensor?.data?.length || 0}`);
  }
  const dims = tensor.dims || [];
  if (dims.length && dims.join('x') !== '1x1x64x64') {
    throw new Error(`docquad_bad_mask_shape:${dims.join('x')}`);
  }
}

function sigmoid(x) {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
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
  return {
    peak: best,
    mean,
    std,
    z: std > 1e-9 ? (best - mean) / std : Infinity,
  };
}

function estadisticaMask(maskTensor) {
  validarMask(maskTensor);
  let count = 0;
  let sumProb = 0;

  for (const logit of maskTensor.data) {
    const prob = sigmoid(logit);
    sumProb += prob;
    if (prob > 0.5) count++;
  }

  return {
    areaGt05: count,
    meanProb: sumProb / maskTensor.data.length,
  };
}

/**
 * REFINE_5X5_QUADRATIC de MakeACopy:
 * argmax + ajuste parabólico por eje; si ambos ejes son degenerados,
 * centroide softmax 5x5.
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
    x256: x64 * STRIDE,
    y256: y64 * STRIDE,
    argmax: { x: bestX, y: bestY, logit: best },
    refinement: dxValid || dyValid ? 'quadratic' : 'centroid5x5',
  };
}

function canonicalizarQuad(points) {
  if (!Array.isArray(points) || points.length !== 4) {
    throw new Error('docquad_bad_quad');
  }

  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;

  const ordered = points
    .map((p, i) => ({ ...p, _i: i, _a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((a, b) => a._a - b._a || a._i - b._i)
    .map(({ x, y }) => ({ x, y }));

  let tl = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const s = ordered[i].x + ordered[i].y;
    if (s < best) {
      best = s;
      tl = i;
    }
  }

  return [0, 1, 2, 3].map((i) => ordered[(tl + i) % 4]);
}

function areaAbs(points) {
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function orient(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, p, eps = 1e-9) {
  if (Math.abs(orient(a, b, p)) > eps) return false;
  return (
    Math.min(a.x, b.x) - eps <= p.x && p.x <= Math.max(a.x, b.x) + eps &&
    Math.min(a.y, b.y) - eps <= p.y && p.y <= Math.max(a.y, b.y) + eps
  );
}

function signo(v, eps = 1e-9) {
  if (v > eps) return 1;
  if (v < -eps) return -1;
  return 0;
}

function segmentosIntersectan(a, b, c, d) {
  const eps = 1e-9;
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  const s1 = signo(o1, eps);
  const s2 = signo(o2, eps);
  const s3 = signo(o3, eps);
  const s4 = signo(o4, eps);

  if (s1 === 0 && onSegment(a, b, c, eps)) return true;
  if (s2 === 0 && onSegment(a, b, d, eps)) return true;
  if (s3 === 0 && onSegment(c, d, a, eps)) return true;
  if (s4 === 0 && onSegment(c, d, b, eps)) return true;

  return s1 * s2 < 0 && s3 * s4 < 0;
}

function selfIntersects(points) {
  return (
    segmentosIntersectan(points[0], points[1], points[2], points[3]) ||
    segmentosIntersectan(points[1], points[2], points[3], points[0])
  );
}

function esConvexo(points) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const cross = orient(points[i], points[(i + 1) % 4], points[(i + 2) % 4]);
    if (Math.abs(cross) <= 1e-9) return false;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

function distancia(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function edgeLengthMin(points) {
  let min = Infinity;
  for (let i = 0; i < 4; i++) min = Math.min(min, distancia(points[i], points[(i + 1) % 4]));
  return min;
}

function edgeLengthMax(points) {
  let max = 0;
  for (let i = 0; i < 4; i++) max = Math.max(max, distancia(points[i], points[(i + 1) % 4]));
  return max;
}

function oob1d(v, min, max) {
  if (v < min) return min - v;
  if (v > max) return v - max;
  return 0;
}

function oobSum(points, w, h, tol) {
  const left = -tol;
  const top = -tol;
  const right = w - 1 + tol;
  const bottom = h - 1 + tol;
  return points.reduce(
    (sum, p) => sum + oob1d(p.x, left, right) + oob1d(p.y, top, bottom),
    0
  );
}

function oobMax(points, w, h, tol) {
  const left = -tol;
  const top = -tol;
  const right = w - 1 + tol;
  const bottom = h - 1 + tol;
  return points.reduce(
    (max, p) => Math.max(max, oob1d(p.x, left, right) + oob1d(p.y, top, bottom)),
    0
  );
}

function quadPenaltyGeometry(points) {
  if (!Array.isArray(points) || points.length !== 4) return 1e6;
  if (!points.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return 1e6;

  let penalty = 0;
  const oobS = oobSum(points, 256, 256, 2);
  if (oobS > 0) penalty += oobS * 10;

  const oobM = oobMax(points, 256, 256, 2);
  if (oobM > 16) penalty += 1e5 + (oobM - 16) * 1000;

  if (selfIntersects(points)) penalty += 1e6;
  if (!esConvexo(points)) penalty += 1e6;
  if (!(areaAbs(points) > 1)) penalty += 1e6;

  const edgeMin = edgeLengthMin(points);
  const edgeMax = edgeLengthMax(points);
  if (edgeMin < 8) penalty += (8 - edgeMin) * 1000;

  const ratio = edgeMax / Math.max(edgeMin, 1e-9);
  if (ratio > 25) penalty += (ratio - 25) * 100;

  return penalty;
}

function pointInPolyInclusive(poly, px, py) {
  const p = { x: px, y: py };
  for (let i = 0; i < 4; i++) {
    if (onSegment(poly[i], poly[(i + 1) % 4], p)) return true;
  }

  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersect =
      (a.y > py) !== (b.y > py) &&
      px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function maskDisagreementPenaltyForCorners(quadCorners256, maskTensor) {
  const quad64 = quadCorners256.map((p) => ({ x: p.x / 4, y: p.y / 4 }));
  const grid = [0, 8, 16, 24, 32, 40, 48, 56];
  let disagree = 0;

  for (const gy of grid) {
    for (const gx of grid) {
      const inQuad = pointInPolyInclusive(quad64, gx + 0.5, gy + 0.5);
      const inMask = sigmoid(maskTensor.data[gy * GRID + gx]) > 0.5;
      if (inQuad !== inMask) disagree++;
    }
  }

  return disagree * 10;
}

function quadDesdeMask(maskTensor, fallbackCorners256) {
  const puntos = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (sigmoid(maskTensor.data[y * GRID + x]) > 0.5) {
        puntos.push({ x: x + 0.5, y: y + 0.5 });
      }
    }
  }

  if (!puntos.length) return { quad256: fallbackCorners256, usedFallback: true };

  const cx = puntos.reduce((s, p) => s + p.x, 0) / puntos.length;
  const cy = puntos.reduce((s, p) => s + p.y, 0) / puntos.length;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return { quad256: fallbackCorners256, usedFallback: true };
  }

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of puntos) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  sxx /= puntos.length;
  sxy /= puntos.length;
  syy /= puntos.length;

  const trace = sxx + syy;
  if (!Number.isFinite(trace) || trace < 1e-12) {
    return { quad256: fallbackCorners256, usedFallback: true };
  }

  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
  const lambda1 = trace / 2 + disc;

  let v1x;
  let v1y;
  if (Math.abs(sxy) > 1e-12) {
    v1x = lambda1 - syy;
    v1y = sxy;
  } else if (sxx >= syy) {
    v1x = 1;
    v1y = 0;
  } else {
    v1x = 0;
    v1y = 1;
  }

  const n = Math.hypot(v1x, v1y);
  if (!n || !Number.isFinite(n)) {
    return { quad256: fallbackCorners256, usedFallback: true };
  }
  v1x /= n;
  v1y /= n;
  const v2x = -v1y;
  const v2y = v1x;

  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const p of puntos) {
    const px = p.x - cx;
    const py = p.y - cy;
    const u = px * v1x + py * v1y;
    const v = px * v2x + py * v2y;
    uMin = Math.min(uMin, u);
    uMax = Math.max(uMax, u);
    vMin = Math.min(vMin, v);
    vMax = Math.max(vMax, v);
  }

  if (
    ![uMin, uMax, vMin, vMax].every(Number.isFinite) ||
    uMax - uMin < 1e-12 ||
    vMax - vMin < 1e-12
  ) {
    return { quad256: fallbackCorners256, usedFallback: true };
  }

  const quad64 = canonicalizarQuad([
    { x: cx + uMax * v1x + vMax * v2x, y: cy + uMax * v1y + vMax * v2y },
    { x: cx + uMin * v1x + vMax * v2x, y: cy + uMin * v1y + vMax * v2y },
    { x: cx + uMin * v1x + vMin * v2x, y: cy + uMin * v1y + vMin * v2y },
    { x: cx + uMax * v1x + vMin * v2x, y: cy + uMax * v1y + vMin * v2y },
  ]);

  return {
    quad256: quad64.map((p) => ({ x: p.x * STRIDE, y: p.y * STRIDE })),
    usedFallback: false,
  };
}

function maxCornerDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 4 || b.length !== 4) return Infinity;
  return Math.max(...a.map((p, i) => distancia(p, b[i])));
}

function elegirCamino(quadCorners256, quadMask256, maskUsedFallback, maskTensor) {
  const pAGeom = quadPenaltyGeometry(quadCorners256);
  const pA = pAGeom + maskDisagreementPenaltyForCorners(quadCorners256, maskTensor);

  if (maskUsedFallback) {
    return {
      quad256: quadCorners256,
      source: 'CORNERS',
      penaltyCorners: pA,
      penaltyCornersGeometry: pAGeom,
      penaltyMask: Infinity,
      agreementMax: Infinity,
    };
  }

  const pB = quadPenaltyGeometry(quadMask256);

  if (pAGeom >= HARD_PENALTY_THRESHOLD && pB < HARD_PENALTY_THRESHOLD) {
    return {
      quad256: quadMask256,
      source: 'MASK',
      penaltyCorners: pA,
      penaltyCornersGeometry: pAGeom,
      penaltyMask: pB,
      agreementMax: maxCornerDistance(quadCorners256, quadMask256),
    };
  }

  if (pB >= HARD_PENALTY_THRESHOLD) {
    return {
      quad256: quadCorners256,
      source: 'CORNERS',
      penaltyCorners: pA,
      penaltyCornersGeometry: pAGeom,
      penaltyMask: pB,
      agreementMax: maxCornerDistance(quadCorners256, quadMask256),
    };
  }

  const agreementMax = maxCornerDistance(quadCorners256, quadMask256);
  if (agreementMax > AGREEMENT_MAX_CORNER_DIST) {
    return {
      quad256: quadCorners256,
      source: 'CORNERS',
      penaltyCorners: pA,
      penaltyCornersGeometry: pAGeom,
      penaltyMask: pB,
      agreementMax,
    };
  }

  if (pB < pAGeom - MASK_SCORE_MARGIN) {
    return {
      quad256: quadMask256,
      source: 'MASK',
      penaltyCorners: pA,
      penaltyCornersGeometry: pAGeom,
      penaltyMask: pB,
      agreementMax,
    };
  }

  return {
    quad256: quadCorners256,
    source: 'CORNERS',
    penaltyCorners: pA,
    penaltyCornersGeometry: pAGeom,
    penaltyMask: pB,
    agreementMax,
  };
}

function evaluarSospechoso({ confidence, maskStats, maskUsedFallback, choice, quadMask256 }) {
  if (confidence.some((z) => Number.isFinite(z) && z < PEAK_SIGMA_THRESHOLD)) {
    return 'LOW_PEAK_MARGIN';
  }

  if (
    maskStats.meanProb > MASK_DIFFUSE_MEAN_THRESHOLD &&
    maskStats.areaGt05 < MASK_DIFFUSE_MIN_AREA
  ) {
    return 'MASK_DIFFUSE';
  }

  if (maskUsedFallback && choice.penaltyCorners > GEOMETRY_IMPLAUSIBLE_THRESHOLD) {
    return 'MASK_FALLBACK_AND_PCORNER';
  }

  if (!maskUsedFallback && choice.source === 'CORNERS') {
    if (maxCornerDistance(choice.quad256, quadMask256) > 64) {
      return 'DISAGREE_64PX';
    }
  }

  const chosenPenalty = choice.source === 'MASK' ? choice.penaltyMask : choice.penaltyCorners;
  if (chosenPenalty >= GEOMETRY_IMPLAUSIBLE_THRESHOLD) {
    return 'GEOMETRY_IMPLAUSIBLE';
  }

  return null;
}

function proyectarOriginal(points256, letterbox, srcW, srcH) {
  const pixels = points256.map((p) => inversaLetterbox(p.x, p.y, letterbox));
  const normalized = pixels.map((p) => ({ x: p.x / srcW, y: p.y / srcH }));
  return { pixels, normalized };
}

function postprocesarEsquinas(cornerTensor, maskTensor, letterbox, srcW, srcH) {
  validarHeatmaps(cornerTensor);
  validarMask(maskTensor);

  const data = cornerTensor.data;
  const detalles = [];
  const confidence = [];
  const corners256 = [];

  for (let c = 0; c < CHANNELS; c++) {
    const refined = refinarEsquina(data, c);
    const stat = estadisticaCanal(data, c);
    detalles.push({ name: CORNER_NAMES[c], ...refined, heatmap: stat });
    confidence.push(stat.z);
    corners256.push({ x: refined.x256, y: refined.y256 });
  }

  const maskStats = estadisticaMask(maskTensor);
  const maskQuad = quadDesdeMask(maskTensor, corners256);
  const choice = elegirCamino(corners256, maskQuad.quad256, maskQuad.usedFallback, maskTensor);

  const chosen = proyectarOriginal(choice.quad256, letterbox, srcW, srcH);
  const cornersOriginal = proyectarOriginal(corners256, letterbox, srcW, srcH);
  const maskOriginal = proyectarOriginal(maskQuad.quad256, letterbox, srcW, srcH);

  const finite = chosen.normalized.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const plausibleBounds = chosen.normalized.every(
    (p) => p.x >= -0.25 && p.x <= 1.25 && p.y >= -0.25 && p.y <= 1.25
  );
  const convex = finite && esConvexo(chosen.normalized);
  const area = finite ? areaAbs(chosen.normalized) : 0;
  const geometryValid = finite && plausibleBounds && convex;

  const suspiciousReason = evaluarSospechoso({
    confidence,
    maskStats,
    maskUsedFallback: maskQuad.usedFallback,
    choice,
    quadMask256: maskQuad.quad256,
  });

  return {
    // Contrato histórico de TapptScan: `corners` es SIEMPRE el quad elegido.
    corners: chosen.normalized,
    cornersPixels: chosen.pixels,
    confidenceZ: confidence,
    minConfidenceZ: Math.min(...confidence),
    mask: maskStats,
    area,
    valid: geometryValid && !suspiciousReason,
    suspicious: Boolean(suspiciousReason),
    suspiciousReason,
    chosenSource: choice.source,
    penalties: {
      corners: choice.penaltyCorners,
      cornersGeometry: choice.penaltyCornersGeometry,
      mask: choice.penaltyMask,
      agreementMax: choice.agreementMax,
    },
    validation: { finite, plausibleBounds, convex, area, geometryValid },
    details: detalles,
    candidates: {
      corners: cornersOriginal.normalized,
      mask: maskOriginal.normalized,
      maskUsedFallback: maskQuad.usedFallback,
    },
  };
}

module.exports = {
  postprocesarEsquinas,
  esConvexoTLTRBRBL: esConvexo,
  areaNormalizada: areaAbs,
  refinarEsquina,
  estadisticaMask,
  evaluarSospechoso,
  quadDesdeMask,
  elegirCamino,
  quadPenaltyGeometry,
  canonicalizarQuad,
};
