const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const supabase = require('../services/supabase');
const planes = require('../services/planes');
const procesarDocumento = require('../services/procesarDocumento');
const drive = require('../services/drive');
const pdf = require('../services/pdf');
const imagenServicio = require('../services/imagen');
const gastos = require('../services/gastos');

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

// Miniatura de un filtro aplicado — para la fila de chips "Original / Gris
// / B&N / Mejorar" en RecorteScreen, mismo espíritu que la fila de presets
// de CamScanner. Trabaja en chico (400px) porque es solo vista previa; el
// filtro real se aplica a resolución completa al guardar (`/escanear`).
router.post('/vista-filtro', requireAuth, async (req, res) => {
  try {
    const { imagen, filtro } = req.body;
    if (!imagen || !filtro) return res.status(400).json({ error: 'falta_imagen_o_filtro' });

    const buffer = Buffer.from(imagen.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const salida = await imagenServicio.aplicarFiltro(buffer, filtro, 400);
    res.json({ imagen: `data:image/jpeg;base64,${salida.toString('base64')}` });
  } catch (err) {
    console.error('[documentos] error generando vista previa de filtro', err);
    res.status(500).json({ error: 'error_vista_filtro' });
  }
});

// Vista previa REAL del resultado: aplica la misma perspectiva, proporcion
// de papel y filtro que /escanear, pero no consume cupo ni sube nada a
// Drive. El usuario debe poder ver la hoja derecha antes de guardarla.
router.post('/vista-recorte', requireAuth, async (req, res) => {
  try {
    const { imagen, esquinas, filtro, formato } = req.body;
    if (!imagen || esquinas?.length !== 4) {
      return res.status(400).json({ error: 'falta_imagen_o_esquinas' });
    }

    let salida = Buffer.from(imagen.replace(/^data:[^;]+;base64,/, ''), 'base64');
    salida = await imagenServicio.corregirPerspectiva(salida, esquinas, formato);
    if (filtro && filtro !== 'color') {
      salida = await imagenServicio.aplicarFiltro(salida, filtro, 1400);
    }

    res.json({ imagen: `data:image/jpeg;base64,${salida.toString('base64')}` });
  } catch (err) {
    console.error('[documentos] error generando vista de recorte', err);
    const estado = err.message === 'recorte_demasiado_chico' ? 422 : 500;
    res.status(estado).json({ error: err.message || 'error_vista_recorte' });
  }
});

// De una foto de una firma en papel (cualquier fondo) devuelve solo el
// trazo, recortado a su contorno, transparente y teñido del color elegido
// — para poder pegarla sobre cualquier documento igual que si se hubiera
// dibujado a mano con FirmaPad.
router.post('/firma-desde-foto', requireAuth, async (req, res) => {
  try {
    const { imagen, color } = req.body;
    if (!imagen) return res.status(400).json({ error: 'falta_imagen' });

    const buffer = Buffer.from(imagen.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const png = await imagenServicio.extraerFirma(buffer, color);
    res.json({ firma: `data:image/png;base64,${png.toString('base64')}` });
  } catch (err) {
    if (err.message === 'firma_no_detectada') {
      return res.status(422).json({ error: 'firma_no_detectada' });
    }
    console.error('[documentos] error extrayendo firma', err);
    res.status(500).json({ error: 'error_firma' });
  }
});

// Entrada desde la app: cámara (`/escanear`) o importación de un archivo
// del dispositivo (`/importar`). Ambas comparten validaciones y tubería.
async function recibirDesdeApp(req, res, mimePorDefecto) {
  if (!req.usuario.drive_tokens) return res.status(409).json({ error: 'drive_sin_conectar' });

  const cupo = await planes.puedeEscanear(req.usuario);
  if (!cupo.permitido) return res.status(402).json({ error: 'limite_alcanzado', ...cupo });

  const { archivo, imagen, mimeType, nombre, esquinas, filtro, formato } = req.body;
  const contenido = archivo || imagen;
  if (!contenido) return res.status(400).json({ error: 'falta_archivo' });

  let buffer = Buffer.from(contenido.replace(/^data:[^;]+;base64,/, ''), 'base64');
  let mime = mimeType || mimePorDefecto;

  // Recorte y enderezado: solo aplica a fotos, y solo si la app mandó las
  // cuatro esquinas (confirmadas o ajustadas por el usuario).
  if (esquinas?.length === 4 && !pdf.esPdf(buffer)) {
    buffer = await imagenServicio.corregirPerspectiva(buffer, esquinas, formato);
    mime = 'image/jpeg';
  }

  // Filtro de imagen (Color/Gris/B&N/Mejorar): siempre después del
  // recorte, nunca antes — enderezar necesita los colores originales para
  // que Otsu separe bien documento/fondo.
  if (filtro && filtro !== 'color' && !pdf.esPdf(buffer)) {
    buffer = await imagenServicio.aplicarFiltro(buffer, filtro);
    mime = 'image/jpeg';
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

// Captura en lote estilo scanner: el cliente conserva las páginas como un
// borrador editable y las manda en su orden definitivo. Se corrige cada
// toma por separado y solo entonces se genera/sube un único PDF.
router.post('/escanear-lote', requireAuth, async (req, res) => {
  try {
    if (!req.usuario.drive_tokens) return res.status(409).json({ error: 'drive_sin_conectar' });
    const cupo = await planes.puedeEscanear(req.usuario);
    if (!cupo.permitido) return res.status(402).json({ error: 'limite_alcanzado', ...cupo });

    const paginas = req.body?.paginas;
    if (!Array.isArray(paginas) || !paginas.length) {
      return res.status(400).json({ error: 'faltan_paginas' });
    }
    if (paginas.length > 30) return res.status(413).json({ error: 'demasiadas_paginas' });

    const corregidas = [];
    for (const pagina of paginas) {
      if (!pagina.imagen || pagina.esquinas?.length !== 4) {
        return res.status(400).json({ error: 'pagina_invalida' });
      }
      let buffer = Buffer.from(pagina.imagen.replace(/^data:[^;]+;base64,/, ''), 'base64');
      // RecorteScreen ya produjo la vista final aprobada. No repetir una
      // homografía y un filtro costosos si el cliente envía esa versión.
      if (!pagina.procesada) {
        buffer = await imagenServicio.corregirPerspectiva(buffer, pagina.esquinas, pagina.formato);
        if (pagina.filtro && pagina.filtro !== 'color') {
          buffer = await imagenServicio.aplicarFiltro(buffer, pagina.filtro);
        }
      }
      corregidas.push(buffer);
    }

    const archivo = await pdf.desdeImagenes(corregidas);
    const { documento } = await procesarDocumento.procesarArchivo(
      req.usuario,
      archivo,
      'application/pdf',
      null
    );
    res.json(documento);
  } catch (err) {
    console.error('[documentos] error escaneando lote', err);
    const cliente = ['recorte_demasiado_chico'].includes(err.message);
    res.status(cliente ? 422 : 500).json({ error: cliente ? err.message : 'error_escaneo_lote' });
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

// Portada liviana para listas y pantalla de resultado. El original sigue
// viviendo únicamente en Drive: se descarga bajo demanda y se devuelve una
// miniatura pequeña, nunca el archivo completo ni una copia persistente.
router.get('/:id/miniatura', requireAuth, async (req, res) => {
  try {
    const documento = await traerDocumento(req);
    if (!documento) return res.status(404).json({ error: 'documento_no_encontrado' });

    const original = await drive.downloadFile(req.usuario.drive_tokens, documento.drive_file_id);
    let miniatura;
    let mimeType;

    if (pdf.esPdf(original)) {
      miniatura = await pdf.renderizarPagina(original, 0, 0.35);
      mimeType = 'image/png';
    } else {
      miniatura = await imagenServicio.aplicarFiltro(original, 'color', 240);
      mimeType = 'image/jpeg';
    }

    res.json({
      imagen: miniatura.toString('base64'),
      mimeType,
      paginas: documento.paginas || 1,
    });
  } catch (err) {
    console.error(`[documentos] error generando miniatura doc=${req.params.id}`, err);
    res.status(500).json({ error: 'error_miniatura' });
  }
});

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
    console.error(
      `[documentos] error sirviendo página doc=${req.params.id} n=${req.params.n}`,
      err
    );
    res.status(500).json({ error: 'error_pagina' });
  }
});

// Marcar o desmarcar como favorito.
router.put('/:id/favorito', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scan_documents')
      .update({ favorito: Boolean(req.body.favorito) })
      .eq('id', req.params.id)
      .eq('user_id', req.usuario.id)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'documento_no_encontrado' });

    res.json({ favorito: data.favorito });
  } catch (err) {
    console.error('[documentos] error marcando favorito', err);
    res.status(500).json({ error: 'error_favorito' });
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

    // El editado se guarda junto al original, no en una carpeta aparte.
    const carpetaId =
      documento.carpeta_id || (await drive.ensureRuta(req.usuario.drive_tokens, []));
    const nombre = (documento.nombre_archivo || 'documento').replace(/\.\w+$/, '') + '_firmado.pdf';

    const subido = await drive.uploadFile(req.usuario.drive_tokens, {
      folderId: carpetaId,
      name: nombre,
      mimeType: 'application/pdf',
      buffer: pdfFinal,
    });

    // El original en `scan_documents` no se toca — esto solo agrega un
    // renglón al historial. El editor siempre parte del original (arriba),
    // así que reeditar no se acumula sobre una versión previa.
    const { error: errorVersion } = await supabase.from('scan_versiones').insert({
      documento_id: documento.id,
      user_id: req.usuario.id,
      nombre_archivo: nombre,
      drive_file_id: subido.id,
      drive_link: subido.webViewLink,
    });
    if (errorVersion) console.error('[documentos] no se pudo registrar la versión', errorVersion);

    res.json({ nombre, driveLink: subido.webViewLink, omitidas });
  } catch (err) {
    console.error('[documentos] error editando', err);
    res.status(500).json({ error: 'error_edicion' });
  }
});

