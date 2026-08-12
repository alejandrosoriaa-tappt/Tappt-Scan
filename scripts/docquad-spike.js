'use strict';

const fs = require('fs');
const path = require('path');
const { DocQuadDetector } = require('../scanner/docquad/detector');

function usage() {
  console.log('Uso: npm run docquad:spike -- /ruta/a/foto.jpg [salida.json]');
}

(async () => {
  const imagePath = process.argv[2];
  const outputPath = process.argv[3] || null;

  if (!imagePath) {
    usage();
    process.exitCode = 2;
    return;
  }

  const absolute = path.resolve(imagePath);
  if (!fs.existsSync(absolute)) {
    console.error(`No existe la imagen: ${absolute}`);
    process.exitCode = 2;
    return;
  }

  try {
    const detector = await new DocQuadDetector().init();
    const result = await detector.detectarArchivo(absolute);
    const report = {
      image: absolute,
      ...result,
    };

    const json = JSON.stringify(report, null, 2);
    console.log(json);
    if (outputPath) {
      fs.writeFileSync(path.resolve(outputPath), `${json}\n`);
    }

    if (!result.valid) process.exitCode = 3;
  } catch (err) {
    console.error(JSON.stringify({
      ok: false,
      error: err.message,
      stack: process.env.DOCQUAD_DEBUG ? err.stack : undefined,
    }, null, 2));
    process.exitCode = 1;
  }
})();
