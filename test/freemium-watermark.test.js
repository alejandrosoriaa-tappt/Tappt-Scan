const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('el plan gratis ofrece 15 documentos cada 30 días y sólo el gratis lleva marca', () => {
  const planes = read('services/planes.js');
  const proceso = read('services/procesarDocumento.js');
  const pdf = read('services/pdf.js');

  assert.match(planes, /gratis: 15/);
  assert.match(planes, /pro: Infinity/);
  assert.match(planes, /montos: \{ mxn: 490/);
  assert.doesNotMatch(planes, /montos: \{ mxn: (299|499)/);
  assert.match(planes, /escaneosGratisUsados/);
  assert.match(planes, /30 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(planes, /\.gte\('created_at', desde\)/);
  assert.match(proceso, /planVigente\(usuario\) === 'gratis'/);
  assert.match(proceso, /pdf\.agregarMarcaTappt/);
  assert.match(pdf, /Escaneado y organizado con Tappt \| WhatsApp a Google Drive/);

  const compras = read('app/src/lib/compras.native.js');
  assert.match(compras, /lat\.tappt\.scan\.pro\.anual/);
  assert.doesNotMatch(compras, /lat\.tappt\.scan\.(personal|negocio)\.anual/);
});
