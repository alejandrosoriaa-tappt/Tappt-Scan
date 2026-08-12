'use strict';

const fs = require('fs');
const ort = require('onnxruntime-web');

// En Node usamos WASM single-thread para el spike. Evita el binario nativo
// que bloqueó a onnxruntime-node en el entorno anterior y mantiene el
// adapter reemplazable: producción puede migrar a onnxruntime-node después.
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

class OrtRuntimeNode {
  constructor(modelPath) {
    this.modelPath = modelPath;
    this.session = null;
  }

  async init() {
    if (this.session) return this;
    const model = new Uint8Array(fs.readFileSync(this.modelPath));
    this.session = await ort.InferenceSession.create(model, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    return this;
  }

  async run(inputNchw) {
    if (!this.session) await this.init();
    if (!(inputNchw instanceof Float32Array) || inputNchw.length !== 3 * 256 * 256) {
      throw new Error('docquad_bad_input_tensor');
    }

    const input = new ort.Tensor('float32', inputNchw, [1, 3, 256, 256]);
    const outputs = await this.session.run({ input });

    const maskLogits = outputs.mask_logits;
    const cornerHeatmaps = outputs.corner_heatmaps;
    if (!maskLogits || !cornerHeatmaps) {
      throw new Error(`docquad_missing_outputs:${Object.keys(outputs).join(',')}`);
    }

    return { maskLogits, cornerHeatmaps };
  }
}

module.exports = { OrtRuntimeNode };
