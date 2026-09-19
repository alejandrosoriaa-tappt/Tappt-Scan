const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Android incluye la liga de Drive dentro del mensaje compartido', () => {
  const documentScreen = read('app/src/screens/DocumentoScreen.js');
  const mosaic = read('app/src/components/VistaMosaico.js');

  assert.match(documentScreen, /Platform\.OS === 'android'[\s\S]*documento\.drive_link/);
  assert.match(mosaic, /Platform\.OS === 'android'[\s\S]*driveLink/);
  assert.match(documentScreen, /Share\.share\(\{ message, url: documento\.drive_link \}\)/);
  assert.match(mosaic, /Share\.share\(\{ message, url: driveLink \}\)/);
});
