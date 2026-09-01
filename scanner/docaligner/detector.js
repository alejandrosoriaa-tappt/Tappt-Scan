'use strict';

const fs = require('fs');
const { prepararEntrada } = require('./preprocess');
const { postprocesarHeatmaps } = require('./postprocess');

/** Adaptador experimental. No está conectado al detector de producción. */
class DocAlignerDetector {
  constructor({ runtime = null, modelPath = null } = {}) {
    this.runtime = runtime;
    this.modelPath = modelPath;
  }

  async init() {
    if (!this.runtime) {
      if (!this.modelPath) throw new Error('docaligner_model_path_required');
      const { DocAlignerOrtRuntimeNode } = require('./ort-runtime.node');
      this.runtime = new DocAlignerOrtRuntimeNode(this.modelPath);
    }
    if (this.runtime.init) await this.runtime.init();
    return this;
  }

  async detectarBuffer(buffer) {
    if (!Buffer.isBuffer(buffer)) throw new Error('docaligner_input_not_buffer');
    if (!this.runtime) await this.init();
    const inicio = Date.now();
    const preparado = await prepararEntrada(buffer);
    const inferenciaInicio = Date.now();
    const heatmap = await this.runtime.run(preparado.input);
    const inferenceMs = Date.now() - inferenciaInicio;
    const resultado = postprocesarHeatmaps(heatmap, preparado.srcW, preparado.srcH);
    return {
      ...resultado,
      source: 'docaligner-experimental',
      image: { width: preparado.srcW, height: preparado.srcH },
      timing: { inferenceMs, totalMs: Date.now() - inicio },
    };
  }

  detectarArchivo(filePath) {
    return this.detectarBuffer(fs.readFileSync(filePath));
  }
}

module.exports = { DocAlignerDetector };
