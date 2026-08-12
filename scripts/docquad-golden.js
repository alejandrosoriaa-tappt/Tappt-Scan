'use strict';

const { asegurarModelo } = require('../scanner/docquad/model');
const { OrtRuntimeNode } = require('../scanner/docquad/ort-runtime.node');

// Referencia publicada por MakeACopy para el modelo entrenado sobre su
// input sintético determinista sample0 (training/docquad_m3/golden_samples.py).
const EXPECTED = {
  cornerMean: -17.46522184521433,
  cornerStd: 6.2083616304459195,
  maskArea: 692,
  maskMean: -18.49719167290459,
  maskStd: 15.37704817183681,
};

function crearGoldenInput() {
  const W = 256;
  const H = 256;
  const HW = W * H;
  const x = new Float32Array(3 * HW);

  for (let y = 0; y < H; y++) {
    for (let xx = 0; xx < W; xx++) {
      const i = y * W + xx;
      x[i] = xx / 255;       // R: gradiente horizontal
      x[HW + i] = y / 255;   // G: gradiente vertical
      x[2 * HW + i] = 0.25;  // B: constante
    }
  }

  for (let y = 64; y < 192; y++) {
    for (let xx = 64; xx < 192; xx++) {
      x[y * W + xx] = 1.0;
    }
  }

  return x;
}

function stats(data) {
  let sum = 0;
  for (const v of data) sum += v;
  const mean = sum / data.length;
  let sumSq = 0;
  for (const v of data) {
    const d = v - mean;
    sumSq += d * d;
  }
  return { mean, std: Math.sqrt(sumSq / data.length) };
}

function maskArea(data) {
  // sigmoid(logit) > 0.5 equivale a logit > 0, con comparación estricta.
  let n = 0;
  for (const v of data) if (v > 0) n++;
  return n;
}

function cerca(actual, esperado, tol = 1e-4) {
  return Math.abs(actual - esperado) <= tol;
}

(async () => {
  try {
    const modelPath = await asegurarModelo();
    const runtime = await new OrtRuntimeNode(modelPath).init();
    const out = await runtime.run(crearGoldenInput());

    const corners = stats(out.cornerHeatmaps.data);
    const mask = stats(out.maskLogits.data);
    const area = maskArea(out.maskLogits.data);

    const checks = {
      cornerMean: cerca(corners.mean, EXPECTED.cornerMean),
      cornerStd: cerca(corners.std, EXPECTED.cornerStd),
      maskArea: area === EXPECTED.maskArea,
      maskMean: cerca(mask.mean, EXPECTED.maskMean),
      maskStd: cerca(mask.std, EXPECTED.maskStd),
    };

    const report = {
      ok: Object.values(checks).every(Boolean),
      checks,
      actual: {
        cornerMean: corners.mean,
        cornerStd: corners.std,
        maskArea: area,
        maskMean: mask.mean,
        maskStd: mask.std,
      },
      expected: EXPECTED,
      outputShapes: {
        corner: out.cornerHeatmaps.dims,
        mask: out.maskLogits.dims,
      },
    };

    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    process.exitCode = 1;
  }
})();
