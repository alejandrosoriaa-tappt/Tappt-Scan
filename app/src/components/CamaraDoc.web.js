import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View } from 'react-native';

/**
 * Cámara para web (navegador de escritorio y móvil).
 *
 * Existe porque `CameraView` de expo-camera NO permite pedir resolución en
 * web: su `getIdealConstraints` nunca recibe width/height, así que siempre
 * cae en `{ video: true }` y el navegador entrega su default (~480p).
 * Medido el 2026-08-12: un escaneo salió de 477×530px contra 1356×1920 del
 * mismo documento en CamScanner — 10× menos píxeles, y ninguna mejora de
 * procesamiento posterior puede recuperar detalle que nunca se capturó.
 *
 * Pidiendo constraints explícitas subimos a lo que el dispositivo dé.
 *
 * Nota sobre el famoso "tope de 720p en iOS Safari": la documentación de
 * WebKit lo sugería, pero **nuestra propia medición lo refutó** — en un
 * iPhone real la captura final salió de 1869×2863 (5.35 MP) el
 * 2026-08-12. No usar esa suposición para tomar decisiones; medir con el
 * panel de diagnóstico (`diagnostico()` más abajo) en cada dispositivo.
 *
 * Pedir `ideal: 3840×2160` NO garantiza recibirlo: el navegador entrega lo
 * que puede. Lo único confiable es `getSettings()` del track ya activo.
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

      const inicio = Date.now();
      const escala = maxAncho ? Math.min(1, maxAncho / el.videoWidth) : 1;
      const ancho = Math.round(el.videoWidth * escala);
      const alto = Math.round(el.videoHeight * escala);

      const lienzo = document.createElement('canvas');
      lienzo.width = ancho;
      lienzo.height = alto;
      lienzo.getContext('2d', { alpha: false }).drawImage(el, 0, 0, ancho, alto);

      const url = lienzo.toDataURL('image/jpeg', calidad);
      const base64 = url.slice(url.indexOf(',') + 1);

      return {
        base64,
        ancho,
        alto,
        // Diagnóstico: base64 infla ~4/3 sobre los bytes reales.
        bytes: Math.round((base64.length * 3) / 4),
        ms: Date.now() - inicio,
      };
    },

    /**
     * Telemetría real de la cámara, para cerrar el Paso 0 con evidencia en
     * vez de suposición.
     *
     * `getSettings()` del track es la única fuente confiable: lo que se
     * PIDE en las constraints no es lo que se RECIBE, y WebKit tiene casos
     * documentados donde las mismas constraints dan resultados distintos
     * según el estado u orientación del stream.
     */
    diagnostico() {
      const el = video.current;
      const track = stream.current?.getVideoTracks?.()[0];
      return {
        navegador: typeof navigator !== 'undefined' ? navigator.userAgent : '—',
        track: track?.getSettings?.() || null,
        videoWidth: el?.videoWidth || 0,
        videoHeight: el?.videoHeight || 0,
      };
    },
  }));

  return <View ref={contenedor} style={style} />;
}

export default forwardRef(CamaraDocWeb);
