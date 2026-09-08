const test = require('node:test');
const assert = require('node:assert/strict');
const {
  idDocumentoValido,
  enlaceDocumentoWeb,
  enlaceDocumentoNativo,
  idBotonDocumento,
  idDocumentoDesdeBoton,
  paginaAbrirDocumento,
} = require('../services/deepLinks');

test('construye enlaces del documento sin perder su id', () => {
  const id = '20b4f7a1-1234-4abc-9876-abcdef123456';
  assert.equal(enlaceDocumentoWeb('scan.tappt.lat', id), `https://scan.tappt.lat/abrir-documento/${id}`);
  assert.equal(enlaceDocumentoNativo(id), `tapptscan://documento/${id}`);
  assert.equal(idBotonDocumento(id), `app:${id}`);
  assert.equal(idDocumentoDesdeBoton(`app:${id}`), id);
  assert.match(paginaAbrirDocumento(id), /tapptscan:\/\/documento\/20b4f7a1/);
});

test('rechaza ids que podrían inyectar HTML o rutas', () => {
  assert.equal(idDocumentoValido('<script>'), false);
  assert.equal(idDocumentoValido('../otro'), false);
  assert.equal(enlaceDocumentoWeb('scan.tappt.lat', '../otro'), null);
  assert.equal(paginaAbrirDocumento('" onclick="x'), null);
  assert.equal(idDocumentoDesdeBoton('app:../otro'), null);
});
