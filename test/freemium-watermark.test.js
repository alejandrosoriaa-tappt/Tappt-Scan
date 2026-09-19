const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('la prueba ofrece 15 documentos en total y sólo el plan gratis lleva marca', () => {
  const planes = read('services/planes.js');
  const proceso = read('services/procesarDocumento.js');
  const pdf = read('services/pdf.js');

  assert.match(planes, /gratis: 15/);
  assert.match(planes, /escaneosGratisUsados/);
  assert.doesNotMatch(planes, /\.gte\('created_at'/);
  assert.match(proceso, /planVigente\(usuario\) === 'gratis'/);
  assert.match(proceso, /pdf\.agregarMarcaTappt/);
  assert.match(pdf, /Escaneado y organizado con Tappt \| WhatsApp a Google Drive/);
});
