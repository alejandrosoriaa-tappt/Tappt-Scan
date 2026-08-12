'use strict';

const cvModule = require('@techstark/opencv-js');
const { createCanvas, loadImage, ImageData } = require('@napi-rs/canvas');

const MAX_EDGE = 720;
const MIN_AREA_CONFIABLE = 0.10;
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
  const data32S = approx.data32S;
  if (!data32S?.length) throw new Error(`opencv_approx_not_int:${approx.type()}`);

  const out = [];
  for (let i = 0; i < data32S.length; i += 2) {
    out.push({ x: data32S[i], y: data32S[i + 1] });
  }
  return out;
}

function evaluarQuad(quad, areaContour, imgArea, opciones) {
  if (!quad || quad.length !== 4) return null;
  const q = ordenarPuntos(quad);

  const w1 = distancia(q[0], q[1]);
  const w2 = distancia(q[2], q[3]);
  const h1 = distancia(q[1], q[2]);
  const h2 = distancia(q[3], q[0]);
  const avgWidth = (w1 + w2) / 2;
  const avgHeight = (h1 + h2) / 2;
  const aspect = avgHeight / (avgWidth + 1e-9);
  const rectRaw = rectScore(q, opciones.minAngle, opciones.maxAngle);

  if (rectRaw < 0 || aspect <= opciones.minAspect || aspect >= opciones.maxAspect) return null;

  const areaNorm = areaContour / imgArea;
  const score = 0.7 * areaNorm + 0.3 * (rectRaw / 120);
  return { quad: q, score, areaNorm, aspect, angles: angulosQuad(q) };
}

function mejorQuadDeContornos(cv, contours, imgArea, opciones) {
  let best = null;
  const total = contours.size();

  for (let i = 0; i < total; i++) {
    const contour = contours.get(i);
    try {
      const area = cv.contourArea(contour, false);
      const areaNorm = area / imgArea;
      if (areaNorm < opciones.minArea) continue;

      const perimeter = cv.arcLength(contour, true);
      for (const eps of EPSILONS) {
        const approx = new cv.Mat();
        try {
          cv.approxPolyDP(contour, approx, perimeter * eps, true);
          if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;

          const candidate = evaluarQuad(
            matPointVectorToArray(approx),
            area,
            imgArea,
            opciones
          );
          if (!candidate) continue;

          candidate.epsilon = eps;
          if (!best || candidate.score > best.score) best = candidate;
        } finally {
          approx.delete();
        }
      }
    } finally {
      contour.delete();
    }
  }

  return { best, total };
}

function detectarPorPapelClaro(cv, gray, imgArea) {
  const thresholds = [120, 140, 160, 180];
  let best = null;

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

      if (result.best) {
        const candidate = {
          ...result.best,
          source: 'opencv-paper',
          thresholdValue,
        };

        if (candidate.areaNorm < 0.95 && (!best || candidate.score > best.score)) {
          best = candidate;
        }
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

  return best;
}

function elegirMejorCandidato(canny, paper) {
  if (!canny) return paper;
  if (!paper) return canny;

  // Los dos motores compiten siempre. Esto evita que un rectángulo interno
  // encontrado por Canny (tabla, recuadro, etiqueta) impida considerar el
  // contorno exterior del papel. El score ya pondera 70% área y 30%
  // rectangularidad, así que el documento exterior convincente debe ganar.
  return paper.score > canny.score ? paper : canny;
}

class OpenCvDocumentDetector {
  constructor({ maxEdge = MAX_EDGE } = {}) {
    this.maxEdge = maxEdge;
    this.cv = null;
  }

  async init() {
    if (!this.cv) this.cv = await cargarCv();
    return this;
  }

  async detectarBuffer(buffer) {
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('opencv_buffer_vacio');
    if (!this.cv) await this.init();

    const inicio = Date.now();
    const img = await bufferAImageData(buffer, this.maxEdge);
    const cv = this.cv;

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

      cv.medianBlur(blur, med, 3);
      const meanGray = cv.mean(med)[0];
      cv.Canny(
        med,
        edgesDirect,
        Math.max(0, 0.67 * meanGray),
        Math.min(255, 1.33 * meanGray),
        3,
        true
      );
      cv.Canny(blur, edgesFixed, 30, 100, 3, true);

      cv.threshold(blur, threshold, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      let kernelSize = Math.max(5, Math.floor(Math.min(src.cols, src.rows) / 50));
      if (kernelSize % 2 === 0) kernelSize++;
      kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize));
      cv.morphologyEx(threshold, morph, cv.MORPH_CLOSE, kernel);
      cv.Canny(
        morph,
        edgesMorph,
        Math.max(0, 0.66 * meanGray),
        Math.min(255, 1.33 * meanGray),
        3,
        true
      );

      cv.bitwise_or(edgesDirect, edgesMorph, edges);
      cv.bitwise_or(edges, edgesFixed, edges);

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

      const cannyCandidate = contourResult.best
        ? { ...contourResult.best, source: 'opencv-canny' }
        : null;
      const paperCandidate = detectarPorPapelClaro(cv, gray, imgArea);
      const candidate = elegirMejorCandidato(cannyCandidate, paperCandidate);

      if (!candidate) {
        return {
          valid: false,
          source: 'opencv',
          reason: 'NO_QUAD',
          area: 0,
          timing: { totalMs: Date.now() - inicio },
        };
      }

      const corners = candidate.quad.map((p) => ({ x: p.x / img.width, y: p.y / img.height }));
      const area = areaQuad(corners);
      const finite = corners.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      const inside = corners.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
      const valid = finite && inside && area >= MIN_AREA_CONFIABLE && area < 0.95;

      return {
        valid,
        source: candidate.source,
        reason: valid ? null : area < MIN_AREA_CONFIABLE ? 'AREA_TOO_SMALL' : 'INVALID_GEOMETRY',
        corners,
        cornersPixels: corners.map((p) => ({ x: p.x * img.srcW, y: p.y * img.srcH })),
        area,
        score: candidate.score,
        aspect: candidate.aspect,
        angles: candidate.angles,
        epsilon: candidate.epsilon,
        thresholdValue: candidate.thresholdValue || null,
        candidates: {
          canny: cannyCandidate
            ? { area: cannyCandidate.areaNorm, score: cannyCandidate.score }
            : null,
          paper: paperCandidate
            ? { area: paperCandidate.areaNorm, score: paperCandidate.score }
            : null,
        },
        image: {
          width: img.width,
          height: img.height,
          srcW: img.srcW,
          srcH: img.srcH,
          scale: img.scale,
        },
        timing: { totalMs: Date.now() - inicio },
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
}

module.exports = {
  OpenCvDocumentDetector,
  cargarCv,
  ordenarPuntos,
  areaQuad,
  elegirMejorCandidato,
  MIN_AREA_CONFIABLE,
};
