import { Alert, Platform } from 'react-native';

// Alert.alert() es un no-op en react-native-web (ver
// node_modules/react-native-web/dist/exports/Alert): en el navegador no
// muestra nada, ni siquiera loguea. Un error real se pierde en silencio —
// el botón que lo disparó simplemente "no hace nada". window.alert() sí
// existe en cualquier navegador y no requiere ninguna librería extra.
export function alertar(titulo, mensaje) {
  if (Platform.OS === 'web') {
    window.alert(mensaje ? `${titulo}\n\n${mensaje}` : titulo);
    return;
  }
  Alert.alert(titulo, mensaje);
}
