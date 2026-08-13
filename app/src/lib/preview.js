import { Platform } from 'react-native';

/**
 * Cómo se encaja el cuadro de la cámara dentro de la pantalla.
 *
 * En web lo decidimos nosotros y va en `contain`: con `cover` el navegador
 * escala el video hasta tapar la pantalla y RECORTA lo que sobra, que en un
 * teléfono en vertical es buena parte del campo visual del sensor. Ese
 * recorte se ve exactamente igual que un zoom-in — era la causa real de que
 * el visor se sintiera cerrado, más allá de qué cámara física se abriera.
 * Con `contain` se ve todo lo que ve el sensor, aunque queden bandas.
 *
 * En nativo `expo-camera` no expone el modo de ajuste: su preview es
 * `cover`. Por eso esto NO es una constante suelta sino la única fuente de
 * verdad, compartida por el componente de cámara y por la proyección del
 * polígono: si las dos no coinciden, el quad se dibuja corrido.
 */
export const AJUSTE_PREVIEW = Platform.OS === 'web' ? 'contain' : 'cover';

/**
 * Convierte una esquina en fracción del CUADRO analizado a píxeles de
 * PANTALLA, deshaciendo el encaje del preview.
 *
 * `contain` escala hasta que quepa (min) y deja bandas; `cover` escala
 * hasta tapar (max) y recorta. La única diferencia entre ambos es esa.
 */
export function proyectarEsquina(esquina, cuadro, pantalla) {
  const escala =
    AJUSTE_PREVIEW === 'contain'
      ? Math.min(pantalla.ancho / cuadro.ancho, pantalla.alto / cuadro.alto)
      : Math.max(pantalla.ancho / cuadro.ancho, pantalla.alto / cuadro.alto);
  const anchoVisible = cuadro.ancho * escala;
  const altoVisible = cuadro.alto * escala;
  return {
    x: (pantalla.ancho - anchoVisible) / 2 + esquina.x * anchoVisible,
    y: (pantalla.alto - altoVisible) / 2 + esquina.y * altoVisible,
  };
}
