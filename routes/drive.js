const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const drive = require('../services/drive');
const supabase = require('../services/supabase');

// La app abre esta URL en el navegador; el state lleva el id del usuario
// para saber a quién pertenecen los tokens al volver.
router.get('/conectar', requireAuth, (req, res) => {
  res.json({ url: drive.authUrl(req.usuario.id) });
});

// Callback de Google. Guarda los tokens y crea la carpeta madre.
router.get('/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) return res.status(400).send('Faltan parámetros.');

    const tokens = await drive.exchangeCode(code);
    // Se crea el árbol completo aquí para que el usuario abra su Drive y
    // ya vea sus carpetas, en vez de una carpeta vacía.
    const raizId = await drive.ensureEstructura(tokens);

    const { error } = await supabase
      .from('scan_users')
      .update({ drive_tokens: tokens, drive_raiz_id: raizId })
      .eq('id', userId);
    if (error) throw error;

    res.send(
      '<html><body style="font-family:sans-serif;text-align:center;padding:48px">' +
        '<h2>Listo</h2><p>Tu Google Drive quedó conectado y tus carpetas ya están creadas.<br>Ya puedes volver a TapptScan.</p>' +
        '</body></html>'
    );
  } catch (err) {
    console.error('[drive] error en callback', err);
    res.status(500).send('No pudimos conectar tu Drive. Inténtalo de nuevo.');
  }
});

/**
 * Explorador: contenido de una carpeta. Sin `carpeta` devuelve la raíz
 * `TapptScan/`. Las carpetas ya no son fijas — las va creando el
 * clasificador conforme llegan documentos, así que se leen del Drive real.
 */
router.get('/carpetas', requireAuth, async (req, res) => {
  if (!req.usuario.drive_tokens) return res.status(409).json({ error: 'drive_sin_conectar' });

  try {
    const carpetaId =
      req.query.carpeta || req.usuario.drive_raiz_id || (await drive.ensureRaiz(req.usuario.drive_tokens));

    const contenido = await drive.listarCarpeta(req.usuario.drive_tokens, carpetaId);

    // Los archivos se cruzan con la base para poder abrirlos en el editor;
    // lo que no reconocemos se muestra igual, solo sin acciones.
    const ids = contenido.filter((c) => !c.esCarpeta).map((c) => c.id);
    let porDriveId = {};

    if (ids.length) {
      const { data } = await supabase
        .from('scan_documents')
        .select('*')
        .eq('user_id', req.usuario.id)
        .in('drive_file_id', ids);

      porDriveId = Object.fromEntries((data || []).map((d) => [d.drive_file_id, d]));
    }

    res.json({
      carpetaId,
      esRaiz: !req.query.carpeta,
      contenido: contenido.map((item) => ({
        ...item,
        documento: item.esCarpeta ? null : porDriveId[item.id] || null,
      })),
    });
  } catch (err) {
    console.error('[drive] error listando carpeta', err);
    res.status(500).json({ error: 'error_carpetas' });
  }
});

// Espacio usado en el Drive del usuario.
router.get('/uso', requireAuth, async (req, res) => {
  if (!req.usuario.drive_tokens) return res.status(409).json({ error: 'drive_sin_conectar' });

  try {
    res.json(await drive.usoDeAlmacenamiento(req.usuario.drive_tokens));
  } catch (err) {
    console.error('[drive] error consultando uso', err);
    res.status(500).json({ error: 'error_uso' });
  }
});

module.exports = router;
