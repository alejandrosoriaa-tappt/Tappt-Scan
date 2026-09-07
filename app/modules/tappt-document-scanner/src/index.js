import { requireNativeModule } from 'expo-modules-core';

/**
 * La carga es DIFERIDA a propósito. Cuando esto se resolvía al importar, un
 * APK empaquetado sin el código Kotlin (v8) tumbaba la app entera al
 * arrancar — ni login ni documentos ni ajustes, aunque nada de eso use el
 * escáner. Con la carga diferida la app abre y solo falla el escaneo, que es
 * el error que el usuario sí puede entender y reportar.
 */
let modulo;

function cargar() {
  if (modulo === undefined) {
    try {
      modulo = requireNativeModule('TapptDocumentScanner');
    } catch {
      modulo = null;
    }
  }
  return modulo;
}

export function escanerNativoDisponible() {
  return cargar() !== null;
}

export default {
  async scan(opciones) {
    const nativo = cargar();
    if (!nativo) {
      const error = new Error('El escáner nativo no está incluido en esta versión de la app');
      error.code = 'ERR_MODULO_AUSENTE';
      throw error;
    }
    return nativo.scan(opciones);
  },
};
