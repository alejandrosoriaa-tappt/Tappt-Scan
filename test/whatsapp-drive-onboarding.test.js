const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('espera la cuenta antes de decidir si debe conectar Google Drive', () => {
  const context = read('app/src/context/SesionContext.js');
  const navigator = read('app/src/navigation/RootNavigator.js');

  assert.match(context, /cuentaConsultada/);
  assert.match(context, /Boolean\(token && !cuentaConsultada\)/);
  assert.match(context, /setCuentaConsultada\(false\)[\s\S]*setToken\(nuevo\)/);
  assert.match(navigator, /if \(cargando \|\| bienvenidaVista === null\)/);
  assert.match(navigator, /cuenta && !cuenta\.driveConectado/);
});

test('una sesión restaurada que falla autenticación regresa al acceso', () => {
  const context = read('app/src/context/SesionContext.js');
  const settings = read('app/src/screens/AjustesScreen.js');
  const config = JSON.parse(read('app/app.json'));

  assert.match(context, /usuario_no_encontrado', 'error_auth'/);
  assert.match(settings, /sesionNoDisponible/);
  assert.match(settings, /onPress=\{cerrarSesion\}/);
  assert.equal(config.expo.android.allowBackup, false);
});
