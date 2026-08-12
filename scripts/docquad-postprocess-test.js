'use strict';

const assert = require('assert');
const {
  elegirCamino,
  quadPenaltyGeometry,
  canonicalizarQuad,
} = require('../scanner/docquad/postprocess');

function maskTodoTrue() {
  return {
    data: new Float32Array(64 * 64).fill(10),
    dims: [1, 1, 64, 64],
  };
}

function p(x, y) {
  return { x, y };
}

function assertQuad(actual, expected, msg) {
  assert.strictEqual(actual.length, 4, msg);
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(actual[i].x - expected[i].x) < 1e-9, `${msg}: x${i}`);
    assert.ok(Math.abs(actual[i].y - expected[i].y) < 1e-9, `${msg}: y${i}`);
  }
}

(() => {
  const mask = maskTodoTrue();

  // MakeACopy DocQuadPathChoiceTest: si CORNERS es bow-tie y MASK es sano,
  // MASK debe ganar por hard-penalty bidireccional.
  const bowTie = [p(2, 2), p(254, 254), p(254, 2), p(2, 254)];
  const rect = [p(2, 2), p(254, 2), p(254, 254), p(2, 254)];
  const c1 = elegirCamino(bowTie, rect, false, mask);
  assert.strictEqual(c1.source, 'MASK', 'MASK debe ganar ante bow-tie CORNERS');
  assertQuad(c1.quad256, rect, 'quad MASK elegido');
  assert.ok(quadPenaltyGeometry(bowTie) >= 1e5, 'bow-tie debe tener hard penalty');

  // Si MASK es fallback, siempre gana CORNERS.
  const small = [p(10, 10), p(20, 10), p(20, 20), p(10, 20)];
  const c2 = elegirCamino(rect, small, true, mask);
  assert.strictEqual(c2.source, 'CORNERS', 'CORNERS debe ganar si MASK fue fallback');
  assertQuad(c2.quad256, rect, 'quad CORNERS elegido');

  // Desacuerdo >32px: por política de producto, preferir CORNERS.
  const corners = [p(50, 50), p(200, 50), p(200, 200), p(50, 200)];
  const maskLejano = [p(10, 10), p(240, 10), p(240, 240), p(10, 240)];
  const c3 = elegirCamino(corners, maskLejano, false, mask);
  assert.strictEqual(c3.source, 'CORNERS', 'CORNERS debe ganar cuando MASK discrepa >32px');
  assert.ok(c3.agreementMax > 32, 'el desacuerdo debe superar el guardrail');

  // Empate determinista: CORNERS.
  const c4 = elegirCamino(rect, rect, false, mask);
  assert.strictEqual(c4.source, 'CORNERS', 'empate debe resolver a CORNERS');

  // Canonicalización: cualquier rotación termina TL,TR,BR,BL.
  const canon = canonicalizarQuad([p(200, 200), p(50, 200), p(50, 50), p(200, 50)]);
  assertQuad(canon, corners, 'canonicalización TL/TR/BR/BL');

  console.log('docquad postprocess: OK');
})();
