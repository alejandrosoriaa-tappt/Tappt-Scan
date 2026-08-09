const vision = require('./vision');
const naming = require('./naming');
const drive = require('./drive');
const pdf = require('./pdf');
const supabase = require('./supabase');

/**
 * Pipeline compartido por los tres caminos de entrada: webhook de WhatsApp
 * (foto o PDF reenviado), cámara de la app e importación desde el
 * dispositivo.
 *
 * El archivo se sube a Drive **tal como llegó** — si es un PDF se conserva
 * el PDF, no se aplasta a imagen. Para clasificarlo con Claude se rasteriza
 * la primera página, porque el modelo necesita ver algo.
 */
async function procesarArchivo(usuario, buffer, mimeType = 'image/jpeg', nombreOriginal = null) {
  const esPdf = pdf.esPdf(buffer) || mimeType === 'application/pdf';

  let paraVision = buffer;
  let mimeVision = mimeType;
  let paginas = 1;

  if (esPdf) {
    const datos = await pdf.info(buffer);
    paginas = datos.paginas;
    paraVision = await pdf.renderizarPagina(buffer, 0);
    mimeVision = 'image/png';
  }

  const extraido = await vision.classifyAndExtract(paraVision, mimeVision);

  const carpetas =
    usuario.drive_folders || (await drive.ensureFolderStructure(usuario.drive_tokens));
  const nombreCarpeta = naming.folderFor(extraido);
  const extension = esPdf ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg';
  const nombreArchivo = naming.fileNameFor(extraido, extension);

  const subido = await drive.uploadFile(usuario.drive_tokens, {
    folderId: carpetas[nombreCarpeta],
    name: nombreArchivo,
    mimeType: esPdf ? 'application/pdf' : mimeType,
    buffer,
  });

  const { data: documento, error } = await supabase
    .from('scan_documents')
    .insert({
      user_id: usuario.id,
      tipo: extraido.tipo,
      emisor: extraido.emisor,
      fecha: extraido.fecha,
      monto: extraido.monto,
      moneda: extraido.moneda,
      nombre_archivo: nombreArchivo,
      nombre_original: nombreOriginal,
      mime_type: esPdf ? 'application/pdf' : mimeType,
      paginas,
      drive_file_id: subido.id,
      drive_link: subido.webViewLink,
    })
    .select()
    .single();
  if (error) throw error;

  return { documento, extraido, nombreCarpeta, nombreArchivo, paginas };
}

// Nombre viejo, se mantiene para no romper llamadas existentes.
const procesarImagen = procesarArchivo;

module.exports = { procesarArchivo, procesarImagen };
