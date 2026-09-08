const DOCUMENTO_ID = /^[a-zA-Z0-9_-]{1,128}$/;

function idDocumentoValido(id) {
  return DOCUMENTO_ID.test(String(id || ''));
}

function enlaceDocumentoWeb(dominio, id) {
  if (!dominio || !idDocumentoValido(id)) return null;
  const base = dominio.startsWith('http') ? dominio : `https://${dominio}`;
  return `${base.replace(/\/$/, '')}/abrir-documento/${encodeURIComponent(id)}`;
}

function enlaceDocumentoNativo(id) {
  if (!idDocumentoValido(id)) return null;
  return `tapptscan://documento/${encodeURIComponent(id)}`;
}

function idBotonDocumento(id) {
  return idDocumentoValido(id) ? `app:${id}` : null;
}

function idDocumentoDesdeBoton(idBoton) {
  if (!String(idBoton || '').startsWith('app:')) return null;
  const id = String(idBoton).slice(4);
  return idDocumentoValido(id) ? id : null;
}

function paginaAbrirDocumento(id) {
  const nativo = enlaceDocumentoNativo(id);
  if (!nativo) return null;
  const seguro = JSON.stringify(nativo);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Abrir en TapptScan</title>
<style>body{margin:0;background:#0f1720;color:#fff;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}.c{max-width:360px;padding:32px;text-align:center}a{display:block;margin:24px 0;padding:15px;border-radius:12px;background:#18b875;color:#07130e;font-weight:700;text-decoration:none}.s{color:#b6c0cc;font-size:14px}</style></head>
<body><main class="c"><h1>Abriendo TapptScan…</h1><p>Te llevamos al documento que acabas de guardar.</p><a href="${nativo}">Abrir TapptScan</a><p class="s">Si no abre automáticamente, toca el botón.</p></main>
<script>(function(){var salio=false;document.addEventListener('visibilitychange',function(){if(document.hidden)salio=true});window.location.href=${seguro};setTimeout(function(){if(!salio)window.location.replace('/app')},1800)})();</script></body></html>`;
}

module.exports = {
  idDocumentoValido,
  enlaceDocumentoWeb,
  enlaceDocumentoNativo,
  idBotonDocumento,
  idDocumentoDesdeBoton,
  paginaAbrirDocumento,
};
