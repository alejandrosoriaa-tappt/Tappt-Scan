const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const supabase = require('../services/supabase');
const planes = require('../services/planes');
const procesarDocumento = require('../services/procesarDocumento');
const drive = require('../services/drive');
const pdf = require('../services/pdf');
const imagenServicio = require('../services/imagen');

// La app manda la foto recién tomada y le devolvemos las esquinas sugeridas
// del documento, para pre-colocar el marco de recorte.
router.post('/detectar-bordes', requireAuth, async (req, res) => {
  try {
    const { imagen } = req.body;
    if (!imagen) return res.status(400).json({ error: 'falta_imagen' });

    const buffer = Buffer.from(imagen.replace(/^data:[^;]+;base64,/, ''), 'base64');
    res.json(await imagenServicio.detectarDocumento(buffer));
  } catch (err) {
    console.error('[documentos] error detectando bordes', err);
    // Que falle la detección no debe frenar al usuario: marco completo.
    res.json({
      esquinas: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      confiable: false,
    });
  }
});

// Entrada desde la app: cámara (`/escanear`) o importación de un archivo
// del dispositivo (`/importar`). Ambas comparten validaciones y tubería.
async function recibirDesdeApp(req, res, mimePorDefecto) {
  if (!req.usuario.drive_tokens) return res.status(409).json({ error: 'drive_sin_conectar' });

  const cupo = await planes.puedeEscanear(req.usuario);
  if (!cupo.permitido) return res.status(402).json({ error: 'limite_alcanzado', ...cupo });

  const { archivo, imagen, mimeType, nombre, esquinas } = req.body;
  const contenido = archivo || imagen;
  if (!contenido) return res.status(400).json({ error: 'falta_archivo' });

  let buffer = Buffer.from(contenido.replace(/^data:[^;]+;base64,/, ''), 'base64');
  let mime = mimeType || mimePorDefecto;

  // Recorte y enderezado: solo aplica a fotos, y solo si la app mandó las
  // cuatro esquinas (confirmadas o ajustadas por el usuario).
  if (esquinas?.length === 4 && !pdf.esPdf(buffer)) {
    buffer = await imagenServicio.corregirPerspectiva(buffer, esquinas);
    mime = 'image/png';
  }

  const { documento } = await procesarDocumento.procesarArchivo(
    req.usuario,
    buffer,
    mime,
    nombre || null
  );

  res.json(documento);
}

router.post('/escanear', requireAuth, async (req, res) => {
  try {
    await recibirDesdeApp(req, res, 'image/jpeg');
  } catch (err) {
    console.error('[documentos] error escaneando', err);
    res.status(500).json({ error: 'error_escaneo' });
  }
});

// Importar un archivo ya existente del teléfono o la computadora
// (galería, Archivos, iCloud, Drive…). Acepta PDF e imágenes.
router.post('/importar', requireAuth, async (req, res) => {
  try {
    await recibirDesdeApp(req, res, 'application/pdf');
  } catch (err) {
    console.error('[documentos] error importando', err);
    res.status(500).json({ error: 'error_importacion' });
  }
});

async function traerDocumento(req) {
  const { data, error } = await supabase
    .from('scan_documents')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', req.usuario.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Devuelve una página lista para mostrar y anotar en la app. Si el original
// es PDF se rasteriza esa página; si es imagen, se manda tal cual. El
// backend no guarda copia: baja de Drive, convierte y responde.
router.get('/:id/pagina/:n', requireAuth, async (req, res) => {
  try {
    const documento = await traerDocumento(req);
    if (!documento) return res.status(404).json({ error: 'documento_no_encontrado' });

    const original = await drive.downloadFile(req.usuario.drive_tokens, documento.drive_file_id);
    const indice = Math.max(0, parseInt(req.params.n, 10) || 0);

    if (pdf.esPdf(original)) {
      const png = await pdf.renderizarPagina(original, indice);
      return res.json({
        imagen: png.toString('base64'),
        mimeType: 'image/png',
        paginas: documento.paginas || 1,
        pagina: indice,
      });
    }

    res.json({
      imagen: original.toString('base64'),
      mimeType: documento.mime_type || 'image/jpeg',
      paginas: 1,
      pagina: 0,
    });
  } catch (err) {
    console.error('[documentos] error sirviendo página', err);
    res.status(500).json({ error: 'error_pagina' });
  }
});

// Hornea las anotaciones (texto, firma, imágenes, emojis, tapados) sobre la
// imagen del documento y sube el PDF resultante al Drive del usuario.
router.post('/:id/editar', requireAuth, async (req, res) => {
  try {
    const documento = await traerDocumento(req);
    if (!documento) return res.status(404).json({ error: 'documento_no_encontrado' });

    const { anotaciones } = req.body;

    // Se parte SIEMPRE del original en Drive. Si ya era PDF se anota
    // encima (conserva calidad y su capa de texto); si era imagen, se
    // envuelve en un PDF de una página.
    const original = await drive.downloadFile(req.usuario.drive_tokens, documento.drive_file_id);
    const base = pdf.esPdf(original)
      ? original
      : await pdf.desdeImagen(original, documento.mime_type || 'image/jpeg');

    const { pdf: pdfFinal, omitidas } = await pdf.aplicarAnotaciones(base, anotaciones || []);

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
