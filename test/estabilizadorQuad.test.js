const test = require('node:test');
const assert = require('node:assert/strict');

const {
  actualizarEstabilizador,
  estadoInicial,
  iouQuad,
} = require('../app/src/lib/estabilizadorQuad');

const quad = (dx = 0, dy = 0, escala = 1) => [
  { x: 0.15 * escala + dx, y: 0.2 * escala + dy },
  { x: 0.85 * escala + dx, y: 0.2 * escala + dy },
  { x: 0.85 * escala + dx, y: 0.8 * escala + dy },
  { x: 0.15 * escala + dx, y: 0.8 * escala + dy },
];

test('calcula IoU de quads iguales y separados', () => {
  assert.ok(Math.abs(iouQuad(quad(), quad()) - 1) < 1e-9);
  assert.equal(iouQuad(quad(), quad(1, 0)), 0);
});

test('no dibuja el primer candidato y bloquea tras dos compatibles', () => {
  const primero = actualizarEstabilizador(estadoInicial(), { esquinas: quad(), confiable: false });
  assert.equal(primero.fase, 'adquiriendo');
  assert.equal(primero.esquinas, null);

  const segundo = actualizarEstabilizador(primero, {
    esquinas: quad(0.01, 0.005),
    confiable: true,
  });
  assert.equal(segundo.fase, 'bloqueado');
  assert.equal(segundo.estado, 'listo');
  assert.equal(segundo.coincidencias, 2);
  assert.ok(segundo.esquinas);
});

test('mantiene el último quad durante dos saltos incompatibles', () => {
  let estado = actualizarEstabilizador(estadoInicial(), { esquinas: quad(), confiable: true });
  estado = actualizarEstabilizador(estado, { esquinas: quad(0.01), confiable: true });
  const bloqueado = estado.esquinas;

  estado = actualizarEstabilizador(estado, { esquinas: quad(0.55), confiable: false });
  assert.equal(estado.fase, 'bloqueado');
  assert.deepEqual(estado.esquinas, bloqueado);
  assert.equal(estado.fallos, 1);

  estado = actualizarEstabilizador(estado, { esquinas: null, confiable: false });
  assert.equal(estado.fase, 'bloqueado');
  assert.equal(estado.fallos, 2);
});

test('pierde el bloqueo al tercer fallo y no dibuja el candidato nuevo', () => {
  let estado = actualizarEstabilizador(estadoInicial(), { esquinas: quad(), confiable: true });
  estado = actualizarEstabilizador(estado, { esquinas: quad(0.01), confiable: true });
  estado = actualizarEstabilizador(estado, { esquinas: null, confiable: false });
  estado = actualizarEstabilizador(estado, { esquinas: null, confiable: false });
  estado = actualizarEstabilizador(estado, { esquinas: quad(0.55), confiable: false });

  assert.equal(estado.fase, 'adquiriendo');
  assert.equal(estado.esquinas, null);
  assert.equal(estado.coincidencias, 1);
});

test('suaviza un quad compatible en vez de saltar directamente', () => {
  let estado = actualizarEstabilizador(estadoInicial(), { esquinas: quad(), confiable: true });
  estado = actualizarEstabilizador(estado, { esquinas: quad(0.01), confiable: true });
  const antes = estado.esquinas[0].x;
  const objetivo = quad(0.08)[0].x;
  estado = actualizarEstabilizador(estado, { esquinas: quad(0.08), confiable: true });

  assert.ok(estado.esquinas[0].x > antes);
  assert.ok(estado.esquinas[0].x < objetivo);
});