// Historial de versiones (ediciones/firmas) de un documento, más reciente
// primero. El original queda fuera de esta lista — vive en el documento.
router.get('/:id/versiones', requireAuth, async (req, res) => {
  try {
    const documento = await traerDocumento(req);
    if (!documento) return res.status(404).json({ error: 'documento_no_encontrado' });

    const { data, error } = await supabase
      .from('scan_versiones')
      .select('id, nombre_archivo, drive_link, created_at')
      .eq('documento_id', documento.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error('[documentos] error listando versiones', err);
    res.status(500).json({ error: 'error_versiones' });
  }
});

// Vista mosaico: arma un PDF nuevo sin las páginas indicadas (0-based) y lo
// registra como versión — nunca toca el original. Pensado para el caso de
// "esta ficha técnica trae al final el contacto de la inmobiliaria, no
// quiero que mi cliente lo vea": desarma el PDF en vez de solo poder armar
// uno.
router.post('/:id/paginas/eliminar', requireAuth, async (req, res) => {
  try {
    const documento = await traerDocumento(req);
    if (!documento) return res.status(404).json({ error: 'documento_no_encontrado' });

    const aEliminar = new Set(req.body.paginas || []);
    if (!aEliminar.size) return res.status(400).json({ error: 'sin_paginas' });

    const original = await drive.downloadFile(req.usuario.drive_tokens, documento.drive_file_id);
    if (!pdf.esPdf(original)) return res.status(400).json({ error: 'no_es_pdf' });

    const { paginas: totalPaginas } = await pdf.info(original);
    const indicesRestantes = Array.from({ length: totalPaginas }, (_, i) => i).filter(
      (i) => !aEliminar.has(i)
    );
    if (!indicesRestantes.length) return res.status(400).json({ error: 'quedaria_vacio' });

    const pdfFinal = await pdf.copiarPaginas(original, indicesRestantes);

    const carpetaId =
      documento.carpeta_id || (await drive.ensureRuta(req.usuario.drive_tokens, []));
    const nombre =
      (documento.nombre_archivo || 'documento').replace(/\.\w+$/, '') + '_editado.pdf';

    const subido = await drive.uploadFile(req.usuario.drive_tokens, {
      folderId: carpetaId,
      name: nombre,
      mimeType: 'application/pdf',
      buffer: pdfFinal,
    });

    const { error: errorVersion } = await supabase.from('scan_versiones').insert({
      documento_id: documento.id,
      user_id: req.usuario.id,
      nombre_archivo: nombre,
      drive_file_id: subido.id,
      drive_link: subido.webViewLink,
    });
    if (errorVersion) console.error('[documentos] no se pudo registrar la versión', errorVersion);

    res.json({ nombre, driveLink: subido.webViewLink, paginas: indicesRestantes.length });
  } catch (err) {
    console.error('[documentos] error eliminando páginas', err);
    res.status(500).json({ error: 'error_eliminar_paginas' });
  }
});

router.post('/:id/paginas/reordenar', requireAuth, async (req, res) => {
  try {
    const documento = await traerDocumento(req);
    if (!documento) return res.status(404).json({ error: 'documento_no_encontrado' });
    const original = await drive.downloadFile(req.usuario.drive_tokens, documento.drive_file_id);
    if (!pdf.esPdf(original)) return res.status(400).json({ error: 'no_es_pdf' });

    const { paginas: total } = await pdf.info(original);
    const orden = req.body.orden || [];
    const esperado = Array.from({ length: total }, (_, i) => i).sort((a, b) => a - b);
    const recibido = [...orden].sort((a, b) => a - b);
    if (orden.length !== total || recibido.some((valor, i) => valor !== esperado[i])) {
      return res.status(400).json({ error: 'orden_invalido' });
    }

    const pdfFinal = await pdf.copiarPaginas(original, orden);
    const carpetaId = documento.carpeta_id || (await drive.ensureRuta(req.usuario.drive_tokens, []));
    const nombre = (documento.nombre_archivo || 'documento').replace(/\.\w+$/, '') + '_reordenado.pdf';
    const subido = await drive.uploadFile(req.usuario.drive_tokens, {
      folderId: carpetaId,
      name: nombre,
      mimeType: 'application/pdf',
      buffer: pdfFinal,
    });
    const { error } = await supabase.from('scan_versiones').insert({
      documento_id: documento.id,
      user_id: req.usuario.id,
      nombre_archivo: nombre,
      drive_file_id: subido.id,
      drive_link: subido.webViewLink,
    });
    if (error) console.error('[documentos] no se pudo registrar la versión reordenada', error);
    res.json({ nombre, driveLink: subido.webViewLink, paginas: total });
  } catch (err) {
    console.error('[documentos] error reordenando páginas', err);
    res.status(500).json({ error: 'error_reordenar_paginas' });
  }
});

// Arma un PDF aparte con solo las páginas seleccionadas, para compartir sin
// mandar el documento completo. No se registra como versión: es un
// recorte puntual, no una edición del documento.
router.post('/:id/paginas/compartir', requireAuth, async (req, res) => {
  try {
    const documento = await traerDocumento(req);
    if (!documento) return res.status(404).json({ error: 'documento_no_encontrado' });

    const indices = req.body.paginas || [];
    if (!indices.length) return res.status(400).json({ error: 'sin_paginas' });

    const original = await drive.downloadFile(req.usuario.drive_tokens, documento.drive_file_id);
    if (!pdf.esPdf(original)) return res.status(400).json({ error: 'no_es_pdf' });

    const pdfParcial = await pdf.copiarPaginas(original, indices);

    const carpetaId =
      documento.carpeta_id || (await drive.ensureRuta(req.usuario.drive_tokens, []));
    const nombre =
      (documento.nombre_archivo || 'documento').replace(/\.\w+$/, '') +
      `_paginas_${indices.map((i) => i + 1).join('-')}.pdf`;

    const subido = await drive.uploadFile(req.usuario.drive_tokens, {
      folderId: carpetaId,
      name: nombre,
      mimeType: 'application/pdf',
      buffer: pdfParcial,
    });

    res.json({ nombre, driveLink: subido.webViewLink });
  } catch (err) {
    console.error('[documentos] error armando páginas para compartir', err);
    res.status(500).json({ error: 'error_compartir_paginas' });
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

// Contadores para las tarjetas de Inicio.
router.get('/resumen', requireAuth, async (req, res) => {
  try {
    const ahora = new Date();
    const desdeMes = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();

    const { data, error } = await supabase
      .from('scan_documents')
      .select('created_at, es_gasto, monto, seccion, subcarpeta')
      .eq('user_id', req.usuario.id);
    if (error) throw error;

    const delMes = data.filter((d) => d.created_at >= desdeMes);
    const gastoMes = delMes.reduce(
      (suma, d) => suma + (d.es_gasto ? Number(d.monto) || 0 : 0),
      0
    );

    res.json({
      documentosTotal: data.length,
      documentosDelMes: delMes.length,
      gastoDelMes: gastoMes,
      // Lo que el clasificador no supo ubicar y espera al usuario.
      porRevisar: data.filter((d) => !d.seccion || !d.subcarpeta).length,
    });
  } catch (err) {
    console.error('[documentos] error resumen', err);
    res.status(500).json({ error: 'error_resumen' });
  }
});

/**
 * Gastos de un mes: total, desglose por categoría y serie por día para la
 * gráfica. `?mes=YYYY-MM` permite navegar hacia atrás.
 */
router.get('/gastos', requireAuth, async (req, res) => {
  try {
    const referencia = /^\d{4}-\d{2}$/.test(req.query.mes || '')
      ? new Date(`${req.query.mes}-01T00:00:00Z`)
      : new Date();

    const anio = referencia.getUTCFullYear();
    const mes = referencia.getUTCMonth();
    const inicio = new Date(Date.UTC(anio, mes, 1));
    const fin = new Date(Date.UTC(anio, mes + 1, 0));
    const iso = (f) => f.toISOString().slice(0, 10);

    const actual = await gastos.consultar(req.usuario.id, { desde: iso(inicio), hasta: iso(fin) });

    // Mes anterior, solo para el "12% menos que julio".
    const inicioPrevio = new Date(Date.UTC(anio, mes - 1, 1));
    const finPrevio = new Date(Date.UTC(anio, mes, 0));
    const previo = await gastos.consultar(req.usuario.id, {
      desde: iso(inicioPrevio),
      hasta: iso(finPrevio),
    });

    // Serie diaria para la gráfica de barras.
    const dias = fin.getUTCDate();
    const serie = Array.from({ length: dias }, () => 0);
    for (const doc of actual.documentos) {
      const dia = Number((doc.fecha || '').slice(8, 10));
      if (dia >= 1 && dia <= dias) serie[dia - 1] += Number(doc.monto) || 0;
    }

    const total = actual.resumen.total;
    const totalPrevio = previo.resumen.total;

    res.json({
      mes: `${anio}-${String(mes + 1).padStart(2, '0')}`,
      total,
      cantidad: actual.resumen.cantidad,
      totalPrevio,
      variacion: totalPrevio > 0 ? Math.round(((total - totalPrevio) / totalPrevio) * 100) : null,
      serie,
      porCategoria: actual.resumen.porCategoria.map((c) => ({
        ...c,
        porcentaje: total > 0 ? Math.round((c.monto / total) * 100) : 0,
      })),
      porComercio: actual.resumen.porEmisor,
    });
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
