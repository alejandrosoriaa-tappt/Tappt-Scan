require('dotenv').config();
const express = require('express');
const webhookRouter = require('./routes/webhook');
const cuentaRouter = require('./routes/cuenta');
const documentosRouter = require('./routes/documentos');
const driveRouter = require('./routes/drive');
const pagosRouter = require('./routes/pagos');

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

// El webhook de Stripe necesita el cuerpo CRUDO para verificar la firma,
// así que va ANTES del parser JSON global.
app.use('/api/pagos/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'tappt-scan' }));

app.use('/webhook', webhookRouter);
app.use('/api/cuenta', cuentaRouter);
app.use('/api/documentos', documentosRouter);
app.use('/api/drive', driveRouter);
app.use('/api/pagos', pagosRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`tappt-scan escuchando en :${port}`));
