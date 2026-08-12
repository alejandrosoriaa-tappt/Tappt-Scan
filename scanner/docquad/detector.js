'use strict';

const fs = require('fs');
const { asegurarModelo } = require('./model');
const { prepararEntrada } = require('./preprocess');
const { postprocesarEsquinas } = require('./postprocess');
const { OrtRuntimeNode } = require('./ort-runtime.node');

class DocQuadDetector {
  constructor({ runtime = null, modelPath = null } = {}) {
    this.runtime = runtime;
    this.modelPath = modelPath;
  }

  async init() {
    if (!this.modelPath) this.modelPath = await asegurarModelo();
    if (!this.runtime) this.runtime = new OrtRuntimeNode(this.modelPath);
    await this.runtime.init();
    return this;
  }

  async detectarBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) throw new Error('docquad_input_not_buffer');
    if (!this.runtime) await this.init();

    const inicio = Date.now();
    const preparado = await prepararEntrada(buffer);
    const inferenciaInicio = Date.now();
    const outputs = await this.runtime.run(preparado.input);
    const inferenciaMs = Date.now() - inferenciaInicio;

    const post = postprocesarEsquinas(
      outputs.cornerHeatmaps,
      outputs.maskLogits,
      preparado.letterbox,
      preparado.srcW,
      preparado.srcH
    );

    return {
      ...post,
      source: 'docquad',
      image: { width: preparado.srcW, height: preparado.srcH },
      timing: {
        inferenceMs: inferenciaMs,
        totalMs: Date.now() - inicio,
      },
      outputs: {
        maskShape: outputs.maskLogits.dims,
        cornerShape: outputs.cornerHeatmaps.dims,
      },
    };
  }

  async detectarArchivo(filePath) {
    return this.detectarBuffer(fs.readFileSync(filePath));
  }
}

module.exports = { DocQuadDetector };
