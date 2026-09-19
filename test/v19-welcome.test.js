const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('V19 presenta el valor real de Tappt una sola vez antes del acceso', () => {
  const screen = read('app/src/screens/BienvenidaScreen.js');
  const navigator = read('app/src/navigation/RootNavigator.js');
  const texts = read('app/src/i18n/textos.js');

  assert.match(screen, /WhatsApp/);
  assert.match(screen, /Google Drive/);
  assert.match(screen, /bienvenidaFlujoIa/);
  assert.match(screen, /privacidad\.html/);
  assert.match(screen, /terminos\.html/);
  assert.match(navigator, /tappt\.bienvenida\.v1/);
  assert.match(navigator, /AsyncStorage\.setItem/);
  assert.match(texts, /MÁS QUE UN ESCÁNER/);
  assert.doesNotMatch(screen + texts, /130M|N[º°]\s*1|4\.8 puntos/);
});
