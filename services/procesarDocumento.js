const vision = require('./vision');
const naming = require('./naming');
const drive = require('./drive');
const pdf = require('./pdf');
const imagen = require('./imagen');
const docquad = require('./docquad');
const alineacionIA = require('./alineacionIA');
const supabase = require('./supabase');
const taxonomia = require('./taxonomia');
const sheets = require('./sheets');
const planes = require('./planes');
const telemetria = require('./telemetria');

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
async function procesarArchivoBase(usuario, buffer, mimeType = 'image/jpeg', nombreOriginal = null) {
  const metricas = {};
  const entradaEsPdf = pdf.esPdf(buffer) || mimeType === 'application/pdf';

  // Enderezado automático para fotos de WhatsApp/importación.
  //
  // Desde 2026-08-12 este camino usa DocQuad; el heurístico Otsu queda fuera
  // del flujo de producto. Como aquí no hay pantalla de recorte, aplicamos
  // perspectiva SOLO cuando DocQuad supera sus guardrails de confianza.
  // Ante cualquier duda conservamos la foto completa: perder un poco de
  // estética es preferible a cortar información del documento.
  if (!entradaEsPdf) {
    try {
      let { esquinas, confiable, razon, diagnostico, fuente } = await docquad.detectarDocumento(buffer);
      // La IA nunca inventa un recorte por sí sola. Solo puede corroborar un
      // quad parcial local cuando ambos coinciden sobre el mismo papel.
      if (!confiable && esquinas?.length === 4 && alineacionIA.habilitada()) {
        const ia = await alineacionIA.corroborar(buffer, esquinas);
        diagnostico = { ...diagnostico, ia };
        if (ia.confirmada) {
          confiable = true;
          fuente = `${fuente || 'scanner'}+openai`;
          razon = null;
          console.log(`[procesarDocumento] quad corroborado por IA; IoU=${ia.acuerdoIoU.toFixed(3)}`);
        } else {
          console.log(`[procesarDocumento] IA no corroboró el quad: ${ia.razon}`);
        }
      }
      // Una imagen ya corregida por RecorteScreen normalmente ocupa casi todo
      // el frame. No volver a proyectarla: una segunda homografía sólo puede
      // degradar nitidez o recortar bordes. En WhatsApp una foto encuadrada de
      // cerca tampoco necesita corrección adicional.
      const necesitaPerspectiva = (diagnostico?.area ?? 0) < 0.90;
      if (confiable && esquinas?.length === 4 && necesitaPerspectiva) {
        buffer = await imagen.corregirPerspectiva(buffer, esquinas);
        // corregirPerspectiva siempre devuelve JPEG sin importar el formato
        // de entrada; reflejarlo evita declarar un media type incorrecto.
        mimeType = 'image/jpeg';
      } else if (razon) {
        console.log(`[procesarDocumento] detector sin confianza: ${razon}; fuente=${fuente || 'scanner'}`);
      }
    } catch (err) {
      // Un fallo aquí no debe tumbar el escaneo completo: seguimos con la
      // imagen tal cual llegó.
      console.warn('[procesarDocumento] no se pudo enderezar con DocQuad', err.message);
    }

    // El filtro de auto-realce se mantiene fuera de este camino automático:
    // sin vista previa, un realce agresivo puede exagerar artefactos JPEG de
    // WhatsApp. Los presets siguen disponibles en RecorteScreen.
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

  let extraido;
  const inicioIa = Date.now();
  try {
    extraido = await vision.classifyAndExtract(paraVision, mimeVision);
    metricas.claude = { ok: true, durationMs: Date.now() - inicioIa };
  } catch (err) {
    // La clasificación mejora la ruta, pero jamás debe impedir que el usuario
    // guarde su PDF. Si la IA tarda o falla, continúa en Por revisar.
    console.warn('[procesarDocumento] clasificación no disponible; guardando por revisar', err.message);
    metricas.claude = { ok: false, durationMs: Date.now() - inicioIa };
    extraido = { tipo: 'otro', seccion: null, subcarpeta: null };
  }

  const idioma = usuario.idioma || 'es';
  // Las fotos se envuelven en un PDF. En el plan gratuito se integra una
  // firma promocional discreta en todas las páginas; al pagar, desaparece.
  let archivo = entradaEsPdf ? buffer : await pdf.desdeImagen(buffer, mimeType);
  if (planes.planVigente(usuario) === 'gratis') {
    archivo = await pdf.agregarMarcaTappt(archivo, idioma);
  }

  const tramos = naming.rutaPara(extraido);
  const nombreArchivo = naming.nombreArchivo(extraido, idioma, 'pdf');

  const inicioDrive = Date.now();
  let carpetaId;
  let subido;
  try {
    carpetaId = await drive.ensureRuta(usuario.drive_tokens, tramos);
    subido = await drive.uploadFile(usuario.drive_tokens, {
      folderId: carpetaId,
      name: nombreArchivo,
      mimeType: 'application/pdf',
      buffer: archivo,
    });
    metricas.googleDrive = { ok: true, durationMs: Date.now() - inicioDrive };
  } catch (error) {
    metricas.googleDrive = { ok: false, durationMs: Date.now() - inicioDrive };
    error.tapptMetricas = metricas;
    throw error;
  }

  const registro = {
    user_id: usuario.id,
    tipo: extraido.tipo || 'otro',
    seccion: extraido.seccion || null,
    subcarpeta: extraido.subcarpeta || null,
    es_gasto: Boolean(extraido.es_gasto) && extraido.monto != null,
    categoria_gasto: taxonomia.categoriaGastoValida(extraido.categoria_gasto),
    concepto: extraido.concepto || null,
    emisor: extraido.emisor || null,
    persona: extraido.persona || null,
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
  };

  const inicioSupabase = Date.now();
  let { data: documento, error } = await supabase
    .from('scan_documents')
    .insert(registro)
    .select()
    .single();

  // PostgREST puede tardar en refrescar su caché después de agregar una
  // columna. `persona` mejora la organización, pero nunca debe impedir que
  // un PDF ya clasificado y subido a Drive se registre. Si la caché todavía
  // no conoce exclusivamente esa columna, repetimos el insert sin ella.
  if (
    error?.code === 'PGRST204' &&
    /['"]persona['"] column/i.test(error.message || '')
  ) {
    console.warn('[procesarDocumento] Supabase no reconoce persona; reintentando sin esa columna');
    const { persona: _persona, ...registroCompatible } = registro;
    ({ data: documento, error } = await supabase
      .from('scan_documents')
      .insert(registroCompatible)
      .select()
      .single());
  }
  if (error) {
    metricas.supabase = { ok: false, durationMs: Date.now() - inicioSupabase };
    error.tapptMetricas = metricas;
    throw error;
  }
  metricas.supabase = { ok: true, durationMs: Date.now() - inicioSupabase };

  // El control de gastos es de Tappt Pro. Se lanza sin await: si la
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
    metricas,
  };
}

async function procesarArchivo(usuario, buffer, mimeType = 'image/jpeg', nombreOriginal = null, opciones = {}) {
  const inicio = Date.now();
  try {
    const resultado = await procesarArchivoBase(usuario, buffer, mimeType, nombreOriginal);
    telemetria.registrarEnSegundoPlano({
      eventType: 'document_processed',
      status: 'ok',
      origin: opciones.origin || 'unknown',
      usuario,
      documentId: resultado.documento?.id,
      pages: resultado.paginas,
      durationMs: Date.now() - inicio,
      aiCalls: 1,
      appVersion: opciones.appVersion,
      metadata: { apis: resultado.metricas },
    });
    return resultado;
  } catch (error) {
    telemetria.registrarEnSegundoPlano({
      eventType: 'document_processed',
      status: 'error',
      origin: opciones.origin || 'unknown',
      usuario,
      durationMs: Date.now() - inicio,
      aiCalls: 1,
      error,
      appVersion: opciones.appVersion,
      metadata: { apis: error.tapptMetricas || {} },
    });
    throw error;
  }
}

module.exports = { procesarArchivo, procesarImagen: procesarArchivo };
