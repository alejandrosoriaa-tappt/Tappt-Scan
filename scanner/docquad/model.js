'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// Fijado a un commit conocido de MakeACopy para que el modelo no cambie
// silenciosamente si `main` avanza. El blob Git esperado permite verificar
// byte por byte la descarga sin depender de un checksum publicado aparte.
const MAKEACOPY_COMMIT = 'f4aaf8fc3a9a96422446600a139f117240d3843b';
const MODEL_NAME = 'docquadnet256_trained_opset17.ort';
const MODEL_URL =
  `https://raw.githubusercontent.com/egdels/makeacopy/${MAKEACOPY_COMMIT}` +
  `/app/src/main/assets/docquad/${MODEL_NAME}`;
const EXPECTED_SIZE = 13_404_952;
const EXPECTED_GIT_BLOB_SHA1 = '62cfe95cbd3d74241e30314987ee67b845a7032a';

const MODEL_DIR = path.join(process.cwd(), '.cache', 'docquad');
const MODEL_PATH = path.join(MODEL_DIR, MODEL_NAME);

function gitBlobSha1(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function validarModelo(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error('docquad_model_not_buffer');
  if (buffer.length !== EXPECTED_SIZE) {
    throw new Error(`docquad_model_size:${buffer.length}:${EXPECTED_SIZE}`);
  }

  // ORT format es FlatBuffer y contiene el identificador ORTM en bytes 4..7.
  if (buffer.subarray(4, 8).toString('ascii') !== 'ORTM') {
    throw new Error('docquad_model_not_ort_format');
  }

  const sha = gitBlobSha1(buffer);
  if (sha !== EXPECTED_GIT_BLOB_SHA1) {
    throw new Error(`docquad_model_sha:${sha}:${EXPECTED_GIT_BLOB_SHA1}`);
  }
}

function descargar(url, redirecciones = 0) {
  if (redirecciones > 5) return Promise.reject(new Error('docquad_model_too_many_redirects'));

  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'TapptScan-DocQuad/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(descargar(new URL(res.headers.location, url).toString(), redirecciones + 1));
        return;
      }

      if (res.statusCode !== 200) {
        const status = res.statusCode;
        res.resume();
        reject(new Error(`docquad_model_http_${status}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.setTimeout(60_000, () => req.destroy(new Error('docquad_model_timeout')));
    req.on('error', reject);
  });
}

async function asegurarModelo() {
  if (fs.existsSync(MODEL_PATH)) {
    const existente = fs.readFileSync(MODEL_PATH);
    try {
      validarModelo(existente);
      return MODEL_PATH;
    } catch {
      fs.rmSync(MODEL_PATH, { force: true });
    }
  }

  fs.mkdirSync(MODEL_DIR, { recursive: true });
  const buffer = await descargar(MODEL_URL);
  validarModelo(buffer);

  const temporal = `${MODEL_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(temporal, buffer);
  fs.renameSync(temporal, MODEL_PATH);
  return MODEL_PATH;
}

module.exports = {
  asegurarModelo,
  validarModelo,
  MODEL_PATH,
  MODEL_URL,
  MODEL_NAME,
  MAKEACOPY_COMMIT,
  EXPECTED_SIZE,
  EXPECTED_GIT_BLOB_SHA1,
};
