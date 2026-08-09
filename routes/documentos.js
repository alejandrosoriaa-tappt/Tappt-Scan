const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const supabase = require('../services/supabase');
const planes = require('../services/planes');
const procesarDocumento = require('../services/procesarDocumento');
const drive = require('../services/drive');
const pdf = require('../services/pdf');

// Escaneo desde la cámara de la app. Misma tubería que el webhook de
// WhatsApp: la imagen llega en base64 y sale un documento en Drive.
router.post('/escanear', requireAuth, async (req, res) => {
  try {
    if (!req.usuario.drive_tokens) return res.status(409).json({ error: 'drive_sin_conectar' });

    const cupo = await planes.puedeEscanear(req.usuario);
    if (!cupo.permitido) {
      return res.status(402).json({ error: 'limite_alcanzado', ...cupo });
    }

    const { imagen, mimeType } = req.body;
    if (!imagen) return res.status(400).json({ error: 'falta_imagen' });

    const buffer = Buffer.from(imagen.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const { documento } = await procesarDocumento.procesarImagen(
      req.usuario,
      buffer,
      mimeType || 'image/jpeg'
    );

    res.json(documento);
  } catch (err) {
    console.error('[documentos] error escaneando', err);
    res.status(500).json({ error: 'error_escaneo' });
  }
});

// Baja el archivo original desde el Drive del usuario para poder editarlo
// en la app (el backend no guarda ninguna copia).
router.get('/:id/imagen', requireAuth, async (req, res) => {
  try {
    const { data: documento, error } = await supabase
      .from('scan_documents')
      .select('drive_file_id')
      .eq('id', req.params.id)
      .eq('user_id', req.usuario.id)
      .maybeSingle();
    if (error) throw error;
    if (!documento) return res.status(404).json({ error: 'documento_no_encontrado' });

    const buffer = await drive.downloadFile(req.usuario.drive_tokens, documento.drive_file_id);
    res.json({ imagen: buffer.toString('base64') });
  } catch (err) {
    console.error('[documentos] error bajando imagen', err);
    res.status(500).json({ error: 'error_imagen' });
  }
});

// Hornea las anotaciones (texto, firma, imágenes, emojis, tapados) sobre la
// imagen del documento y sube el PDF resultante al Drive del usuario.
router.post('/:id/editar', requireAuth, async (req, res) => {
  try {
    const { data: documento, error } = await supabase
      .from('scan_documents')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.usuario.id)
      .maybeSingle();
    if (error) throw error;
    if (!documento) return res.status(404).json({ error: 'documento_no_encontrado' });

    const { imagenBase, mimeType, anotaciones } = req.body;
    if (!imagenBase) return res.status(400).json({ error: 'falta_imagen_base' });

    const base = Buffer.from(imagenBase.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const pdfPlano = await pdf.desdeImagen(base, mimeType || 'image/jpeg');
    const { pdf: pdfFinal, omitidas } = await pdf.aplicarAnotaciones(pdfPlano, anotaciones || []);

    const carpetas =
      req.usuario.drive_folders || (await drive.ensureFolderStructure(req.usuario.drive_tokens));
    const nombre = (documento.nombre_archivo || 'documento').replace(/\.\w+$/, '') + '_editado.pdf';

    const subido = await drive.uploadFile(req.usuario.drive_tokens, {
      folderId: carpetas.Otros,
      name: nombre,
      mimeType: 'application/pdf',
      buffer: pdfFinal,
    });

    res.json({ nombre, driveLink: subido.webViewLink, omitidas });
  } catch (err) {
    console.error('[documentos] error editando', err);
    res.status(500).json({ error: 'error_edicion' });
  }
});

// Lista de documentos del usuario, opcionalmente filtrada por tipo.
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = supabase
      .from('scan_documents')
      .select('*')
      .eq('user_id', req.usuario.id)
      .order('created_at', { ascending: false });

    if (req.query.tipo) query = query.eq('tipo', req.query.tipo);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('[documentos] error', err);
    res.status(500).json({ error: 'error_documentos' });
  }
});

// Resumen de gastos del mes (gancho de upsell y pestaña del plan Negocio).
router.get('/gastos', requireAuth, async (req, res) => {
  try {
    const ahora = new Date();
    const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();

    const { data, error } = await supabase
      .from('scan_documents')
      .select('monto, emisor, fecha')
      .eq('user_id', req.usuario.id)
      .eq('tipo', 'recibo')
      .gte('created_at', desde);
    if (error) throw error;

    const total = data.reduce((suma, d) => suma + (Number(d.monto) || 0), 0);
    res.json({ total, cantidad: data.length, recibos: data });
  } catch (err) {
    console.error('[documentos] error gastos', err);
    res.status(500).json({ error: 'error_gastos' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('scan_documents')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.usuario.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[documentos] error borrando', err);
    res.status(500).json({ error: 'error_borrar' });
  }
});

module.exports = router;
