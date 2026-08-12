import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { CameraView } from 'expo-camera';

/**
 * Cámara para iOS y Android. En nativo `expo-camera` ya entrega la
 * resolución del sensor, así que aquí no hay que pelear con constraints
 * como en la versión web (ver `CamaraDoc.web.js`).
 *
 * Misma API que la web para que `EscanearScreen` sea un solo archivo y el
 * look and feel quede idéntico en las cuatro superficies.
 */
function CamaraDocNativa({ style, onLista }, ref) {
  const camara = useRef(null);

  useImperativeHandle(ref, () => ({
    async capturar({ calidad = 0.92, rapido = false } = {}) {
      if (!camara.current) return null;

      const foto = await camara.current.takePictureAsync({
        quality: calidad,
        base64: true,
        // Solo para los frames de detección en vivo: se salta el
        // procesamiento (orientación, etc.) a cambio de velocidad. La
        // captura final SÍ lo necesita, o la foto puede quedar girada.
        skipProcessing: rapido,
      });

      return { base64: foto.base64, ancho: foto.width, alto: foto.height };
    },
  }));

  return (
    <CameraView
      ref={camara}
      style={style}
      facing="back"
      onCameraReady={() => onLista?.()}
    />
  );
}

export default forwardRef(CamaraDocNativa);
