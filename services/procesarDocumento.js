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
    // `soloClaro`: aquí no hay pantalla de ajuste (a diferencia de la
    // cámara de la app) — nadie ve el resultado antes de que se guarde.
    // Probado en producción (2026-08-12): la hipótesis de "documento =
    // región oscura" combinada con una foto ya comprimida por WhatsApp
    // puede armar un cuadrilátero de ruido/artefactos JPEG en vez del
    // objeto real, y sin nadie viéndolo antes de guardar el resultado
    // sale irreconocible. Se queda con la hipótesis vieja, conservadora,
    // acá — la de las dos hipótesis vive en la cámara de la app, donde el
    // usuario ve y puede ajustar las esquinas antes de confirmar.
    try {
      const { esquinas, confiable } = await imagen.detectarDocumento(buffer, true);
      if (confiable) {
        buffer = await imagen.corregirPerspectiva(buffer, esquinas);
        // corregirPerspectiva siempre devuelve JPEG sin importar el formato
        // de entrada — hay que reflejarlo aquí o `pdf.desdeImagen` intenta
        // decodificar los bytes con el códec equivocado y Claude recibe un
        // media_type que no coincide con lo que le mandamos.
        mimeType = 'image/jpeg';
      }
    } catch (err) {
      // Un fallo aquí no debe tumbar el escaneo completo: seguimos con
      // la imagen tal cual llegó.
      console.warn('[procesarDocumento] no se pudo enderezar automáticamente', err.message);
    }

    // El filtro de auto-realce se retiró de este camino automático
    // (2026-08-12): mismo problema — sin nadie viéndolo antes de
    // guardar, estirar el contraste de una foto ya comprimida por
    // WhatsApp puede exagerar artefactos JPEG en vez de mejorar la
    // imagen. Los filtros siguen disponibles y probados en la cámara de
    // la app (`RecorteScreen`), donde SÍ hay vista previa antes de
    // confirmar.
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
