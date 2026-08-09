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

// Callback de Google. Guarda los tokens y crea la estructura de carpetas.
router.get('/callback', async (req, res) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) return res.status(400).send('Faltan parámetros.');

    const tokens = await drive.exchangeCode(code);
    const carpetas = await drive.ensureFolderStructure(tokens);

    const { error } = await supabase
      .from('scan_users')
      .update({ drive_tokens: tokens, drive_folders: carpetas })
      .eq('id', userId);
    if (error) throw error;

    res.send(
      '<html><body style="font-family:sans-serif;text-align:center;padding:48px">' +
        '<h2>Listo</h2><p>Tu Google Drive quedó conectado. Ya puedes volver a TapptScan.</p>' +
        '</body></html>'
    );
  } catch (err) {
    console.error('[drive] error en callback', err);
    res.status(500).send('No pudimos conectar tu Drive. Inténtalo de nuevo.');
  }
});

// Estructura de carpetas para el explorador de la app.
router.get('/carpetas', requireAuth, async (req, res) => {
  if (!req.usuario.drive_tokens) return res.status(409).json({ error: 'drive_sin_conectar' });

  try {
    const carpetas = req.usuario.drive_folders || (await drive.ensureFolderStructure(req.usuario.drive_tokens));

    const { data, error } = await supabase
      .from('scan_documents')
      .select('tipo')
      .eq('user_id', req.usuario.id);
    if (error) throw error;

    const porCarpeta = { Identificaciones: 'identificacion', Recibos: 'recibo', Contratos: 'contrato', Otros: 'otro' };
    const resultado = drive.SUBFOLDERS.map((nombre) => ({
      id: carpetas[nombre],
      nombre,
      cantidad: data.filter((d) => d.tipo === porCarpeta[nombre]).length,
    }));

    res.json(resultado);
  } catch (err) {
    console.error('[drive] error listando carpetas', err);
    res.status(500).json({ error: 'error_carpetas' });
  }
});

module.exports = router;
