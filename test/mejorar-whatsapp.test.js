const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (archivo) => fs.readFileSync(path.join(root, archivo), 'utf8');

test('las fotos guardadas desde WhatsApp pueden abrir el recorte existente', () => {
  const documento = read('app/src/screens/DocumentoScreen.js');
  const recorte = read('app/src/screens/RecorteScreen.js');
  const api = read('app/src/lib/api.js');

  assert.match(documento, /recortarMejorar/);
  assert.match(documento, /documento\.mime_type !== 'application\/pdf'/);
  assert.match(documento, /navigation\.navigate\('Recorte'/);
  assert.match(documento, /documentoExistente: documento/);
  assert.match(recorte, /api\.mejorar\(/);
  assert.match(recorte, /guardarVersionMejorada/);
  assert.match(api, /\/api\/documentos\/\$\{id\}\/mejorar/);
});

test('la mejora conserva el original y registra un PDF nuevo como versión', () => {
  const rutas = read('routes/documentos.js');

  assert.match(rutas, /router\.post\('\/:id\/mejorar'/);
  assert.match(rutas, /imagenServicio\.corregirPerspectiva/);
  assert.match(rutas, /imagenServicio\.aplicarFiltro/);
  assert.match(rutas, /pdf\.desdeImagen\(mejorada, 'image\/jpeg'\)/);
  assert.match(rutas, /'_mejorado\.pdf'/);
  assert.match(rutas, /from\('scan_versiones'\)\.insert/);
});

test('firma permanece implementada pero no aparece como herramienta', () => {
  const editor = read('app/src/screens/EditorScreen.js');
  const herramientas = editor.match(/const HERRAMIENTAS = \[([\s\S]*?)\];/)[1];

  assert.doesNotMatch(herramientas, /id: 'firma'/);
  assert.match(editor, /function FirmaManipulable/);
  assert.match(editor, /<FirmaPad/);
});
