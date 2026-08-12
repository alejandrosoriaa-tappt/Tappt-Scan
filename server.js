require('dotenv').config();
const path = require('path');
const express = require('express');
const webhookRouter = require('./routes/webhook');
const authRouter = require('./routes/auth');
const cuentaRouter = require('./routes/cuenta');
const docquadRouter = require('./routes/docquad');
const documentosRouter = require('./routes/documentos');
const driveRouter = require('./routes/drive');
const pagosRouter = require('./routes/pagos');
const firmasRouter = require('./routes/firmas');
const scanner = require('./services/docquad');

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

process.on('unhandledRejection', (razon) => {
  console.error('[proceso] promesa rechazada sin capturar', razon);
});
process.on('uncaughtException', (err) => {
  console.error('[proceso] excepción no capturada', err);
});

const app = express();

app.use('/api/pagos/webhook', express.raw({ type: 'application/json' }));
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'tappt-scan', scanner: scanner.estadoDetector() })
);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/webhook', webhookRouter);
app.use('/api/auth', authRouter);
app.use('/api/cuenta', cuentaRouter);
app.use('/api/documentos', docquadRouter);
app.use('/api/documentos', documentosRouter);
app.use('/api/drive', driveRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/firmas', firmasRouter);

const appDist = path.join(__dirname, 'app', 'dist');
app.use(express.static(appDist));
app.get('*', (_req, res) => res.sendFile(path.join(appDist, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`tappt-scan escuchando en :${port}`);

  // Warm-up fuera del camino crítico HTTP. El servidor ya puede responder
  // /health y servir la app mientras ONNX/OpenCV se preparan. Los frames de
  // cámara reciben DETECTORS_WARMING en vez de esperar hasta que Railway
  // corte la conexión con 502.
  scanner.prepararMotores().then((resultados) => {
    const [docquad, opencv] = resultados;
    if (docquad.status === 'rejected') {
      console.error('[docquad] warm-up inicial falló; se reintentará', docquad.reason?.message);
    }
    if (opencv.status === 'rejected') {
      console.error('[opencv] warm-up inicial falló; se reintentará', opencv.reason?.message);
    }
  });
});
