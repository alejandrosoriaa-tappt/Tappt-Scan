const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

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
async function desdeImagen(buffer, mimeType = 'image/jpeg') {
  const pdf = await PDFDocument.create();
  const imagen = mimeType.includes('png') ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);

  const pagina = pdf.addPage([imagen.width, imagen.height]);
  pagina.drawImage(imagen, { x: 0, y: 0, width: imagen.width, height: imagen.height });

  return Buffer.from(await pdf.save());
}

/**
 * Aplica anotaciones sobre un PDF existente.
 *
 * Coordenadas en fracciones (0-1) del ancho/alto de página, con origen
 * arriba-izquierda — así el cliente no necesita saber los puntos del PDF ni
 * que su eje Y va al revés.
 *
 * Tipos: `texto`, `firma`, `imagen`, `emoji`, `tapar` (rectángulo blanco
 * para ocultar texto antes de reescribir encima).
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
      pagina.drawRectangle({
        x,
        y: y - (anotacion.alto || 0.03) * alto,
        width: (anotacion.ancho || 0.2) * ancho,
        height: (anotacion.alto || 0.03) * alto,
        color: rgb(1, 1, 1),
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

module.exports = { desdeImagen, aplicarAnotaciones, RUTA_FUENTE };
