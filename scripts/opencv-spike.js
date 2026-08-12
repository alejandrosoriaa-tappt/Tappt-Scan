'use strict';

const fs = require('fs');
const path = require('path');
const { OpenCvDocumentDetector } = require('../scanner/opencv/detector');

(async () => {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) throw new Error('uso: node scripts/opencv-spike.js foto.jpg [resultado.json]');

  const detector = await new OpenCvDocumentDetector().init();
  const result = await detector.detectarBuffer(fs.readFileSync(path.resolve(input)));
  const json = JSON.stringify(result, null, 2);

  console.log(json);
  if (output) fs.writeFileSync(path.resolve(output), `${json}\n`);

  if (!result.valid && process.env.OPENCV_ALLOW_INVALID !== '1') process.exit(3);
  process.exit(0);
})().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message, stack: err.stack }, null, 2));
  process.exit(1);
});
