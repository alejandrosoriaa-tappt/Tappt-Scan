import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View } from 'react-native';
import { AJUSTE_PREVIEW } from '../lib/preview';

// Todo va como `ideal` a propósito: `exact` lanza OverconstrainedError y nos
// deja sin cámara si el dispositivo no puede cumplir, mientras que `ideal`
// siempre negocia lo más cercano.
//
// 4:3 y no 16:9: el sensor de un teléfono es 4:3, así que pedir 16:9 hace
// que el propio navegador recorte arriba y abajo antes de entregarnos nada.
// Ese recorte es campo visual perdido que ya nunca se recupera — se ve como
// zoom-in aunque estemos en la cámara más angular.
const BASE_VIDEO = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 4032 },
  height: { ideal: 3024 },
  aspectRatio: { ideal: 4 / 3 },
};

function esTrasera(device) {
  const s = `${device?.label || ''}`.toLowerCase();
  return /back|rear|environment|trasera|arrière|rück|后置|背面/.test(s);
}

function puntuarAngular(device) {
  const s = `${device?.label || ''}`.toLowerCase();
  let score = 0;
  if (esTrasera(device)) score += 20;
  if (/ultra[ -]?wide|ultrawide|0\.5|wide angle|grand.?angle/.test(s)) score += 100;
  if (/tele|zoom|2x|3x|5x/.test(s)) score -= 100;
  return score;
}

async function constraintsMasAbiertas() {
  // Después de conceder permiso, iOS/Chrome puede exponer labels útiles.
  // Si aparece una ultra-wide, la pedimos explícitamente. Si el navegador
  // oculta labels/dispositivos, caemos al environment estándar.
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const candidatas = devices.slice().sort((a, b) => puntuarAngular(b) - puntuarAngular(a));
    const mejor = candidatas.find((d) => puntuarAngular(d) > 20);
    if (mejor?.deviceId) {
      return { audio: false, video: { ...BASE_VIDEO, deviceId: { exact: mejor.deviceId } } };
    }
  } catch {}
  return { audio: false, video: BASE_VIDEO };
}

async function abrirStreamMasAbierto() {
  // Primer permiso con environment. Luego, ya con labels disponibles,
  // intentamos reabrir con la cámara físicamente más angular.
  const inicial = await navigator.mediaDevices.getUserMedia({ audio: false, video: BASE_VIDEO });
  let elegido = inicial;
  try {
    const c = await constraintsMasAbiertas();
    if (c.video.deviceId) {
      const segundo = await navigator.mediaDevices.getUserMedia(c);
      inicial.getTracks().forEach((t) => t.stop());
      elegido = segundo;
    }
  } catch {}

  // Si el track ofrece zoom continuo, usar siempre su mínimo físico. Esto no
  // inventa zoom digital hacia afuera: sólo evita que el navegador arranque
  // accidentalmente acercado.
  try {
    const track = elegido.getVideoTracks()[0];
    const caps = track.getCapabilities?.();
    if (caps?.zoom && Number.isFinite(caps.zoom.min)) {
      await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
    }
  } catch {}
  return elegido;
}

function CamaraDocWeb({ style, onLista, onError }, ref) {
  const contenedor = useRef(null);
  const video = useRef(null);
  const stream = useRef(null);

  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    let cancelado = false;
    const el = document.createElement('video');
    el.autoplay = true; el.muted = true; el.playsInline = true;
    el.setAttribute('playsinline', 'true'); el.setAttribute('muted', 'true');
    // `objectFit` sale de lib/preview.js, que es también quien proyecta el
    // polígono. Con 'cover' el navegador recortaba el cuadro para tapar la
    // pantalla: en vertical eso se come los costados del sensor y el visor
    // se siente cerrado por más ultra-wide que se haya conseguido.
    el.style.width = '100%'; el.style.height = '100%'; el.style.objectFit = AJUSTE_PREVIEW; el.style.display = 'block';
    nodo.appendChild(el); video.current = el;

    abrirStreamMasAbierto().then((s) => {
      if (cancelado) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s; el.srcObject = s;
      el.onloadedmetadata = () => { el.play().catch(() => {}); onLista?.({ ancho: el.videoWidth, alto: el.videoHeight }); };
    }).catch((err) => !cancelado && onError?.(err));

    return () => {
      cancelado = true; stream.current?.getTracks().forEach((t) => t.stop());
      el.srcObject = null; el.remove(); video.current = null; stream.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    async capturar({ calidad = 0.92, maxAncho = null } = {}) {
      const el = video.current; if (!el || !el.videoWidth) return null;
      const inicio = Date.now();
      const escala = maxAncho ? Math.min(1, maxAncho / el.videoWidth) : 1;
      const ancho = Math.round(el.videoWidth * escala); const alto = Math.round(el.videoHeight * escala);
      const lienzo = document.createElement('canvas'); lienzo.width = ancho; lienzo.height = alto;
      lienzo.getContext('2d', { alpha: false }).drawImage(el, 0, 0, ancho, alto);
      const url = lienzo.toDataURL('image/jpeg', calidad); const base64 = url.slice(url.indexOf(',') + 1);
      return { base64, ancho, alto, bytes: Math.round((base64.length * 3) / 4), ms: Date.now() - inicio };
    },
    diagnostico() {
      const el = video.current; const track = stream.current?.getVideoTracks?.()[0];
      return {
        navegador: typeof navigator !== 'undefined' ? navigator.userAgent : '—',
        track: track?.getSettings?.() || null,
        capabilities: track?.getCapabilities?.() || null,
        label: track?.label || '—',
        videoWidth: el?.videoWidth || 0, videoHeight: el?.videoHeight || 0,
        ajuste: AJUSTE_PREVIEW,
      };
    },
  }));

  // Fondo negro: con `contain` quedan bandas donde el video no llega, y sin
  // esto se verían del color de la pantalla de atrás.
  return <View ref={contenedor} style={[style, { backgroundColor: '#000' }]} />;
}
export default forwardRef(CamaraDocWeb);
