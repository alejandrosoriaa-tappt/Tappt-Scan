'use strict';

const fs = require('fs');
const path = require('path');
const cvModule = require('@techstark/opencv-js');
const { createCanvas, loadImage, ImageData } = require('@napi-rs/canvas');

const MAX_EDGE = 720;
const EPSILONS = [0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05];

function timeout(ms, codigo) {
  return new Promise((_, reject) => {
    const id = setTimeout(() => reject(new Error(codigo)), ms);
    id.unref?.();
  });
}

async function cargarCv() {
  let cv = cvModule?.default || cvModule;

  if (cv && typeof cv.then === 'function') {
    cv = await Promise.race([cv, timeout(30_000, 'opencv_init_timeout_promise')]);
  } else if (!cv?.Mat) {
    await Promise.race([
      new Promise((resolve) => {
        cv.onRuntimeInitialized = resolve;
      }),
      timeout(30_000, 'opencv_init_timeout_callback'),
    ]);
  }

  if (!cv?.Mat) throw new Error('opencv_not_initialized');
  return cv;
}

function ordenarPuntos(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const arr = points.slice().sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
  let start = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const s = arr[i].x + arr[i].y;
    if (s < best) {
      best = s;
      start = i;
    }
  }
  return [0, 1, 2, 3].map((i) => arr[(start + i) % 4]);
}

function distancia(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angulo(prev, a, next) {
  const abx = prev.x - a.x;
  const aby = prev.y - a.y;
  const acx = next.x - a.x;
  const acy = next.y - a.y;
  const num = abx * acx + aby * acy;
  const den = Math.hypot(abx, aby) * Math.hypot(acx, acy) + 1e-9;
  return Math.acos(Math.max(-1, Math.min(1, num / den))) * 180 / Math.PI;
}

function angulosQuad(q) {
  return q.map((a, i) => angulo(q[(i + 3) % 4], a, q[(i + 1) % 4]));
}

function rectScore(q, minAngle = 60, maxAngle = 120) {
  let score = 0;
  for (const deg of angulosQuad(q)) {
    if (!Number.isFinite(deg) || deg < minAngle || deg > maxAngle) return -1;
    score += Math.max(0, 30 - Math.abs(deg - 90));
  }
  return score;
}

function areaQuad(q) {
  return Math.abs(
    q.reduce((sum, p, i) => {
      const n = q[(i + 1) % 4];
      return sum + p.x * n.y - n.x * p.y;
    }, 0) / 2
  );
}

async function bufferAImageData(buffer, maxEdge = MAX_EDGE) {
  const image = await loadImage(buffer);
  const srcW = image.width;
  const srcH = image.height;
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 0, 0, width, height);
  const raw = ctx.getImageData(0, 0, width, height);
  const data = new Uint8ClampedArray(raw.data);

  return {
    imageData: new ImageData(data, width, height),
    width,
    height,
    srcW,
    srcH,
    scale,
  };
}

function matPointVectorToArray(approx) {
  const out = [];
  const data32S = approx.data32S;
  if (!data32S?.length) throw new Error(`opencv_approx_not_int:${approx.type()}`);
  for (let i = 0; i < data32S.length; i += 2) {
    out.push({ x: data32S[i], y: data32S[i + 1] });
  }
  return out;
}

function evaluarQuad(quad, areaContour, imgArea, { minAngle, maxAngle, minAspect, maxAspect }) {
  if (!quad || quad.length !== 4) return null;
  const q = ordenarPuntos(quad);
  const w1 = distancia(q[0], q[1]);
  const w2 = distancia(q[2], q[3]);
  const h1 = distancia(q[1], q[2]);
  const h2 = distancia(q[3], q[0]);
  const avgWidth = (w1 + w2) / 2;
  const avgHeight = (h1 + h2) / 2;
  const aspect = avgHeight / (avgWidth + 1e-9);
  const rectRaw = rectScore(q, minAngle, maxAngle);
  if (rectRaw < 0 || aspect <= minAspect || aspect >= maxAspect) return null;

  const areaNorm = areaContour / imgArea;
  const score = 0.7 * areaNorm + 0.3 * (rectRaw / 120);
  return { quad: q, score, areaNorm, aspect, angles: angulosQuad(q) };
}

