const vision = require('./vision');
const naming = require('./naming');
const drive = require('./drive');
const supabase = require('./supabase');

// Pipeline compartido: lo usan tanto el webhook de WhatsApp como la subida
// desde la cámara de la app, para que ambos caminos den el mismo resultado.
async function procesarImagen(usuario, buffer, mimeType = 'image/jpeg') {
  const extraido = await vision.classifyAndExtract(buffer, mimeType);

  const carpetas =
    usuario.drive_folders || (await drive.ensureFolderStructure(usuario.drive_tokens));
  const nombreCarpeta = naming.folderFor(extraido);
  const extension = mimeType.includes('png') ? 'png' : 'jpg';
  const nombreArchivo = naming.fileNameFor(extraido, extension);

  const subido = await drive.uploadFile(usuario.drive_tokens, {
    folderId: carpetas[nombreCarpeta],
    name: nombreArchivo,
    mimeType,
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
      drive_file_id: subido.id,
      drive_link: subido.webViewLink,
    })
    .select()
    .single();
  if (error) throw error;

  return { documento, extraido, nombreCarpeta, nombreArchivo };
}

module.exports = { procesarImagen };
