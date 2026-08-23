'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { crearFiltroOneEuro, filtrarOneEuro } = require('../app/src/lib/oneEuroQuad');

const quad = (dx = 0) => [
  { x: 0.1 + dx, y: 0.1 },
  { x: 0.9 + dx, y: 0.1 },
  { x: 0.9 + dx, y: 0.9 },
  { x: 0.1 + dx, y: 0.9 },
];

function desviacion(valores) {
  const media = valores.reduce((s, x) => s + x, 0) / valores.length;
  return Math.sqrt(valores.reduce((s, x) => s + (x - media) ** 2, 0) / valores.length);
}

test('One Euro reduce jitter de esquina en una secuencia quieta', () => {
  const ruido = [0.012, -0.01, 0.009, -0.008, 0.011, -0.009, 0.007, -0.006];
  let estado = crearFiltroOneEuro(0, quad(ruido[0]));
  const filtrados = [estado.puntos[0].x];
  for (let i = 1; i < ruido.length; i++) {
    const salida = filtrarOneEuro(estado, i / 30, quad(ruido[i]));
    estado = salida.estado;
    filtrados.push(salida.esquinas[0].x);
  }
  const crudos = ruido.map((n) => 0.1 + n);
  assert.ok(desviacion(filtrados) < desviacion(crudos) * 0.6);
});

test('aumenta respuesta cuando el documento se mueve', () => {
  let estadoLento = crearFiltroOneEuro(0, quad(), { minCutoff: 0.5, beta: 0 });
  let estadoAdaptativo = crearFiltroOneEuro(0, quad(), { minCutoff: 0.5, beta: 0.1 });
  // Un frame previo alimenta la estimación de velocidad.
  estadoLento = filtrarOneEuro(estadoLento, 1 / 30, quad()).estado;
  estadoAdaptativo = filtrarOneEuro(estadoAdaptativo, 1 / 30, quad()).estado;
  const lento = filtrarOneEuro(estadoLento, 2 / 30, quad(0.25)).esquinas[0].x;
  const adaptativo = filtrarOneEuro(estadoAdaptativo, 2 / 30, quad(0.25)).esquinas[0].x;
  assert.ok(adaptativo > lento);
  assert.ok(adaptativo < 0.35);
});

test('ignora timestamps repetidos o invertidos', () => {
  const estado = crearFiltroOneEuro(10, quad());
  const salida = filtrarOneEuro(estado, 9, quad(0.3));
  assert.equal(salida.estado, estado);
  assert.deepEqual(salida.esquinas, quad());
});
