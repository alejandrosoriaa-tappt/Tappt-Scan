require('dotenv').config();
const path = require('path');
const express = require('express');
const webhookRouter = require('./routes/webhook');
const authRouter = require('./routes/auth');
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

// Los dos webhooks firmados necesitan el cuerpo CRUDO para poder verificar
// la firma, así que van ANTES del parser JSON global.
app.use('/api/pagos/webhook', express.raw({ type: 'application/json' }));
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'tappt-scan' }));

// Requeridas para publicar la app de Meta y la pantalla de consentimiento
// de Google — cada vertical tiene la suya, no se reutiliza la de Tappt
// (agenda): las prácticas de datos son distintas (Drive, WhatsApp como
// login, Anthropic procesando documentos).
app.use(express.static(path.join(__dirname, 'public')));

app.use('/webhook', webhookRouter);
app.use('/api/auth', authRouter);
app.use('/api/cuenta', cuentaRouter);
app.use('/api/documentos', documentosRouter);
app.use('/api/drive', driveRouter);
app.use('/api/pagos', pagosRouter);

// Espejo web de la app nativa (React Native Web), para probar el
// onboarding completo desde el navegador sin instalar nada. Va al final:
// el build referencia rutas absolutas (/_expo/...), así que vive en la
// raíz del dominio — las rutas de API de arriba ya se quedan con lo suyo
// porque Express prueba las rutas en orden de registro. Ver
// docs/DISTRIBUCION.md · Nivel 0.
const appDist = path.join(__dirname, 'app', 'dist');
app.use(express.static(appDist));
app.get('*', (_req, res) => res.sendFile(path.join(appDist, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`tappt-scan escuchando en :${port}`));
