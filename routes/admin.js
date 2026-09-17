const crypto = require('crypto');
const express = require('express');
const path = require('path');
const supabase = require('../services/supabase');

const router = express.Router();

function igualSeguro(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function requireAdmin(req, res, next) {
  const usuarioEsperado = process.env.OPS_DASHBOARD_USER;
  const claveEsperada = process.env.OPS_DASHBOARD_PASSWORD;
  if (!usuarioEsperado || !claveEsperada) {
    return res.status(503).json({ error: 'tablero_no_configurado' });
  }
  const [tipo, token] = String(req.headers.authorization || '').split(' ');
  let usuario = '';
  let clave = '';
  if (tipo === 'Basic' && token) {
    const credencial = Buffer.from(token, 'base64').toString('utf8');
    const separador = credencial.indexOf(':');
    if (separador >= 0) {
      usuario = credencial.slice(0, separador);
      clave = credencial.slice(separador + 1);
    }
  }
  if (!igualSeguro(usuario, usuarioEsperado) || !igualSeguro(clave, claveEsperada)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Tappt Operaciones", charset="UTF-8"');
    return res.status(401).send('Autenticación requerida');
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

router.use(requireAdmin);

router.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'operaciones.html'));
});

function desdeDias(valor) {
  const dias = Math.min(90, Math.max(1, Number.parseInt(valor, 10) || 30));
  return { dias, desde: new Date(Date.now() - dias * 86400000).toISOString() };
}

function percentil(valores, p) {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.min(ordenados.length - 1, Math.ceil(ordenados.length * p) - 1)];
}

router.get('/api/resumen', async (req, res) => {
  try {
    const { dias, desde } = desdeDias(req.query.dias);
    const ahora = new Date().toISOString();
    const desdeFecha = desde.slice(0, 10);
    const [usuarios, usuariosNuevos, pagados, documentos, eventos, errores, play] = await Promise.all([
      supabase.from('scan_users').select('id', { count: 'exact', head: true }),
      supabase.from('scan_users').select('id', { count: 'exact', head: true }).gte('created_at', desde),
      supabase.from('scan_users').select('id', { count: 'exact', head: true }).neq('plan', 'gratis').gt('plan_vence', ahora),
      supabase.from('scan_documents').select('id,paginas,created_at').gte('created_at', desde),
      supabase.from('scan_ops_events').select('event_type,status,origin,pages,duration_ms,ai_calls,metadata,created_at').gte('created_at', desde).order('created_at'),
      supabase.from('scan_ops_events').select('origin,error_code,error_message,duration_ms,created_at').eq('status', 'error').gte('created_at', desde).order('created_at', { ascending: false }).limit(25),
      supabase.from('scan_play_daily_metrics').select('*').gte('metric_date', desdeFecha).order('metric_date'),
    ]);
    for (const resultado of [usuarios, usuariosNuevos, pagados, documentos, eventos, errores, play]) {
      if (resultado.error) throw resultado.error;
    }

    const docs = documentos.data || [];
    const evs = eventos.data || [];
    const completados = evs.filter((e) => e.event_type === 'document_processed' && e.status === 'ok');
    const fallidos = evs.filter((e) => e.event_type === 'document_processed' && e.status === 'error');
    const duraciones = completados.map((e) => Number(e.duration_ms) || 0).filter(Boolean);
    const origenes = {};
    const apis = {};
    const diario = {};
    for (const evento of evs) {
      origenes[evento.origin] = (origenes[evento.origin] || 0) + (evento.status === 'ok' ? 1 : 0);
      const dia = evento.created_at.slice(0, 10);
      diario[dia] ||= { fecha: dia, exitosos: 0, errores: 0, paginas: 0 };
      if (evento.status === 'ok') diario[dia].exitosos += 1;
      else diario[dia].errores += 1;
      diario[dia].paginas += Number(evento.pages) || 0;
      for (const [nombre, metrica] of Object.entries(evento.metadata?.apis || {})) {
        apis[nombre] ||= { llamadas: 0, errores: 0, duraciones: [] };
        apis[nombre].llamadas += 1;
        if (!metrica.ok) apis[nombre].errores += 1;
        if (metrica.durationMs) apis[nombre].duraciones.push(Number(metrica.durationMs));
      }
    }
    const aiCalls = evs.reduce((s, e) => s + (Number(e.ai_calls) || 0), 0);
    const costoPorLlamada = Number(process.env.OPS_AI_COST_PER_DOCUMENT_USD || 0.004);
    const eventosDe = (tipo) => evs.filter((e) => e.event_type === tipo).length;
    const playRows = play.data || [];
    const sumaPlay = (campo) => playRows.reduce((s, fila) => s + (Number(fila[campo]) || 0), 0);
    const ultimoPlay = playRows.length ? playRows[playRows.length - 1] : null;

    res.json({
      generadoEn: new Date().toISOString(),
      dias,
      usuarios: { total: usuarios.count || 0, nuevos: usuariosNuevos.count || 0, pagadosActivos: pagados.count || 0 },
      negocio: {
        altasPagadas: eventosDe('subscription_started'),
        renovaciones: eventosDe('subscription_renewed'),
        cancelaciones: eventosDe('subscription_cancelled'),
        cobrosFallidos: eventosDe('payment_failed'),
      },
      googlePlay: {
        conectado: playRows.length > 0,
        instalaciones: sumaPlay('installs'),
        desinstalaciones: sumaPlay('uninstalls'),
        dispositivosActivos: ultimoPlay ? Number(ultimoPlay.active_devices) || 0 : 0,
        visitantes: sumaPlay('store_listing_visitors'),
        adquisicionesFicha: sumaPlay('store_listing_acquisitions'),
        crashes: sumaPlay('crashes'),
        anrs: sumaPlay('anrs'),
        ultimaSincronizacion: ultimoPlay?.synced_at || null,
      },
      documentos: {
        totalPeriodo: docs.length,
        paginasPeriodo: docs.reduce((s, d) => s + (Number(d.paginas) || 1), 0),
      },
      procesamiento: {
        exitosos: completados.length,
        errores: fallidos.length,
        tasaExito: completados.length + fallidos.length ? completados.length / (completados.length + fallidos.length) : 1,
        promedioMs: duraciones.length ? Math.round(duraciones.reduce((a, b) => a + b, 0) / duraciones.length) : 0,
        p95Ms: percentil(duraciones, 0.95),
      },
      ia: { llamadas: aiCalls, costoEstimadoUsd: Number((aiCalls * costoPorLlamada).toFixed(2)), costoUnitarioUsd: costoPorLlamada },
      origenes,
      apis: Object.fromEntries(Object.entries(apis).map(([nombre, valor]) => [nombre, {
        llamadas: valor.llamadas,
        errores: valor.errores,
        tasaExito: valor.llamadas ? (valor.llamadas - valor.errores) / valor.llamadas : 1,
        promedioMs: valor.duraciones.length ? Math.round(valor.duraciones.reduce((a, b) => a + b, 0) / valor.duraciones.length) : 0,
        p95Ms: percentil(valor.duraciones, 0.95),
      }])),
      diario: Object.values(diario),
      erroresRecientes: errores.data || [],
    });
  } catch (err) {
    console.error('[admin] no se pudo generar resumen', err);
    res.status(500).json({ error: 'error_resumen_operativo' });
  }
});

module.exports = router;
