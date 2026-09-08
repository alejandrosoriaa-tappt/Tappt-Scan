const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const editor = fs.readFileSync(
  path.join(__dirname, '../app/src/screens/EditorScreen.js'),
  'utf8'
);

test('la firma se manipula desde su marco y no desde los botones inferiores', () => {
  assert.match(editor, /function FirmaManipulable/);
  assert.match(editor, /seleccionada, children \}/);
  assert.match(editor, /accessibilityLabel="Eliminar firma"/);
  assert.match(editor, /accessibilityLabel="Rotar firma"/);
  assert.match(editor, /accessibilityLabel="Cambiar tamaño de firma"/);
  assert.match(editor, /anotaciones\[seleccionada\]\.tipo !== 'firma'/);
});

test('mover, escalar y rotar conservan el contrato normalizado del PDF', () => {
  assert.match(editor, /gesto\.dx \/ actual\.ancho/);
  assert.match(editor, /gesto\.dy \/ actual\.alto/);
  assert.match(editor, /Math\.hypot\(/);
  assert.match(editor, /inicio\.ancho \* distancia \/ inicio\.distancia/);
  assert.match(editor, /const rotacion = centro\.rotacion \+ grados/);
  assert.match(editor, /function contenerFirma/);
  assert.match(editor, /cajaAncho/);
  assert.match(editor, /cajaAlto/);
});

test('el editor advierte antes de abandonar cambios sin guardar', () => {
  assert.match(editor, /addListener\('beforeRemove'/);
  assert.match(editor, /evento\.preventDefault\(\)/);
  assert.match(editor, /descartarCambios/);
  assert.match(editor, /seguirEditando/);
  assert.match(editor, /if \(guardando\)/);
  assert.match(editor, /if \(!montadoRef\.current\) return/);
});
