'use strict';

/**
 * Umbral adaptativo local experimental para documentos con sombras.
 * Usa imagen integral para calcular la media de cada ventana en O(n).
 * Se mantiene fuera de producción hasta validarlo con fotografías reales.
 */
function umbralAdaptativo(grises, ancho, alto, { bloque = 21, c = 11 } = {}) {
  if (!(grises?.length === ancho * alto) || ancho < 1 || alto < 1) {
    throw new Error('adaptive_threshold_dimensiones_invalidas');
  }
  if (bloque < 3 || bloque % 2 === 0) throw new Error('adaptive_threshold_bloque_invalido');

  const stride = ancho + 1;
  const integral = new Float64Array((ancho + 1) * (alto + 1));
  for (let y = 1; y <= alto; y++) {
    let sumaFila = 0;
    for (let x = 1; x <= ancho; x++) {
      sumaFila += grises[(y - 1) * ancho + x - 1];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + sumaFila;
    }
  }

  const radio = Math.floor(bloque / 2);
  const salida = new Uint8ClampedArray(grises.length);
  for (let y = 0; y < alto; y++) {
    const y0 = Math.max(0, y - radio);
    const y1 = Math.min(alto - 1, y + radio);
    for (let x = 0; x < ancho; x++) {
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(ancho - 1, x + radio);
      const suma =
        integral[(y1 + 1) * stride + x1 + 1] -
        integral[y0 * stride + x1 + 1] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0];
      const media = suma / ((x1 - x0 + 1) * (y1 - y0 + 1));
      salida[y * ancho + x] = grises[y * ancho + x] > media - c ? 255 : 0;
    }
  }
  return salida;
}

module.exports = { umbralAdaptativo };
