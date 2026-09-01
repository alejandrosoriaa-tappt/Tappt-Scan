import React from 'react';
import { Platform, View, StyleSheet } from 'react-native';

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
export default function ContornoQuad({ puntos, color, relleno = 'rgba(24,184,117,0.18)', grosor = 2 }) {
  if (!puntos || puntos.length !== 4) return null;

  const lados = puntos.map((p1, i) => {
    const p2 = puntos[(i + 1) % puntos.length];
    const largo = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const angulo = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    return { key: i, left: p1.x, top: p1.y, width: largo, angulo };
  });

  // En web usamos clip-path para que el velo cubra el cuadrilátero exacto,
  // no la caja rectangular que lo envuelve. Así la transparencia sigue las
  // cuatro esquinas aun cuando el documento esté inclinado. El contorno con
  // Views se conserva porque es la implementación comprobada en Safari/iPhone.
  const recorte = Platform.OS === 'web'
    ? `polygon(${puntos.map((p) => `${p.x}px ${p.y}px`).join(', ')})`
    : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {recorte ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: relleno, clipPath: recorte },
          ]}
        />
      ) : null}
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
