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

// Para el caso de Alert.alert(titulo, mensaje, [boton1, boton2]): en web
// no hay equivalente con más de un botón con texto propio, así que se
// aproxima con confirm() — Aceptar dispara el primer botón, Cancelar el
// segundo (si existe). En nativo se comporta idéntico a Alert.alert.
export function alertarConBotones(titulo, mensaje, botones = []) {
  if (Platform.OS === 'web') {
    const acepta = window.confirm(mensaje ? `${titulo}\n\n${mensaje}` : titulo);
    const boton = acepta ? botones[0] : botones[1] || botones[0];
    boton?.onPress?.();
    return;
  }
  Alert.alert(titulo, mensaje, botones);
}
