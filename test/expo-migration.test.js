const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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

test('la configuración Android de v10 aísla el runtime y no duplica permisos', () => {
  const appConfig = JSON.parse(read('app/app.json')).expo;
  const permissions = appConfig.android.permissions;

  assert.equal(appConfig.version, '0.1.2');
  assert.equal(appConfig.android.versionCode, 10);
  assert.deepEqual(appConfig.android.runtimeVersion, { policy: 'appVersion' });
  assert.deepEqual(permissions, [...new Set(permissions)]);
  assert.equal(appConfig.android.package, 'lat.tappt.scan');
});

test('Android v10 conserva ML Kit FULL y retorna mediante Activity Result', () => {
  const module = read('app/modules/tappt-document-scanner/android/src/main/java/lat/tappt/documentscanner/TapptDocumentScannerModule.kt');
  const screen = read('app/src/screens/EscanearScreen.native.js');

  assert.match(module, /SCANNER_MODE_FULL/);
  assert.match(module, /RegisterActivityContracts/);
  assert.match(module, /StartIntentSenderForResult/);
  assert.doesNotMatch(module, /\.startIntentSenderForResult\(/);
  assert.match(module, /AsyncFunction\("cancel"\)/);
  assert.match(module, /recoveredActivityResult/);
  assert.match(module, /activityResult\.scanId != activeScanId/);
  assert.match(screen, /navigation\.replace\('BorradorEscaneo'\)/);
  assert.doesNotMatch(screen, /navigation\.replace\('Borrador'\)/);
});

test('EAS conserva el código nativo local del escáner', () => {
  const gitignore = read('app/.gitignore');

  assert.match(gitignore, /^\/android\/$/m);
  assert.match(gitignore, /^\/ios\/$/m);
  assert.doesNotMatch(gitignore, /^android\/$/m);
  assert.doesNotMatch(gitignore, /^ios\/$/m);

  const ignored = (file) => {
    try {
      execFileSync('git', ['check-ignore', '-q', file], { cwd: root });
      return true;
    } catch {
      return false;
    }
  };

  assert.equal(
    ignored('app/modules/tappt-document-scanner/android/src/main/java/lat/tappt/documentscanner/TapptDocumentScannerModule.kt'),
    false
  );
  assert.equal(
    ignored('app/modules/tappt-document-scanner/ios/TapptDocumentScannerModule.swift'),
    false
  );
});