function mejorQuadDeContornos(cv, contours, imgArea, opciones) {
  let best = null;
  const diagnostics = [];
  const total = contours.size();

  for (let i = 0; i < total; i++) {
    const contour = contours.get(i);
    try {
      const area = cv.contourArea(contour, false);
      const areaNorm = area / imgArea;
      if (areaNorm < opciones.minArea) continue;

      const perimeter = cv.arcLength(contour, true);
      let bestApprox = null;
      const approxCounts = [];

      for (const eps of EPSILONS) {
        const approx = new cv.Mat();
        try {
          cv.approxPolyDP(contour, approx, perimeter * eps, true);
          approxCounts.push([eps, approx.rows]);
          if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;

          const candidate = evaluarQuad(
            matPointVectorToArray(approx),
            area,
            imgArea,
            opciones
          );
          if (!candidate) continue;
          candidate.epsilon = eps;
          if (!bestApprox || candidate.score > bestApprox.score) bestApprox = candidate;
        } finally {
          approx.delete();
        }
      }

      diagnostics.push({ areaNorm, approxCounts, accepted: Boolean(bestApprox) });
      if (bestApprox && (!best || bestApprox.score > best.score)) best = bestApprox;
    } finally {
      contour.delete();
    }
  }

  diagnostics.sort((a, b) => b.areaNorm - a.areaNorm);
  return { best, diagnostics: diagnostics.slice(0, 12), total };
}

function detectarPorPapelClaro(cv, gray, imgArea) {
  const thresholds = [120, 140, 160, 180];
  let best = null;
  const diagnostics = [];

  for (const thresholdValue of thresholds) {
    const mask = new cv.Mat();
    const closed = new cv.Mat();
    const opened = new cv.Mat();
    const hierarchy = new cv.Mat();
    const contours = new cv.MatVector();
    let closeKernel = null;
    let openKernel = null;

    try {
      cv.threshold(gray, mask, thresholdValue, 255, cv.THRESH_BINARY);
      closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(15, 15));
      openKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.morphologyEx(mask, closed, cv.MORPH_CLOSE, closeKernel);
      cv.morphologyEx(closed, opened, cv.MORPH_OPEN, openKernel);
      cv.findContours(opened, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

      const result = mejorQuadDeContornos(cv, contours, imgArea, {
        minArea: 0.15,
        minAngle: 20,
        maxAngle: 160,
        minAspect: 0.3,
        maxAspect: 4.0,
      });

      diagnostics.push({ thresholdValue, top: result.diagnostics });
      if (result.best) {
        const candidate = {
          ...result.best,
          source: 'opencv-paper',
          thresholdValue,
        };
        // Evitar que una escena completamente clara se confunda con papel.
        if (candidate.areaNorm < 0.95 && (!best || candidate.score > best.score)) best = candidate;
      }
    } finally {
      contours.delete();
      hierarchy.delete();
      if (openKernel) openKernel.delete();
      if (closeKernel) closeKernel.delete();
      opened.delete();
      closed.delete();
      mask.delete();
    }
  }

  return { best, diagnostics };
}

