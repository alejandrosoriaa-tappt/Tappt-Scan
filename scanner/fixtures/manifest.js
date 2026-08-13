'use strict';

/**
 * Banco de fixtures del scanner (paso 1.6 del plan).
 *
 * POR QUÉ EXISTE ESTO
 * -------------------
 * Antes el CI medía el detector con una sola imagen y una aserción que no
 * describía la respuesta correcta, sino una cualquiera: "que encuentre un
 * quad con área < 0.95". Con esa vara, un detector que devolvía un
 * cuadrilátero en medio del texto pasaba, y uno que devolvía la respuesta
 * correcta fallaba. Se estuvo ajustando el detector contra esa señal
 * durante varias sesiones.
 *
 * Un fixture aquí NO es solo una imagen: es una imagen MÁS dónde está de
 * verdad el documento. Sin ground truth no se puede decir si un cambio
 * mejoró o empeoró, solo si el proceso terminó sin excepción.
 *
 * TIPOS
 * -----
 * - `escena`   el documento es una parte del cuadro, con fondo alrededor.
 *              Es el caso real del producto (foto sobre una mesa).
 * - `recortado` la imagen YA es el documento y ocupa el cuadro completo.
 *              La respuesta correcta es el marco entero. Distinguirlo
 *              importa: la regla "casi todo el cuadro no es detección",
 *              que es correcta en `escena`, aquí daría la respuesta mala.
 *
 * GROUND TRUTH
 * ------------
 * Coordenadas normalizadas 0..1 sobre la imagen original, en orden
 * topLeft, topRight, bottomRight, bottomLeft, siguiendo el PERÍMETRO
 * FÍSICO DEL PAPEL — nunca una tabla o un recuadro impreso adentro.
 * Anotadas a mano sobre la imagen con una rejilla de décimos.
 *
 * PENDIENTE: el plan pide 20 fixtures. Van 2. Cada foto nueva que se
 * agregue aquí (con su ground truth) vale más que cualquier ajuste de
 * umbral hecho a ojo.
 */

const FIXTURES = [
  {
    id: 'camscanner-nota',
    tipo: 'escena',
    descripcion: 'Hoja escrita a mano sobre mesa de madera, perspectiva leve.',
    url:
      'https://raw.githubusercontent.com/AdityaPai2398/CamScanner-In-Python/' +
      '1dfad528594d570d6183113940c6b7decadc0890/test_img.jpg',
    archivo: 'camscanner-nota.jpg',
    // Anotado a mano sobre rejilla de décimos.
    groundTruth: [
      { x: 0.222, y: 0.175 },
      { x: 0.681, y: 0.147 },
      { x: 0.706, y: 0.886 },
      { x: 0.220, y: 0.906 },
    ],
    minIoU: 0.85,
  },
  {
    id: 'makeacopy-recortado',
    tipo: 'recortado',
    descripcion:
      'Página A4 de texto YA recortada: ocupa el cuadro completo. ' +
      'Viene de los tests instrumentados de MakeACopy.',
    url:
      'https://raw.githubusercontent.com/egdels/makeacopy/' +
      'f4aaf8fc3a9a96422446600a139f117240d3843b/app/src/androidTest/assets/' +
      'instrumented_test_data/20251007_183138_cropped.jpg',
    archivo: 'makeacopy-recortado.jpg',
    groundTruth: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    minIoU: 0.9,
  },
  {
    id: 'camscanner-lejos',
    tipo: 'escena',
    sintetico: true,
    derivadoDe: 'camscanner-nota',
    factor: 2.6,
    descripcion:
      'La misma hoja vista DE LEJOS: ocupa ~5% del cuadro, como queda al ' +
      'capturar con la cámara ultra-wide a 0.5x. Encuadre que el producto ' +
      'pide (capturar con margen) y que los mínimos de área rechazaban.',
    minIoU: 0.8,
  },
];

module.exports = { FIXTURES };
