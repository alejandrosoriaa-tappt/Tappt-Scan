import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * El token de sesión de TapptScan.
 *
 * No hay Supabase Auth: la identidad es el número de WhatsApp, verificado
 * al entrar. El backend firma un token propio y aquí solo se guarda.
 */
const CLAVE = 'tappt-scan.token';

let enMemoria = null;

export async function leerToken() {
  if (enMemoria !== null) return enMemoria;
  enMemoria = await AsyncStorage.getItem(CLAVE);
  return enMemoria;
}

export async function guardarToken(token) {
  enMemoria = token;
  await AsyncStorage.setItem(CLAVE, token);
}

export async function borrarToken() {
  enMemoria = null;
  await AsyncStorage.removeItem(CLAVE);
}
