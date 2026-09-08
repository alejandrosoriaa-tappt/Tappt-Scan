import { Image } from 'react-native';
import { File } from 'expo-file-system';
import TapptDocumentScanner from '../../modules/tappt-document-scanner';

const MARCO_COMPLETO = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function dimensiones(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (ancho, alto) => resolve({ ancho, alto }), reject);
  });
}

/**
 * Convierte las páginas ya recortadas/enderezadas por VisionKit o ML Kit al
 * mismo contrato que usa el borrador web. El backend recibe marco completo:
 * volver a detectar bordes aquí podría recortar dos veces una página buena.
 */
export async function escanearDocumentoNativo() {
  const resultado = await TapptDocumentScanner.scan({ maxPages: 30 });
  if (resultado.cancelled) return null;

  const paginas = [];
  // Cada JPEG puede ocupar varios MB. Prepararlos uno por uno evita mantener
  // múltiples copias Base64 simultáneas y reduce cierres por falta de memoria.
  for (const { uri } of resultado.pages) {
    const { ancho, alto } = await dimensiones(uri);
    const imagen = await new File(uri).base64();

    paginas.push({
      imagen,
      ancho,
      alto,
      esquinas: MARCO_COMPLETO,
      filtro: 'color',
      formato: 'auto',
      vista: uri,
      origen: resultado.engine,
    });
  }

  return paginas;
}

export function cancelarEscaneoNativo() {
  return TapptDocumentScanner.cancel();
}
