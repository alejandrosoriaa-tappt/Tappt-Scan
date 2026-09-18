const fs = require('node:fs');
const path = require('node:path');
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

describe('V18 scan confirmation preview', () => {
  test('keeps the page preview large and the thumbnail strip secondary', () => {
    const screen = read('app/src/screens/BorradorEscaneoScreen.js');

    assert.match(screen, /borrador\.paginas\.length > 1/);
    assert.match(screen, /style=\{estilos\.tiraScroll\}/);
    assert.match(screen, /tiraScroll:\s*\{\s*flexGrow:\s*0,\s*height:\s*82\s*\}/);
    assert.match(screen, /documentoCaja:\s*\{[\s\S]*?flex:\s*1,[\s\S]*?minHeight:\s*0/);
  });
});
