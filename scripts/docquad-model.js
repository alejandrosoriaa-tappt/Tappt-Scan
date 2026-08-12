'use strict';

const { asegurarModelo, MODEL_PATH, EXPECTED_SIZE, EXPECTED_GIT_BLOB_SHA1 } = require('../scanner/docquad/model');

(async () => {
  try {
    const ruta = await asegurarModelo();
    console.log(JSON.stringify({
      ok: true,
      model: ruta || MODEL_PATH,
      bytes: EXPECTED_SIZE,
      gitBlobSha1: EXPECTED_GIT_BLOB_SHA1,
    }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    process.exitCode = 1;
  }
})();
