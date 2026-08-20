const test = require('node:test');
const assert = require('node:assert/strict');

const { perteneceAlNumero } = require('../services/whatsappEvento');

test('acepta eventos dirigidos al número de TapptScan', () => {
  const value = { metadata: { phone_number_id: 'scan-123' } };
  assert.equal(perteneceAlNumero(value, 'scan-123'), true);
});

test('rechaza eventos dirigidos a otro número', () => {
  const value = { metadata: { phone_number_id: 'agenda-456' } };
  assert.equal(perteneceAlNumero(value, 'scan-123'), false);
});

test('rechaza eventos sin identidad de número', () => {
  assert.equal(perteneceAlNumero({}, 'scan-123'), false);
  assert.equal(perteneceAlNumero({ metadata: {} }, 'scan-123'), false);
  assert.equal(perteneceAlNumero({ metadata: { phone_number_id: 'scan-123' } }, ''), false);
});
