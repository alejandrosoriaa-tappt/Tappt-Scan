import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * Dibuja un cuadrilátero como cuatro Views rotadas, sin SVG.
 *
 * POR QUÉ NO SVG: el overlay en vivo de la cámara usaba `react-native-svg`
 * con `<Svg style={StyleSheet.absoluteFill}>` y en Safari/iPhone no se
 * pintaba nada, aun cuando el detector devolvía `confiable` con acuerdo de
 * 0.98 entre los dos motores. `RecorteScreen`, en la misma app y el mismo
 * navegador, sí dibujaba su cuadro — y lo hace con Views rotadas, sin SVG.
 *
 * Así que esto no es una preferencia de estilo: es la única técnica que
 * está demostrada en el dispositivo donde se prueba. Al extraerla aquí, las
 * dos pantallas comparten implementación y no puede volver a pasar que una
 * funcione y la otra no.
 *
 * `puntos` van en píxeles de pantalla ya proyectados (ver lib/preview.js),
 * en orden, y se cierra el polígono solo.
 */
export default function ContornoQuad({ puntos, color, grosor = 2 }) {
  if (!puntos || puntos.length !== 4) return null;

  const lados = puntos.map((p1, i) => {
    const p2 = puntos[(i + 1) % puntos.length];
    const largo = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const angulo = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    return { key: i, left: p1.x, top: p1.y, width: largo, angulo };
  });

  // SIN RELLENO, a propósito. Se intentó aproximarlo con la caja que envuelve
  // al quad y en el dispositivo se veía mal: con el documento inclinado esa
  // caja es bastante más grande que el cuadrilátero, así que la mancha
  // sugería una detección distinta —y mayor— de la que en realidad hubo. Un
  // overlay que miente sobre lo que detectó es peor que uno sin relleno, y el
  // benchmark tampoco lo necesita: su quad es una línea fina y limpia.
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {lados.map((lado) => (
        <View
          key={lado.key}
          style={[
            estilos.lado,
            {
              left: lado.left,
              top: lado.top,
              width: lado.width,
              height: grosor,
              backgroundColor: color,
              transform: [{ rotate: `${lado.angulo}deg` }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  lado: {
    position: 'absolute',
    transformOrigin: 'left center',
  },
});
