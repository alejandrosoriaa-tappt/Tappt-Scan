const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mensajes = fs.readFileSync(path.join(__dirname, '..', 'services', 'i18n.js'), 'utf8');
const webhook = fs.readFileSync(path.join(__dirname, '..', 'routes', 'webhook.js'), 'utf8');

test('WhatsApp hace una sola pregunta y no promete firma oculta', () => {
  assert.doesNotMatch(mensajes, /¿Todo bien\?|editarlo o firmarlo|edit or sign it|All good\?/);
  assert.match(mensajes, /¿Qué deseas hacer\?/);
});

test('el mensaje guardado no duplica el acceso a la app con un reply button', () => {
  const bloque = webhook.slice(
    webhook.indexOf("t(idioma, 'guardado'"),
    webhook.indexOf('const handleImage')
  );
  assert.doesNotMatch(bloque, /title: t\(idioma, 'botonApp'\)/);
  assert.match(bloque, /title: t\(idioma, 'botonGuardar'\)/);
  assert.match(bloque, /title: t\(idioma, 'botonOtra'\)/);
});
