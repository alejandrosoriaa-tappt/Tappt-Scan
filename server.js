require('dotenv').config();
const express = require('express');
const webhookRouter = require('./routes/webhook');

// Guardrail de identidad: aborta si el número configurado no es el de
// TapptScan. Evita procesar mensajes con las credenciales equivocadas
// (cruce accidental con tappt-backend o tappt-broker).
const { WHATSAPP_PHONE_NUMBER_ID, EXPECTED_WHATSAPP_PHONE_NUMBER_ID } = process.env;
if (
  EXPECTED_WHATSAPP_PHONE_NUMBER_ID &&
  WHATSAPP_PHONE_NUMBER_ID !== EXPECTED_WHATSAPP_PHONE_NUMBER_ID
) {
  console.error(
    '[guardrail] WHATSAPP_PHONE_NUMBER_ID no coincide con EXPECTED_WHATSAPP_PHONE_NUMBER_ID. Abortando arranque.'
  );
  process.exit(1);
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true, service: 'tappt-scan' }));

app.use('/webhook', webhookRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`tappt-scan escuchando en :${port}`));
