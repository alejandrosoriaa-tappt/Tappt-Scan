'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { createCanvas, loadImage, ImageData } = require('@napi-rs/canvas');

const OPENCV_VERSION = '4.13.0';
const OPENCV_URL = `https://docs.opencv.org/${OPENCV_VERSION}/opencv.js`;
const CACHE_DIR = path.join(process.cwd(), '.cache', 'opencv');
const OPENCV_PATH = path.join(CACHE_DIR, `opencv-${OPENCV_VERSION}.js`);
const MAX_EDGE = 720;

function descargar(url, redirecciones = 0) {
  if (redirecciones > 5) return Promise.reject(new Error('opencv_too_many_redirects'));
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'TapptScan-OpenCV-Spike/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(descargar(new URL(res.headers.location, url).toString(), redirecciones + 1));
        return;
      }
      if (res.statusCode !== 200) {
        const status = res.statusCode;
        res.resume();
        reject(new Error(`opencv_http_${status}`));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(90_000, () => req.destroy(new Error('opencv_download_timeout')));
    req.on('error', reject);
  });
}

async function asegurarOpenCvJs() {
  if (fs.existsSync(OPENCV_PATH) && fs.statSync(OPENCV_PATH).size > 1_000_000) return OPENCV_PATH;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const bytes = await descargar(OPENCV_URL);
  if (bytes.length < 1_000_000) throw new Error(`opencv_download_too_small:${bytes.length}`);
  const tmp = `${OPENCV_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, bytes);
  fs.renameSync(tmp, OPENCV_PATH);
  return OPENCV_PATH;
}

async function cargarCv() {
  const file = await asegurarOpenCvJs();

  let resolver;
  const initialized = new Promise((resolve) => { resolver = resolve; });
  global.Module = { onRuntimeInitialized: () => resolver() };

  // eslint-disable-next-line global-require, import/no-dynamic-require
  let cv = require(file);
  if (cv && typeof cv.then === 'function') cv = await cv;

  if (!cv?.Mat) {
    await Promise.race([
      initialized,
      new Promise((_, reject) => setTimeout(() => reject(new Error('opencv_init_timeout')), 30_000)),
    ]);
    cv = global.cv || cv;
  }

  if (!cv?.Mat) throw new Error('opencv_not_initialized');
  return cv;
}

function ordenarPuntos(points) {
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;
  const arr = points.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const s = arr[i].x + arr[i].y;
    if (s < best) { best = s; start = i; }
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
  // OpenCV.js sólo necesita el shape {data,width,height}; ImageData explícito
  // mantiene compatibilidad con builds que verifican instanceof.
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
  const out = [];
  for (let i = 0; i < data32S.length; i += 2) out.push({ x: data32S[i], y: data32S[i + 1] });
  return out;
}

async function detectar(cv, buffer) {
  const img = await bufferAImageData(buffer);
  const src = cv.matFromImageData(img.imageData);
  const gray = new cv.Mat();
  const threshold = new cv.Mat();
  const morph = new cv.Mat();
  const edges = new cv.Mat();
  const hierarchy = new cv.Mat();
  const contours = new cv.MatVector();
  let kernel = null;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    // Esto NO es el detector Otsu viejo de TapptScan. Aquí el umbral es sólo
    // una etapa de preprocesamiento dentro del pipeline OpenCV completo que
    // después usa Canny, contornos y aproximación poligonal.
    cv.threshold(gray, threshold, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    let kernelSize = Math.max(5, Math.floor(Math.min(src.cols, src.rows) / 50));
    if (kernelSize % 2 === 0) kernelSize++;
    kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize));
    cv.morphologyEx(threshold, morph, cv.MORPH_CLOSE, kernel);

    const mean = cv.mean(gray)[0];
    const cannyLower = Math.max(0, 0.66 * mean);
    const cannyUpper = Math.min(255, 1.33 * mean);
    cv.Canny(morph, edges, cannyLower, cannyUpper);

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = src.cols * src.rows;
    let bestScore = -1;
    let bestQuad = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour, false);
      if (area < imgArea * 0.08) {
        contour.delete();
        continue;
      }

      const curve = new cv.Mat();
      const approx = new cv.Mat();
      try {
        contour.convertTo(curve, cv.CV_32FC2);
        const perimeter = cv.arcLength(curve, true);
        cv.approxPolyDP(curve, approx, perimeter * 0.015, true);
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
        if (rectRaw < 0) continue;

        const score = 0.6 * (area / imgArea) + 0.4 * (rectRaw / 120);
        if (aspect > 0.5 && aspect < 2.5 && score > bestScore) {
          bestScore = score;
          bestQuad = quad;
        }
      } finally {
        curve.delete();
        approx.delete();
        contour.delete();
      }
    }

    if (!bestQuad) return { valid: false, reason: 'NO_QUAD', image: img, contours: contours.size() };

    const normalized = bestQuad.map((p) => ({ x: p.x / img.width, y: p.y / img.height }));
    return {
      valid: true,
      source: 'opencv',
      score: bestScore,
      image: img,
      corners: normalized,
      cornersPixelsDetection: bestQuad,
      cornersPixelsOriginal: normalized.map((p) => ({ x: p.x * img.srcW, y: p.y * img.srcH })),
    };
  } finally {
    if (kernel) kernel.delete();
    contours.delete();
    hierarchy.delete();
    edges.delete();
    morph.delete();
    threshold.delete();
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
  if (!result.valid) process.exitCode = 3;
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message, stack: err.stack }, null, 2));
  process.exitCode = 1;
});
