'use strict';

const fs = require('fs');
const path = require('path');
const ortWeb = require('onnxruntime-web');
const ortNode = require('onnxruntime-node');
const { asegurarModelo } = require('../scanner/docquad/model');
const { prepararEntrada } = require('../scanner/docquad/preprocess');

ortWeb.env.wasm.numThreads = 1;
ortWeb.env.wasm.proxy = false;

function argmaxPorCanal(tensor, canales, alto, ancho) {
  const hw = alto * ancho;
  const out = [];
  for (let c = 0; c < canales; c++) {
    let best = -Infinity;
    let bestI = -1;
    const offset = c * hw;
    for (let i = 0; i < hw; i++) {
      const v = tensor.data[offset + i];
      if (v > best) {
        best = v;
        bestI = i;
      }
    }
    out.push({ index: bestI, x: bestI % ancho, y: Math.floor(bestI / ancho), value: best });
  }
  return out;
}

function comparar(a, b) {
  if (a.data.length !== b.data.length) throw new Error('runtime_compare_length_mismatch');
  let max = 0;
  let sum = 0;
  let maxIndex = 0;
  for (let i = 0; i < a.data.length; i++) {
    const d = Math.abs(a.data[i] - b.data[i]);
    sum += d;
    if (d > max) {
      max = d;
      maxIndex = i;
    }
  }
  return { maxAbs: max, meanAbs: sum / a.data.length, maxIndex };
}

(async () => {
  const imagePath = process.argv[2];
  if (!imagePath) throw new Error('uso: node scripts/docquad-compare-runtimes.js foto.jpg');

  const buffer = fs.readFileSync(path.resolve(imagePath));
  const preparado = await prepararEntrada(buffer);
  const modelPath = await asegurarModelo();
  const modelBytes = new Uint8Array(fs.readFileSync(modelPath));

  const webSession = await ortWeb.InferenceSession.create(modelBytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  const nodeSession = await ortNode.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
  });

  const webInput = new ortWeb.Tensor('float32', preparado.input, [1, 3, 256, 256]);
  const nodeInput = new ortNode.Tensor('float32', preparado.input, [1, 3, 256, 256]);

  const [webOut, nodeOut] = await Promise.all([
    webSession.run({ input: webInput }),
    nodeSession.run({ input: nodeInput }),
  ]);

  const report = {
    image: { width: preparado.srcW, height: preparado.srcH },
    corner: {
      webDims: webOut.corner_heatmaps.dims,
      nodeDims: nodeOut.corner_heatmaps.dims,
      diff: comparar(webOut.corner_heatmaps, nodeOut.corner_heatmaps),
      webArgmax: argmaxPorCanal(webOut.corner_heatmaps, 4, 64, 64),
      nodeArgmax: argmaxPorCanal(nodeOut.corner_heatmaps, 4, 64, 64),
    },
    mask: {
      webDims: webOut.mask_logits.dims,
      nodeDims: nodeOut.mask_logits.dims,
      diff: comparar(webOut.mask_logits, nodeOut.mask_logits),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  // CPU y WASM pueden diferir levemente en punto flotante, pero no deben
  // cambiar la geometría/posición de los peaks. Un maxAbs grande o argmax
  // distinto indica un problema real del runtime/EP, no del postproceso.
  if (report.corner.diff.maxAbs > 1e-3 || report.mask.diff.maxAbs > 1e-3) {
    process.exitCode = 4;
  }
})();
