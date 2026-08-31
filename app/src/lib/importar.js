import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { api } from './api';

const TIPOS = ['application/pdf', 'image/*'];

async function subir(uri, mimeType, nombre) {
  // API nueva de `expo-file-system` (SDK 52+): `readAsStringAsync` y
  // `EncodingType` ya no están en el export principal — viven en
  // `expo-file-system/legacy`, que está deprecado y avisa en consola. Se usa
  // la nueva para no cargar con esa deuda.
  //
  // `base64()` es SÍNCRONO en la API nueva. Se deja el `await` a propósito:
  // sobre un valor que no es promesa no cuesta nada, y si Expo lo vuelve
  // asíncrono más adelante esto sigue funcionando igual.
  const base64 = await new File(uri).base64();
  return api.importar(base64, mimeType, nombre);
}

// Archivos del dispositivo: en iOS abre la app Archivos (iCloud, Drive,
// Dropbox…), en Android el selector del sistema. Es el camino para PDFs.
export async function importarArchivo() {
  const resultado = await DocumentPicker.getDocumentAsync({
    type: TIPOS,
    copyToCacheDirectory: true,
  });
  if (resultado.canceled) return null;

  const archivo = resultado.assets[0];
  return subir(archivo.uri, archivo.mimeType || 'application/pdf', archivo.name);
}

// Galería de fotos — camino aparte porque el selector de archivos no
// siempre muestra el carrete.
export async function importarDeGaleria() {
  const resultado = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
  if (resultado.canceled) return null;

  const activo = resultado.assets[0];
  return subir(activo.uri, activo.mimeType || 'image/jpeg', activo.fileName);
}
