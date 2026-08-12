import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View } from 'react-native';

/**
 * Cámara para web (navegador de escritorio y móvil).
 *
 * Existe porque `CameraView` de expo-camera NO permite pedir resolución en
 * web: su `getIdealConstraints` nunca recibe width/height, así que siempre
 * cae en `{ video: true }` y el navegador entrega su default (~480p).
 * Medido el 2026-08-13: un escaneo salió de 477×530px contra 1356×1920 del
 * mismo documento en CamScanner — 10× menos píxeles, y ninguna mejora de
 * procesamiento posterior puede recuperar detalle que nunca se capturó.
 *
 * Pidiendo constraints explícitas subimos a lo que el dispositivo dé.
 * Ojo: iOS Safari topa en 720p aunque se pida 4K (limitación conocida de
 * WebKit) y no soporta ImageCapture — ahí 720p es el techo real del
 * navegador. En Android y escritorio sí sube bastante más.
 */
const CONSTRAINTS = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 3840 },
    height: { ideal: 2160 },
  },
};

function CamaraDocWeb({ style, onLista, onError }, ref) {
  const contenedor = useRef(null);
  const video = useRef(null);
  const stream = useRef(null);

  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;

    let cancelado = false;

    const el = document.createElement('video');
    el.autoplay = true;
    el.muted = true;
    // iOS necesita AMBAS formas: la propiedad y el atributo. Sin esto el
    // video se abre en reproductor de pantalla completa en vez de quedarse
    // embebido.
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.setAttribute('muted', 'true');
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.objectFit = 'cover';
    el.style.display = 'block';
    nodo.appendChild(el);
    video.current = el;

    navigator.mediaDevices
      .getUserMedia(CONSTRAINTS)
      .then((s) => {
        if (cancelado) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        el.srcObject = s;
        el.onloadedmetadata = () => {
          el.play().catch(() => {});
          onLista?.({ ancho: el.videoWidth, alto: el.videoHeight });
        };
      })
      .catch((err) => !cancelado && onError?.(err));

    return () => {
      cancelado = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      el.srcObject = null;
      el.remove();
      video.current = null;
      stream.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    /**
     * `maxAncho` reduce el cuadro — se usa para los frames de detección en
     * vivo (chicos = rápidos). La captura final va sin él, a la resolución
     * completa del stream, que es justo lo que estaba faltando.
     */
    async capturar({ calidad = 0.92, maxAncho = null } = {}) {
      const el = video.current;
      if (!el || !el.videoWidth) return null;

      const escala = maxAncho ? Math.min(1, maxAncho / el.videoWidth) : 1;
      const ancho = Math.round(el.videoWidth * escala);
      const alto = Math.round(el.videoHeight * escala);

      const lienzo = document.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      lienzo.getContext('2d', { alpha: false }).drawImage(el, 0, 0, ancho, alto);

      const url = lienzo.toDataURL('image/jpeg', calidad);
      return { base64: url.slice(url.indexOf(',') + 1), ancho, alto };
    },
  }));

  return <View ref={contenedor} style={style} />;
}

export default forwardRef(CamaraDocWeb);
