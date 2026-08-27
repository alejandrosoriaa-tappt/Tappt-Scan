const test = require('node:test');
const assert = require('node:assert/strict');

const googleOAuth = require('../services/googleOAuth');

test('reconoce invalid_grant estructurado de Google', () => {
  const error = {
    response: {
      data: {
        error: 'invalid_grant',
        error_description: 'Token has been expired or revoked.',
      },
    },
  };
  assert.equal(googleOAuth.esTokenInvalido(error), true);
});

test('reconoce token revocado desde el mensaje', () => {
  assert.equal(googleOAuth.esTokenInvalido(new Error('Token has been expired or revoked.')), true);
});

test('no confunde errores transitorios con token revocado', () => {
  assert.equal(googleOAuth.esTokenInvalido(new Error('socket timeout')), false);
});
