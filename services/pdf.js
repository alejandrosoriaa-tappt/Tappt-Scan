const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const canvasLib = require('@napi-rs/canvas');

// pdf.js espera APIs de navegador. @napi-rs/canvas las trae; sin esto
// descarta glifos al rasterizar.
globalThis.DOMMatrix = globalThis.DOMMatrix || canvasLib.DOMMatrix;
globalThis.Path2D = globalThis.Path2D || canvasLib.Path2D;
globalThis.ImageData = globalThis.ImageData || canvasLib.ImageData;

// pdf.js trae un NodeCanvasFactory que depende del paquete `canvas`. Ese
// paquete es opcional y su binding nativo no está disponible en Railway,
// aunque TapptScan ya usa @napi-rs/canvas. Además del lienzo principal,
// pdf.js necesita crear lienzos temporales al pintar imágenes incrustadas;
// por eso se le entrega explícitamente una fábrica respaldada por NAPI.
class NapiCanvasFactory {
  create(width, height) {
    if (width <= 0 || height <= 0) throw new Error('Dimensiones de canvas inválidas');
    const canvas = canvasLib.createCanvas(width, height);
    return { canvas, context: canvas.getContext('2d') };
  }

  reset(canvasAndContext, width, height) {
    if (!canvasAndContext?.canvas) throw new Error('Canvas no disponible');
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    if (!canvasAndContext?.canvas) return;
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

const FUENTES_ESTANDAR =
  path.join(require.resolve('pdfjs-dist/package.json'), '..', 'standard_fonts') + path.sep;

// pdfjs-dist es ESM y el repo es CommonJS: se carga con import() dinámico y
// se cachea porque es pesado.
let pdfjsCache = null;
async function cargarPdfjs() {
  if (!pdfjsCache) pdfjsCache = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsCache;
}

function esPdf(buffer) {
  return buffer && buffer.subarray(0, 5).toString() === '%PDF-';
}

async function abrir(pdfBuffer) {
  const pdfjs = await cargarPdfjs();
  return pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    isEvalSupported: false,
    standardFontDataUrl: FUENTES_ESTANDAR,
    canvasFactory: new NapiCanvasFactory(),
  }).promise;
}

// Número de páginas y si trae capa de texto real (ver docs/EDITOR-PDF.md:
// de eso depende que el texto sea reemplazable o solo pixeles).
async function info(pdfBuffer) {
  const documento = await abrir(pdfBuffer);
  const primera = await documento.getPage(1);
  const texto = await primera.getTextContent();

  return {
    paginas: documento.numPages,
    tieneTexto: texto.items.some((i) => (i.str || '').trim().length > 0),
  };
}

// Rasteriza una página a PNG para poder mostrarla y anotarla en la app.
async function renderizarPagina(pdfBuffer, indice = 0, escala = 2) {
  const documento = await abrir(pdfBuffer);
  const pagina = await documento.getPage(indice + 1);
  const vista = pagina.getViewport({ scale: escala });

  const canvas = canvasLib.createCanvas(Math.ceil(vista.width), Math.ceil(vista.height));
  await pagina.render({
    canvasContext: canvas.getContext('2d'),
    viewport: vista,
  }).promise;

  return canvas.toBuffer('image/png');
}

// Fuente Unicode opcional para acentos y signos especiales. Las fuentes
// estándar de PDF (Helvetica) son WinAnsi: no cubren buena parte de lo que
// un usuario escribe. Si el TTF existe, se incrusta y se usa en su lugar.
const RUTA_FUENTE = path.join(__dirname, '..', 'assets', 'fuente-unicode.ttf');

async function cargarFuente(pdf) {
  if (fs.existsSync(RUTA_FUENTE)) {
    pdf.registerFontkit(fontkit);
    return { fuente: await pdf.embedFont(fs.readFileSync(RUTA_FUENTE), { subset: true }), unicode: true };
  }
  return { fuente: await pdf.embedFont(StandardFonts.Helvetica), unicode: false };
}

// Los emojis a color no se pueden dibujar como texto: pdf-lib no rasteriza
// fuentes de color. Se insertan como imagen (el cliente manda el PNG).
function esImagen(anotacion) {
  return anotacion.tipo === 'imagen' || anotacion.tipo === 'firma' || anotacion.tipo === 'emoji';
}

async function incrustarImagen(pdf, base64) {
  const limpio = base64.replace(/^data:image\/\w+;base64,/, '');
  const bytes = Buffer.from(limpio, 'base64');
  return base64.includes('image/png') || bytes[0] === 0x89
    ? pdf.embedPng(bytes)
    : pdf.embedJpg(bytes);
}

