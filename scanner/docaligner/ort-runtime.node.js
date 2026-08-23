'use strict';

const fs = require('fs');

class DocAlignerOrtRuntimeNode {
  constructor(modelPath) {
    this.modelPath = modelPath;
    this.session = null;
    this.ort = null;
  }

  async init() {
    if (this.session) return this;
    // Lazy: el benchmark puede explicar claramente que falta el runtime sin
    // impedir que corran las pruebas puras de pre/postproceso.
    this.ort = require('onnxruntime-web');
    this.ort.env.wasm.numThreads = 1;
    this.ort.env.wasm.proxy = false;
    const bytes = new Uint8Array(fs.readFileSync(this.modelPath));
    this.session = await this.ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    return this;
  }

  async run(inputNchw) {
    if (!this.session) await this.init();
    if (!(inputNchw instanceof Float32Array) || inputNchw.length !== 3 * 256 * 256) {
      throw new Error('docaligner_bad_input_tensor');
    }
    const input = new this.ort.Tensor('float32', inputNchw, [1, 3, 256, 256]);
    const outputs = await this.session.run({ img: input });
    if (!outputs.heatmap) {
      throw new Error(`docaligner_missing_heatmap:${Object.keys(outputs).join(',')}`);
    }
    return outputs.heatmap;
  }
}

module.exports = { DocAlignerOrtRuntimeNode };
