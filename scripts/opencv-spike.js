'use strict';

const fs = require('fs');
const path = require('path');
const cvModule = require('@techstark/opencv-js');
const { createCanvas, loadImage, ImageData } = require('@napi-rs/canvas');

const MAX_EDGE = 720;

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

function rectScore(q) {
  let score = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const prev = q[(i + 3) % 4];
    const next = q[(i + 1) % 4];
    const deg = angulo(prev, a, next);
    if (!Number.isFinite(deg) || deg < 60 || deg > 120) return -1;
    score += Math.max(0, 30 - Math.abs(deg - 90));
  }
  return score;
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
  const hierarchy = new cv.Mat();
  const contours = new cv.MatVector();
  let kernel = null;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // Rama 1: pipeline clásico de scanner (GaussianBlur -> Canny), como los
    // repos de CamScanner/OpenCV revisados por el usuario.
    cv.medianBlur(blur, med, 3);
    const meanGray = cv.mean(med)[0];
    const lowerDirect = Math.max(0, 0.67 * meanGray);
    const upperDirect = Math.min(255, 1.33 * meanGray);
    cv.Canny(med, edgesDirect, lowerDirect, upperDirect, 3, true);

    // Un Canny fijo de respaldo evita que una imagen de alto promedio deje
    // thresholds adaptativos demasiado altos para bordes finos del papel.
    cv.Canny(blur, edgesFixed, 30, 100, 3, true);

    // Rama 2: la ruta morfológica de MakeACopy. El threshold aquí es sólo
    // preproceso, no el antiguo detector Otsu de TapptScan.
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

    // Best-of fusion: cualquier borde encontrado por cualquiera de las tres
    // rutas sobrevive para findContours.
    cv.bitwise_or(edgesDirect, edgesMorph, edges);
    cv.bitwise_or(edges, edgesFixed, edges);

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const totalContours = contours.size();
    const imgArea = src.cols * src.rows;
    let bestScore = -1;
    let bestQuad = null;
    let candidatos = 0;

    for (let i = 0; i < totalContours; i++) {
      const contour = contours.get(i);
      try {
        const area = cv.contourArea(contour, false);
        if (area < imgArea * 0.08) continue;

        const approx = new cv.Mat();
        try {
          // findContours ya entrega CV_32SC2; mantener ese tipo evita perder
          // los puntos al leer data32S después de approxPolyDP.
          const perimeter = cv.arcLength(contour, true);
          cv.approxPolyDP(contour, approx, perimeter * 0.015, true);
          if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue;

          const quad = ordenarPuntos(matPointVectorToArray(approx));
          const w1 = distancia(quad[0], quad[1]);
          const w2 = distancia(quad[2], quad[3]);
          const h1 = distancia(quad[1], quad[2]);
          const h2 = distancia(quad[3], quad[0]);
          const avgWidth = (w1 + w2) / 2;
          const avgHeight = (h1 + h2) / 2;
          const aspect = avgHeight / (avgWidth + 1e-9);
          const rectRaw = rectScore(quad);
          if (rectRaw < 0 || aspect <= 0.5 || aspect >= 2.5) continue;

          candidatos++;
          const score = 0.6 * (area / imgArea) + 0.4 * (rectRaw / 120);
          if (score > bestScore) {
            bestScore = score;
            bestQuad = quad;
          }
        } finally {
          approx.delete();
        }
      } finally {
        contour.delete();
      }
    }

    if (!bestQuad) {
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
        contours: totalContours,
        candidatos,
        thresholds: {
          direct: [lowerDirect, upperDirect],
          fixed: [30, 100],
        },
      };
    }

    const normalized = bestQuad.map((p) => ({ x: p.x / img.width, y: p.y / img.height }));
    const area = Math.abs(
      normalized.reduce((sum, p, i) => {
        const q = normalized[(i + 1) % 4];
        return sum + p.x * q.y - q.x * p.y;
      }, 0) / 2
    );

    return {
      valid: true,
      source: 'opencv',
      score: bestScore,
      area,
      image: {
        width: img.width,
        height: img.height,
        srcW: img.srcW,
        srcH: img.srcH,
        scale: img.scale,
      },
      contours: totalContours,
      candidatos,
      thresholds: {
        direct: [lowerDirect, upperDirect],
        fixed: [30, 100],
      },
      corners: normalized,
      cornersPixelsDetection: bestQuad,
      cornersPixelsOriginal: normalized.map((p) => ({ x: p.x * img.srcW, y: p.y * img.srcH })),
    };
  } finally {
    if (kernel) kernel.delete();
    contours.delete();
    hierarchy.delete();
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

  process.exit(result.valid ? 0 : 3);
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
