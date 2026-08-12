import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { CameraView } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Cámara para iOS y Android. En nativo `expo-camera` ya entrega la
 * resolución del sensor, así que aquí no hay que pelear con constraints
 * como en la versión web (ver `CamaraDoc.web.js`).
 *
 * Misma API que la web para que `EscanearScreen` sea un solo archivo y el
 * look and feel quede idéntico en las cuatro superficies.
 */
function CamaraDocNativa({ style, onLista, onError }, ref) {
  const camara = useRef(null);

  useImperativeHandle(ref, () => ({
    /**
     * `maxAncho` reduce el cuadro — se usa para los frames de detección en
     * vivo. `takePictureAsync` no sabe redimensionar, así que la reducción
     * va después con `expo-image-manipulator`.
     *
     * Sin esto (bug del 2026-08-12), el parámetro se ignoraba en silencio y
     * el teléfono tomaba y convertía a base64 una foto de sensor completo
     * cada 1.4s solo para detectar bordes: memoria, batería y una cadena
     * base64 enorme viajando al detector en cada ciclo.
     */
    async capturar({ calidad = 0.92, maxAncho = null } = {}) {
      if (!camara.current) return null;

      const foto = await camara.current.takePictureAsync({
        quality: calidad,
        // Solo se pide base64 aquí si NO vamos a redimensionar; si hay que
        // reducir, el base64 sale del resultado ya reducido y codificarlo
        // dos veces sería puro desperdicio.
        base64: !maxAncho,
        // NO usar `skipProcessing: true`. Ahorra tiempo pero deja la
        // orientación indefinida (puede salir a 90/180/270° según el
        // dispositivo), mientras que la captura final sí viene rotada a la
        // orientación real. Como las esquinas detectadas en vivo se
        // reutilizan sobre la foto final, esa diferencia haría que el
        // recorte se aplicara en un espacio de coordenadas distinto al que
        // el usuario vio en pantalla. Ambas capturas deben vivir en el
        // mismo espacio.
        skipProcessing: false,
      });

      if (!maxAncho || foto.width <= maxAncho) {
        return { base64: foto.base64, ancho: foto.width, alto: foto.height };
      }

      // Ojo con la escala: `compress` de expo-image-manipulator va de 0 a 1,
      // al revés que `@napi-rs/canvas` en el backend, que la espera de 0 a
      // 100 (ver services/imagen.js).
      const reducida = await ImageManipulator.manipulateAsync(
        foto.uri,
        [{ resize: { width: maxAncho } }],
        { compress: calidad, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      return { base64: reducida.base64, ancho: reducida.width, alto: reducida.height };
    },
  }));

  return (
    <CameraView
      ref={camara}
      style={style}
      facing="back"
      onCameraReady={() => onLista?.()}
      // Sin esto, si el preview nativo no arranca la pantalla se queda en
      // negro sin explicación — en web ese caso sí mostraba la UI de error.
      onMountError={(e) => onError?.(e)}
    />
  );
}

export default forwardRef(CamaraDocNativa);
