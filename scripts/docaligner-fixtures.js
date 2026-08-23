#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FIXTURES } = require('../scanner/fixtures/manifest');
const { iou } = require('../scanner/fixtures/iou');
const { DocAlignerDetector } = require('../scanner/docaligner/detector');

const modelPath = process.env.DOCALIGNER_MODEL_PATH;
if (!modelPath || !fs.existsSync(modelPath)) {
  console.error('Define DOCALIGNER_MODEL_PATH con el archivo lcnet100 ONNX.');
  process.exit(2);
}

const digest = crypto.createHash('sha256').update(fs.readFileSync(modelPath)).digest('hex');
const fotos = path.join(__dirname, '..', 'scanner', 'fixtures', 'fotos');

async function main() {
  const detector = await new DocAlignerDetector({ modelPath }).init();
  const filas = [];

  // Sólo fixtures locales: evita que el benchmark dependa de red y garantiza
  // que estamos midiendo las tomas reales compartidas desde iPhone.
  for (const fixture of FIXTURES.filter((f) => f.local && f.archivo)) {
    const archivo = path.join(fotos, fixture.archivo);
    if (!fs.existsSync(archivo)) continue;
    const resultado = await detector.detectarArchivo(archivo);
    const vacio = fixture.tipo === 'vacio';
    const valorIoU = !vacio && resultado.corners && fixture.groundTruth
      ? iou(resultado.corners.map((p) => ({ x: p.x / resultado.image.width, y: p.y / resultado.image.height })), fixture.groundTruth)
      : null;
    filas.push({
      id: fixture.id,
      tipo: fixture.tipo,
      detecta: Boolean(resultado.corners),
      iou: valorIoU,
      inferenceMs: resultado.timing.inferenceMs,
      totalMs: resultado.timing.totalMs,
    });
  }

  console.log(`\nDocAligner lcnet100 sha256=${digest}\n`);
  for (const f of filas) {
    console.log(
      `${f.id.padEnd(24)} tipo=${f.tipo.padEnd(9)} detecta=${String(f.detecta).padEnd(5)} ` +
      `IoU=${f.iou == null ? '—' : f.iou.toFixed(3)} inferencia=${f.inferenceMs}ms total=${f.totalMs}ms`
    );
  }
  const tiempos = filas.map((f) => f.inferenceMs).sort((a, b) => a - b);
  const p50 = tiempos[Math.floor(tiempos.length * 0.5)] ?? null;
  const vaciosConDeteccion = filas.filter((f) => f.tipo === 'vacio' && f.detecta).length;
  console.log(`\np50 inferencia=${p50 ?? '—'}ms; vacíos con quad=${vaciosConDeteccion}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
