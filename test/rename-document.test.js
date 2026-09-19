const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('el usuario puede reemplazar el nombre sugerido sin perder la extensión', () => {
  const screen = read('app/src/screens/DocumentoScreen.js');
  const api = read('app/src/lib/api.js');
  const routes = read('routes/documentos.js');
  const drive = read('services/drive.js');

  assert.match(screen, /id: 'renombrar'/);
  assert.match(screen, /api\.renombrarDocumento/);
  assert.match(screen, /<TextInput/);
  assert.match(api, /renombrarDocumento: \(id, nombre\)/);
  assert.match(api, /\$\{id\}\/nombre/);
  assert.match(routes, /router\.put\('\/:id\/nombre'/);
  assert.match(routes, /nombre_archivo: nombreArchivo/);
  assert.match(drive, /async function renombrarArchivo/);
  assert.match(drive, /resource: \{ name: nuevoNombre \}/);
});
