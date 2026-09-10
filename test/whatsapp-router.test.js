const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

test('el transporte interno no expone el token y usa únicamente Agenda', async () => {
  const oldPost = axios.post;
  const calls = [];
  axios.post = async (url, payload, options) => {
    calls.push({ url, payload, options });
    return { data: { ok: true } };
  };
  process.env.TAPPT_ROUTER_SECRET = 'test-secret';
  process.env.WHATSAPP_TOKEN = 'must-not-leave';

  try {
    const whatsapp = require('../services/whatsapp');
    await whatsapp.withTransport({ proxy: true }, () =>
      whatsapp.sendText('521234567890', 'hola')
    );
  } finally {
    axios.post = oldPost;
  }

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://tappt-backend-production.up.railway.app/internal/scan/whatsapp/messages'
  );
  assert.equal(calls[0].options.headers['x-tappt-router-secret'], 'test-secret');
  assert.doesNotMatch(JSON.stringify(calls[0]), /must-not-leave/);
});
