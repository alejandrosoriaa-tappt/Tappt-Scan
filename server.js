require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
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

app.get('/health', (_req, res) => {
  const estado = scanner.estadoDetector();
  res.json({
    ok: true,
    service: 'tappt-scan',
    docquad: estado,
    scanner: estado,
  });
});

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

// Debug sin recompilar Expo: el bundle web de producción vive ya compilado en
// app/dist. Cuando se abre /?scannerDebug=1 inyectamos un botón independiente
// del bundle para compartir el último frame real recibido por el backend.
app.get('/', (req, res, next) => {
  if (req.query.scannerDebug !== '1') return next();

  const clave = crypto.randomBytes(18).toString('hex');
  res.setHeader(
    'Set-Cookie',
    `tapptscan_scanner_debug=${clave}; Path=/; SameSite=Lax; Max-Age=3600`
  );

  const indexPath = path.join(appDist, 'index.html');
  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err) return next(err);

    const script = `
<script>
(function () {
  function b64blob(base64, type) {
    var bin = atob(base64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type });
  }

  async function compartir() {
    var r = await fetch('/api/documentos/debug-fixture', { cache: 'no-store' });
    if (!r.ok) {
      alert('Todavía no hay fixture. Espera a que el detector procese uno o dos frames.');
      return;
    }
    var f = await r.json();
    var sello = (f.fecha || new Date().toISOString()).replace(/[:.]/g, '-');
    var jpg = new File([b64blob(f.imagen, 'image/jpeg')], 'tapptscan-fixture-' + sello + '.jpg', { type: 'image/jpeg' });
    var json = new File([new Blob([JSON.stringify({ fecha: f.fecha, resultado: f.resultado }, null, 2)], { type: 'application/json' })], 'tapptscan-fixture-' + sello + '.json', { type: 'application/json' });

    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [jpg, json] }))) {
      await navigator.share({ title: 'TapptScan scanner fixture', files: [jpg, json] });
      return;
    }

    [jpg, json].forEach(function (file) {
      var url = URL.createObjectURL(file);
      var a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    });
  }

  function montar() {
    if (document.getElementById('tapptscan-debug-fixture-button')) return;
    var b = document.createElement('button');
    b.id = 'tapptscan-debug-fixture-button';
    b.textContent = 'Compartir fixture';
    b.style.cssText = 'position:fixed;left:16px;bottom:150px;z-index:2147483647;border:1px solid #7CF5C0;border-radius:999px;padding:11px 15px;background:rgba(0,0,0,.88);color:#7CF5C0;font:600 13px -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.35)';
    b.onclick = function () { compartir().catch(function (e) { alert('No se pudo compartir: ' + (e.message || e)); }); };
    document.body.appendChild(b);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
</script>`;

    res.type('html').send(html.replace('</body>', script + '\n</body>'));
  });
});

app.use(express.static(appDist));
app.get('*', (_req, res) => res.sendFile(path.join(appDist, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`tappt-scan escuchando en :${port}`);

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
