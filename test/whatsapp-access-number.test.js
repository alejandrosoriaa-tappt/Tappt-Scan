const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NUMERO_ACCESO_TAPPT,
  numeroAccesoTappt,
} = require('../services/whatsappAccess');

test('el acceso de Tappt usa el mismo número público que Tappt Agenda', () => {
  const anterior = process.env.WHATSAPP_ACCESS_NUMBER;
  delete process.env.WHATSAPP_ACCESS_NUMBER;

  try {
    assert.equal(NUMERO_ACCESO_TAPPT, '524429232611');
    assert.equal(numeroAccesoTappt(), '524429232611');
  } finally {
    if (anterior === undefined) delete process.env.WHATSAPP_ACCESS_NUMBER;
    else process.env.WHATSAPP_ACCESS_NUMBER = anterior;
  }
});

test('ignora la variable heredada del número antiguo de TapptScan', () => {
  const anteriorAcceso = process.env.WHATSAPP_ACCESS_NUMBER;
  const anteriorViejo = process.env.WHATSAPP_NUMERO;
  delete process.env.WHATSAPP_ACCESS_NUMBER;
  process.env.WHATSAPP_NUMERO = '524465218420';

  try {
    assert.equal(numeroAccesoTappt(), '524429232611');
  } finally {
    if (anteriorAcceso === undefined) delete process.env.WHATSAPP_ACCESS_NUMBER;
    else process.env.WHATSAPP_ACCESS_NUMBER = anteriorAcceso;
    if (anteriorViejo === undefined) delete process.env.WHATSAPP_NUMERO;
    else process.env.WHATSAPP_NUMERO = anteriorViejo;
  }
});
