const TIPO_A_CARPETA = {
  identificacion: 'Identificaciones',
  recibo: 'Recibos',
  contrato: 'Contratos',
  otro: 'Otros',
};

function folderFor(extracted) {
  return TIPO_A_CARPETA[extracted.tipo] || 'Otros';
}

function fileNameFor(extracted, ext = 'jpg') {
  const parts = [extracted.fecha, extracted.tipo, extracted.emisor]
    .filter(Boolean)
    .map((p) => String(p).trim().replace(/\s+/g, '_').replace(/[^\w\-]/g, ''));

  const base = parts.length ? parts.join('_') : `documento_${Date.now()}`;
  return `${base}.${ext}`;
}

module.exports = { folderFor, fileNameFor };
