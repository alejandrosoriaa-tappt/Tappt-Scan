const test = require('node:test');
const assert = require('node:assert/strict');

const { dimensionesDestino } = require('../services/geometriaPerspectiva');

test('conserva las dimensiones geometricas cuando no se elige formato', () => {
  const dimensiones = dimensionesDestino([
    { x: 0, y: 0 },
    { x: 900, y: 0 },
    { x: 850, y: 1100 },
    { x: 0, y: 1000 },
  ]);

  assert.deepEqual(dimensiones, { ancho: 900, alto: 1101 });
});

test('normaliza una hoja vertical a proporcion Carta sin perder su area aproximada', () => {
  const dimensiones = dimensionesDestino([
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ], 'carta');

  assert.ok(Math.abs(dimensiones.ancho / dimensiones.alto - 8.5 / 11) < 0.001);
  assert.ok(Math.abs(dimensiones.ancho * dimensiones.alto - 1_000_000) < 2_000);
});

test('normaliza tambien una hoja Carta horizontal', () => {
  const dimensiones = dimensionesDestino([
    { x: 0, y: 0 },
    { x: 1400, y: 0 },
    { x: 1400, y: 900 },
    { x: 0, y: 900 },
  ], 'carta');

  assert.ok(Math.abs(dimensiones.ancho / dimensiones.alto - 11 / 8.5) < 0.001);
});

test('auto corrige una hoja probable pero conserva tarjetas y objetos cuadrados', () => {
  const hoja = dimensionesDestino([
    { x: 0, y: 0 }, { x: 850, y: 0 }, { x: 850, y: 1000 }, { x: 0, y: 1000 },
  ], 'auto');
  const tarjeta = dimensionesDestino([
    { x: 0, y: 0 }, { x: 630, y: 0 }, { x: 630, y: 1000 }, { x: 0, y: 1000 },
  ], 'auto');
  const cuadrado = dimensionesDestino([
    { x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 },
  ], 'auto');

  assert.ok(Math.abs(hoja.ancho / hoja.alto - 8.5 / 11) < 0.001);
  assert.equal(tarjeta.ancho / tarjeta.alto, 0.63);
  assert.equal(cuadrado.ancho / cuadrado.alto, 1);
});
