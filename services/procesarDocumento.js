const vision = require('./vision');
const naming = require('./naming');
const drive = require('./drive');
const pdf = require('./pdf');
const imagen = require('./imagen');
const supabase = require('./supabase');
const taxonomia = require('./taxonomia');
const sheets = require('./sheets');
const planes = require('./planes');

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

  // Enderezado automático para fotos: es lo único que la cámara de la app
  // ya hace (con esquinas ajustables a mano), pero WhatsApp e importar
  // archivos no pasan por ninguna pantalla de recorte. Se aplica aquí,
  // en el único lugar que ven los tres caminos de entrada, para que
  // también les toque. Si la imagen ya viene recortada de cerca (por
  // RecorteScreen, o porque el usuario ya la ajustó en WhatsApp antes de
  // mandarla) `detectarDocumento` lo nota (área > 97%) y no hace nada —
  // no hay doble recorte.
  if (!entradaEsPdf) {
    try {
      const { esquinas, confiable } = await imagen.detectarDocumento(buffer);
      if (confiable) {
        buffer = await imagen.corregirPerspectiva(buffer, esquinas);
        // corregirPerspectiva siempre devuelve PNG (toBuffer('image/png') en
        // services/imagen.js) sin importar el formato de entrada — hay que
        // reflejarlo aquí o pdf.desdeImagen intenta leer estos bytes como
        // JPEG (revienta) y Claude recibe un media_type que no coincide con
        // los bytes reales.
        mimeType = 'image/png';
      }
    } catch (err) {
      // Un fallo aquí no debe tumbar el escaneo completo: seguimos con
      // la imagen tal cual llegó.
      console.warn('[procesarDocumento] no se pudo enderezar automáticamente', err.message);
    }

    // Auto niveles leve (mismo motor que los filtros de la app, preset
    // 'color'): WhatsApp no tiene pantalla para elegir filtro, así que se
    // aplica el más conservador solo. Sin esto, una foto con poca luz
    // (una tarjeta oscura, un ticket bajo luz amarilla) se guardaba tal
    // cual se tomó — es la causa concreta reportada por el usuario.
    try {
      buffer = await imagen.aplicarFiltro(buffer, 'color');
      mimeType = 'image/jpeg';
    } catch (err) {
      console.warn('[procesarDocumento] no se pudo auto-realzar', err.message);
    }
  }

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
      seccion: extraido.seccion || null,
      subcarpeta: extraido.subcarpeta || null,
      es_gasto: Boolean(extraido.es_gasto) && extraido.monto != null,
      categoria_gasto: taxonomia.categoriaGastoValida(extraido.categoria_gasto),
      concepto: extraido.concepto || null,
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

  // El control de gastos es del plan Negocio. Se lanza sin await: si la
  // hoja falla, el documento ya quedó guardado igual.
  if (planes.tieneControlDeGastos(usuario)) {
    sheets.registrarGasto(usuario, documento).catch(() => {});
  }

  return {
    documento,
    extraido,
    nombreArchivo,
    ruta: naming.rutaLegible(tramos),
    paginas,
  };
}

module.exports = { procesarArchivo, procesarImagen: procesarArchivo };
