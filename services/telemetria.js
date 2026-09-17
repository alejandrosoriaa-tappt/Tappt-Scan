const crypto = require('crypto');
const supabase = require('./supabase');

function mensajeSeguro(err) {
  const texto = String(err?.message || err || 'error_desconocido');
  return texto.replace(/[\r\n]+/g, ' ').slice(0, 240);
}

function codigoError(err) {
  return String(err?.code || err?.response?.data?.error?.code || 'processing_error').slice(0, 80);
}

function usuarioAnonimo(usuario) {
  if (!usuario?.id) return null;
  const sal = process.env.OPS_HASH_SALT || process.env.TAPPT_ROUTER_SECRET || 'tappt-ops';
  return crypto.createHash('sha256').update(`${sal}:${usuario.id}`).digest('hex').slice(0, 20);
}

async function registrar(evento) {
  try {
    const { error } = await supabase.from('scan_ops_events').insert({
      event_type: evento.eventType,
      status: evento.status || 'ok',
      origin: evento.origin || 'unknown',
      user_hash: usuarioAnonimo(evento.usuario),
      document_id: evento.documentId || null,
      pages: Math.max(0, Number(evento.pages) || 0),
      duration_ms: Math.max(0, Math.round(Number(evento.durationMs) || 0)),
      ai_calls: Math.max(0, Number(evento.aiCalls) || 0),
      error_code: evento.error ? codigoError(evento.error) : null,
      error_message: evento.error ? mensajeSeguro(evento.error) : null,
      app_version: evento.appVersion || null,
      metadata: evento.metadata || {},
    });
    if (error) console.warn('[telemetria] no se pudo registrar evento', error.message);
  } catch (err) {
    // La observabilidad jamás debe romper el flujo del usuario.
    console.warn('[telemetria] registro no disponible', err.message);
  }
}

function registrarEnSegundoPlano(evento) {
  registrar(evento).catch(() => {});
}

module.exports = { registrar, registrarEnSegundoPlano, mensajeSeguro, codigoError };