// Crea un PDF de una página con la imagen del documento a página completa.
//
// El formato se decide por los BYTES, no por el mimeType que nos digan: ya
// nos pasó que una transformación cambiara el formato de salida y el
// mimeType siguiera diciendo el anterior, con lo que pdf-lib intentaba
// decodificar con el códec equivocado y reventaba. Los bytes no mienten.
async function desdeImagen(buffer, mimeType = 'image/jpeg') {
  const pdf = await PDFDocument.create();
  const esPng = buffer[0] === 0x89 && buffer[1] === 0x50; // \x89PNG
  const imagen = esPng ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);

  const pagina = pdf.addPage([imagen.width, imagen.height]);
  pagina.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });

  return Buffer.from(await pdf.save());
}

// Construye un único PDF conservando el orden del borrador. Cada página
// adopta la proporción de su imagen ya enderezada, sin forzar un lienzo
// cuadrado ni mezclar tamaños de manera accidental.
async function desdeImagenes(buffers) {
  const documento = await PDFDocument.create();
  for (const buffer of buffers) {
    const esPng = buffer[0] === 0x89 && buffer[1] === 0x50;
    const imagen = esPng ? await documento.embedPng(buffer) : await documento.embedJpg(buffer);
    const pagina = documento.addPage([imagen.width, imagen.height]);
    pagina.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });
  }
  return Buffer.from(await documento.save());
}

/**
 * Aplica anotaciones sobre un PDF existente.
 *
 * Coordenadas en fracciones (0-1) del ancho/alto de página, con origen
 * arriba-izquierda — así el cliente no necesita saber los puntos del PDF ni
 * que su eje Y va al revés.
 *
 * Tipos: `texto`, `firma`, `imagen`, `emoji`, `tapar` (rectángulo negro
 * por defecto para censurar información).
 */
async function aplicarAnotaciones(pdfBuffer, anotaciones = []) {
  const pdf = await PDFDocument.load(pdfBuffer);
  const { fuente, unicode } = await cargarFuente(pdf);
  const paginas = pdf.getPages();
  const omitidas = [];

  for (const anotacion of anotaciones) {
    const pagina = paginas[anotacion.pagina || 0];
    if (!pagina) continue;

    const { width: ancho, height: alto } = pagina.getSize();
    const x = (anotacion.x || 0) * ancho;
    const y = alto - (anotacion.y || 0) * alto; // el cliente manda Y desde arriba

    if (anotacion.tipo === 'tapar') {
      const colorTapado = /^#[0-9A-Fa-f]{6}$/.test(anotacion.color || '')
        ? anotacion.color
        : '#000000';
      const rojo = parseInt(colorTapado.slice(1, 3), 16) / 255;
      const verde = parseInt(colorTapado.slice(3, 5), 16) / 255;
      const azul = parseInt(colorTapado.slice(5, 7), 16) / 255;
      pagina.drawRectangle({
        x,
        y: y - (anotacion.alto || 0.03) * alto,
        width: (anotacion.ancho || 0.2) * ancho,
        height: (anotacion.alto || 0.03) * alto,
        color: rgb(rojo, verde, azul),
      });
      continue;
    }

    if (esImagen(anotacion)) {
      if (!anotacion.datos) continue;
      const imagen = await incrustarImagen(pdf, anotacion.datos);
      const anchoFinal = (anotacion.ancho || 0.25) * ancho;
      const altoFinal = anchoFinal * (imagen.height / imagen.width);

      pagina.drawImage(imagen, {
        x,
        y: y - altoFinal,
        width: anchoFinal,
        height: altoFinal,
        rotate: degrees(anotacion.rotacion || 0),
      });
      continue;
    }

    if (anotacion.tipo === 'texto') {
      const tamano = (anotacion.tamano || 0.02) * alto;
      const texto = anotacion.texto || '';

      // Con las fuentes estándar, un carácter fuera de WinAnsi revienta el
      // guardado. Mejor omitir esa anotación y avisar que se necesita la
      // fuente Unicode.
      if (!unicode && /[^\x00-\xFF]/.test(texto)) {
        omitidas.push({ texto, motivo: 'fuente_sin_glifo' });
        continue;
      }

      pagina.drawText(texto, {
        x,
        y: y - tamano,
        size: tamano,
        font: fuente,
        color: rgb(0, 0, 0),
      });
    }
  }

  return { pdf: Buffer.from(await pdf.save()), omitidas };
}

/**
 * Arma un PDF nuevo solo con las páginas pedidas (índices 0-based, en el
 * orden en que vengan). Usada tanto para "eliminar páginas" (se le pasan
 * las que SÍ quedan) como para "compartir solo estas páginas".
 */
async function copiarPaginas(pdfBuffer, indices) {
  const original = await PDFDocument.load(pdfBuffer);
  const nuevo = await PDFDocument.create();
  const copiadas = await nuevo.copyPages(original, indices);
  copiadas.forEach((pagina) => nuevo.addPage(pagina));
  return Buffer.from(await nuevo.save());
}

module.exports = {
  desdeImagen,
  desdeImagenes,
  aplicarAnotaciones,
  copiarPaginas,
  esPdf,
  info,
  renderizarPagina,
  RUTA_FUENTE,
};
