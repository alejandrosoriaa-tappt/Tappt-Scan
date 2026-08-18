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
 * - `vacio`    NO hay documento. La respuesta correcta es no dar nada por
 *              confiable, y ojalá ni siquiera dibujar. No lleva ground
 *              truth: no hay nada que encerrar. Este tipo es el que
 *              impide que "detectar más" se confunda con "detectar bien" —
 *              un detector que siempre devuelve un quad saca IoU decente
 *              en todos los demás fixtures y falla solo en éste.
 *
 * GROUND TRUTH
 * ------------
 * Coordenadas normalizadas 0..1 sobre la imagen original, en orden
 * topLeft, topRight, bottomRight, bottomLeft, siguiendo el PERÍMETRO
 * FÍSICO DEL PAPEL — nunca una tabla o un recuadro impreso adentro.
 * Anotadas a mano sobre la imagen con una rejilla de décimos.
 *
 * DE DÓNDE SALE LA IMAGEN
 * -----------------------
 * - `url`        se descarga y se cachea (fixtures públicos de referencia).
 * - `local: true` el archivo vive en `scanner/fixtures/fotos/`. Son las
 *                tomas reales del dispositivo, sacadas con el botón
 *                "Compartir fixture" del panel de diagnóstico: el frame
 *                EXACTO que recibió el detector, no una captura de pantalla.
 * - `derivadoDe` se construye a partir de otro fixture ya resuelto.
 *
 * CASOS ABIERTOS (`abierto: true`)
 * --------------------------------
 * Un fixture puede describir un caso que HOY el producto no resuelve. Se
 * registra igual y se mide igual, pero no tumba el CI: sirve para ver si
 * un cambio lo mejora o lo empeora. Marcar rojo algo que ya se sabe roto
 * solo entrena al equipo a ignorar el rojo. Cuando el caso se resuelva se
 * le quita la marca y pasa a ser prueba de regresión de verdad.
 *
 * PENDIENTE: el plan pide 20 fixtures. Van 3 reales + 1 sintético. Cada
 * foto nueva que se agregue aquí (con su ground truth) vale más que
 * cualquier ajuste de umbral hecho a ojo.
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
  {
    id: 'granito-centrado',
    tipo: 'escena',
    local: true,
    archivo: 'granito-centrado.jpg',
    descripcion:
      'Hoja de texto sobre barra de granito claro, encuadre amplio (0.5x), ' +
      'perspectiva fuerte desde arriba. Toma real de iPhone/Safari, ' +
      '2026-08-14. Es el caso de superficie clara que se venía describiendo ' +
      'sin poder medir. Diagnóstico del dispositivo en granito-centrado.json.',
    // Anotado a mano sobre rejilla de centésimos, siguiendo el perímetro
    // físico del papel.
    groundTruth: [
      { x: 0.366, y: 0.303 },
      { x: 0.635, y: 0.306 },
      { x: 0.697, y: 0.556 },
      { x: 0.293, y: 0.554 },
    ],
    minIoU: 0.85,
    // ABIERTO: DocQuad acierta (IoU 0.982 contra este ground truth) pero
    // OpenCV se traga la barra entera (área 0.744), los dos no concuerdan
    // (acuerdo 0.111) y el compuesto degrada a `parcial` → contorno blanco,
    // sin recorte automático. Esa degradación es la conducta correcta
    // mientras no haya evidencia para confiar; lo que falta es la evidencia.
    // Es justo el caso que el intento revertido del 2026-08-13 quiso forzar
    // a `confiable` a ojo, con quads malos como resultado.
    abierto: true,
    notaAbierto:
      'DocQuad acierta y OpenCV falla; el compuesto no puede distinguirlo ' +
      'todavía sin más tomas de superficie clara.',
  },
  {
    id: 'granito-de-lado',
    tipo: 'escena',
    local: true,
    archivo: 'granito-de-lado.jpg',
    descripcion:
      'La misma barra de granito con la hoja girada ~20° y más inclinada, ' +
      'con la esquina superior levantada. Toma real de iPhone/Safari, ' +
      '2026-08-14. Diagnóstico del dispositivo en granito-de-lado.json.',
    // Anotado con el perímetro del papel medido sobre la propia imagen
    // (componente blanca conexa → casco convexo → cuadrilátero de área
    // máxima), no a ojo: en esta toma la hoja está girada y la rejilla de
    // décimos no daba para colocar las esquinas con confianza.
    groundTruth: [
      { x: 0.411, y: 0.285 },
      { x: 0.68, y: 0.376 },
      { x: 0.814, y: 0.71 },
      { x: 0.47, y: 0.775 },
    ],
    minIoU: 0.85,
    // ABIERTO por lo mismo que `granito-centrado`: DocQuad queda en IoU
    // 0.894 (se pasa en la esquina superior derecha) mientras OpenCV vuelve
    // a tragarse la barra (área 0.867), acuerdo 0.160 → parcial.
    abierto: true,
    notaAbierto:
      'Segunda confirmación del patrón de superficie clara: DocQuad ' +
      'aceptable, OpenCV se traga la barra, el compuesto degrada a parcial.',
  },
  {
    id: 'granito-vacio',
    tipo: 'vacio',
    local: true,
    archivo: 'granito-vacio.jpg',
    descripcion:
      'La misma barra de granito SIN documento encima. Toma real de ' +
      'iPhone/Safari, 2026-08-14. La respuesta correcta es no detectar ' +
      'nada. Diagnóstico del dispositivo en granito-vacio.json.',
    // Sin groundTruth: no hay documento que encerrar.
    abierto: true,
    notaAbierto:
      'Los dos detectores inventan: OpenCV devuelve la barra (área 0.765) ' +
      'y DocQuad un quad de 0.02. El producto no recorta (parcial), pero ' +
      'igual dibuja un contorno donde no hay nada.',
  },
  {
    id: 'escritorio-cuaderno',
    tipo: 'escena',
    local: true,
    archivo: 'escritorio-cuaderno.jpg',
    descripcion:
      'Libreta abierta sobre escritorio de madera/piel naranja, luz de ' +
      'oficina, sombra parcial de mano y torso sobre el papel. Toma real ' +
      'de iPhone/Safari, 2026-08-18. No es un caso difícil —los dos ' +
      'detectores concuerdan (acuerdo 0.984)— pero es una escena nueva del ' +
      'dispositivo y sirve como caso de éxito ordinario en el banco.',
    groundTruth: [
      { x: 0.375, y: 0.32 },
      { x: 0.742, y: 0.319 },
      { x: 0.756, y: 0.573 },
      { x: 0.278, y: 0.576 },
    ],
    minIoU: 0.85,
  },
];

module.exports = { FIXTURES };
