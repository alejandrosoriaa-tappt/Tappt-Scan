const vision = require('./vision');
const naming = require('./naming');
const drive = require('./drive');
const pdf = require('./pdf');
const supabase = require('./supabase');

/**
 * Tubería compartida por los tres caminos de entrada: webhook de WhatsApp
 * (foto o PDF reenviado), cámara de la app e importación desde el
 * dispositivo.
 *
 * Lo que hace que se sienta mágico:
 *   foto de un recibo  →  CFE_Agosto_2026_$1,847.pdf
 *                         en  TapptScan/Casa/Servicios/CFE/2026/
 *
 * Todo termina en PDF —también las fotos— para que el archivo se abra
 * igual en cualquier lado y el editor tenga un solo formato que manejar.
 */
async function procesarArchivo(usuario, buffer, mimeType = 'image/jpeg', nombreOriginal = null) {
  const entradaEsPdf = pdf.esPdf(buffer) || mimeType === 'application/pdf';

  // Claude necesita ver algo: de un PDF se rasteriza la primera página.
  let paraVision = buffer;
  let mimeVision = mimeType;
  let paginas = 1;

  if (entradaEsPdf) {
    const datos = await pdf.info(buffer);
    paginas = datos.paginas;
    paraVision = await pdf.renderizarPagina(buffer, 0);
    mimeVision = 'image/png';
  }

  const extraido = await vision.classifyAndExtract(paraVision, mimeVision);

  // Las fotos se envuelven en un PDF; los PDF se conservan intactos.
  const archivo = entradaEsPdf ? buffer : await pdf.desdeImagen(buffer, mimeType);

  const idioma = usuario.idioma || 'es';
  const tramos = naming.rutaPara(extraido);
  const nombreArchivo = naming.nombreArchivo(extraido, idioma, 'pdf');

  const carpetaId = await drive.ensureRuta(usuario.drive_tokens, tramos);
  const subido = await drive.uploadFile(usuario.drive_tokens, {
    folderId: carpetaId,
    name: nombreArchivo,
    mimeType: 'application/pdf',
    buffer: archivo,
  });

  const { data: documento, error } = await supabase
    .from('scan_documents')
    .insert({
      user_id: usuario.id,
      tipo: extraido.tipo || 'otro',
      ambito: extraido.ambito || null,
      categoria: extraido.categoria || null,
      emisor: extraido.emisor || null,
      fecha: extraido.fecha || null,
      monto: extraido.monto ?? null,
      moneda: extraido.moneda || null,
      nombre_archivo: nombreArchivo,
      nombre_original: nombreOriginal,
      ruta: naming.rutaLegible(tramos),
      carpeta_id: carpetaId,
      mime_type: 'application/pdf',
      paginas,
      drive_file_id: subido.id,
      drive_link: subido.webViewLink,
    })
    .select()
    .single();
  if (error) throw error;

  return {
    documento,
    extraido,
    nombreArchivo,
    ruta: naming.rutaLegible(tramos),
    paginas,
  };
}

module.exports = { procesarArchivo, procesarImagen: procesarArchivo };
