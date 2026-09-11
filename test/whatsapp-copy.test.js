const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const mensajes = fs.readFileSync(path.join(__dirname, '..', 'services', 'i18n.js'), 'utf8');
const webhook = fs.readFileSync(path.join(__dirname, '..', 'routes', 'webhook.js'), 'utf8');
const whatsapp = fs.readFileSync(path.join(__dirname, '..', 'services', 'whatsapp.js'), 'utf8');

test('WhatsApp hace una sola pregunta y no promete firma oculta', () => {
  assert.doesNotMatch(mensajes, /¿Todo bien\?/);
  assert.doesNotMatch(mensajes, /editarlo o firmarlo/i);
  assert.doesNotMatch(mensajes, /edit or sign it/i);
  assert.doesNotMatch(mensajes, /All good\?/);
  assert.equal((mensajes.match(/¿Qué deseas hacer\?/g) || []).length, 1);
});

test('el mensaje guardado usa CTA de URL y conserva sólo dos reply buttons', () => {
  const bloque = webhook.slice(
    webhook.indexOf("const resumen = t(idioma, 'guardado'"),
    webhook.indexOf('const handleImage')
  );

  assert.match(bloque, /sendUrlButton/);
  assert.match(bloque, /'botonDrive'/);
  assert.match(bloque, /'botonAbrirApp'/);
  assert.match(bloque, /title: t\(idioma, 'botonGuardar'\)/);
  assert.match(bloque, /title: t\(idioma, 'botonOtra'\)/);
  assert.doesNotMatch(bloque, /title: t\(idioma, 'botonApp'\)/);
  assert.match(whatsapp, /type: 'cta_url'/);
  assert.match(whatsapp, /display_text: buttonText, url/);
});
