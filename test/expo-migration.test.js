const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('los flujos nativos usan la API vigente de Expo FileSystem', () => {
  const scanner = read('app/src/lib/escanerNativo.js');
  const importer = read('app/src/lib/importar.js');
  const nativeSources = `${scanner}\n${importer}`;

  assert.doesNotMatch(nativeSources, /readAsStringAsync|expo-file-system\/legacy/);
  assert.match(scanner, /new File\(uri\)\.base64\(\)/);
  assert.match(importer, /new File\(uri\)\.base64\(\)/);
});

test('la cámara usa la API contextual vigente de ImageManipulator', () => {
  const camera = read('app/src/components/CamaraDoc.native.js');

  assert.doesNotMatch(camera, /manipulateAsync/);
  assert.match(camera, /ImageManipulator\.manipulate\(foto\.uri\)/);
  assert.match(camera, /renderAsync\(\)/);
  assert.match(camera, /saveAsync\(/);
});

test('la configuración Android de v8 no duplica permisos', () => {
  const appConfig = JSON.parse(read('app/app.json')).expo;
  const permissions = appConfig.android.permissions;

  assert.equal(appConfig.android.versionCode, 8);
  assert.deepEqual(permissions, [...new Set(permissions)]);
  assert.equal(appConfig.android.package, 'lat.tappt.scan');
});