async function detectar(cv, buffer) {
  const img = await bufferAImageData(buffer);
  const src = cv.matFromImageData(img.imageData);
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const med = new cv.Mat();
  const threshold = new cv.Mat();
  const morph = new cv.Mat();
  const edgesMorph = new cv.Mat();
  const edgesDirect = new cv.Mat();
  const edgesFixed = new cv.Mat();
  const edges = new cv.Mat();
  const edgesClosed = new cv.Mat();
  const hierarchy = new cv.Mat();
  const contours = new cv.MatVector();
  let kernel = null;
  let edgeKernel = null;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // Rama 1: GaussianBlur -> Canny, pipeline clásico de scanner.
    cv.medianBlur(blur, med, 3);
    const meanGray = cv.mean(med)[0];
    const lowerDirect = Math.max(0, 0.67 * meanGray);
    const upperDirect = Math.min(255, 1.33 * meanGray);
    cv.Canny(med, edgesDirect, lowerDirect, upperDirect, 3, true);
    cv.Canny(blur, edgesFixed, 30, 100, 3, true);

    // Rama 2: preproceso morfológico de MakeACopy.
    cv.threshold(blur, threshold, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    let kernelSize = Math.max(5, Math.floor(Math.min(src.cols, src.rows) / 50));
    if (kernelSize % 2 === 0) kernelSize++;
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize));
    cv.morphologyEx(threshold, morph, cv.MORPH_CLOSE, kernel);

    const meanMorph = cv.mean(blur)[0];
    cv.Canny(
      morph,
      edgesMorph,
      Math.max(0, 0.66 * meanMorph),
      Math.min(255, 1.33 * meanMorph),
      3,
      true
    );

    cv.bitwise_or(edgesDirect, edgesMorph, edges);
    cv.bitwise_or(edges, edgesFixed, edges);

    // Cerrar pequeños huecos ayuda a convertir bordes fragmentados del papel
    // en contornos utilizables sin tocar la foto full-res.
    edgeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(edges, edgesClosed, cv.MORPH_CLOSE, edgeKernel);

    cv.findContours(edgesClosed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = src.cols * src.rows;
    const contourResult = mejorQuadDeContornos(cv, contours, imgArea, {
      minArea: 0.02,
      minAngle: 28,
      maxAngle: 152,
      minAspect: 0.3,
      maxAspect: 4.0,
    });

    let candidate = contourResult.best
      ? { ...contourResult.best, source: 'opencv-canny' }
      : null;

    let paperResult = null;
    if (!candidate) {
      paperResult = detectarPorPapelClaro(cv, gray, imgArea);
      candidate = paperResult.best;
    }

    if (!candidate) {
      return {
        valid: false,
        reason: 'NO_QUAD',
        image: {
          width: img.width,
          height: img.height,
          srcW: img.srcW,
          srcH: img.srcH,
          scale: img.scale,
        },
        contours: contourResult.total,
        contourDiagnostics: contourResult.diagnostics,
        paperDiagnostics: paperResult?.diagnostics || null,
        thresholds: {
          direct: [lowerDirect, upperDirect],
          fixed: [30, 100],
        },
      };
    }

    const normalized = candidate.quad.map((p) => ({ x: p.x / img.width, y: p.y / img.height }));
    const normalizedArea = areaQuad(normalized);

    return {
      valid: true,
      source: candidate.source,
      score: candidate.score,
      area: normalizedArea,
      candidateArea: candidate.areaNorm,
      aspect: candidate.aspect,
      angles: candidate.angles,
      epsilon: candidate.epsilon,
      thresholdValue: candidate.thresholdValue || null,
      image: {
        width: img.width,
        height: img.height,
        srcW: img.srcW,
        srcH: img.srcH,
        scale: img.scale,
      },
      contours: contourResult.total,
      thresholds: {
        direct: [lowerDirect, upperDirect],
        fixed: [30, 100],
      },
      corners: normalized,
      cornersPixelsDetection: candidate.quad,
      cornersPixelsOriginal: normalized.map((p) => ({ x: p.x * img.srcW, y: p.y * img.srcH })),
    };
  } finally {
    if (edgeKernel) edgeKernel.delete();
    if (kernel) kernel.delete();
    contours.delete();
    hierarchy.delete();
    edgesClosed.delete();
    edges.delete();
    edgesFixed.delete();
    edgesDirect.delete();
    edgesMorph.delete();
    morph.delete();
    threshold.delete();
    med.delete();
    blur.delete();
    gray.delete();
    src.delete();
  }
}

(async () => {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) throw new Error('uso: node scripts/opencv-spike.js foto.jpg [resultado.json]');

  const cv = await cargarCv();
  const result = await detectar(cv, fs.readFileSync(path.resolve(input)));
  const json = JSON.stringify(result, null, 2);
  console.log(json);
  if (output) fs.writeFileSync(path.resolve(output), `${json}\n`);

  if (!result.valid && process.env.OPENCV_ALLOW_INVALID !== '1') process.exit(3);
  process.exit(0);
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
