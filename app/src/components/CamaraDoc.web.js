import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View } from 'react-native';
import { AJUSTE_PREVIEW } from '../lib/preview';

// Todo va como `ideal` a propósito: `exact` lanza OverconstrainedError y nos
// deja sin cámara si el dispositivo no puede cumplir, mientras que `ideal`
// siempre negocia lo más cercano.
//
// 4:3 y no 16:9: el sensor de un teléfono es 4:3, así que pedir 16:9 hace
// que el propio navegador recorte arriba y abajo antes de entregarnos nada.
const BASE_VIDEO = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 4032 },
  height: { ideal: 3024 },
  aspectRatio: { ideal: 4 / 3 },
};

const MIN_ANCHO_UTIL = 1280;
const MIN_RATIO_PIXELES_ANGULAR = 0.72;
const ZOOM_ANGULAR_PREFERIDO = 0.6;

function modoCamara() {
  if (typeof window === 'undefined') return 'auto';
  const modo = new URLSearchParams(window.location.search).get('cameraMode');
  return ['primary', 'wide', 'auto'].includes(modo) ? modo : 'auto';
}

function esTrasera(device) {
  const s = `${device?.label || ''}`.toLowerCase();
  return /back|rear|environment|trasera|arrière|rück|后置|背面/.test(s);
}

function esAngular(device) {
  const s = `${device?.label || ''}`.toLowerCase();
  return /ultra[ -]?wide|ultrawide|0\.5|wide angle|grand.?angle/.test(s);
}

function esTele(device) {
  const s = `${device?.label || ''}`.toLowerCase();
  return /tele|2x|3x|5x/.test(s);
}

function puntuarAngular(device) {
  let score = 0;
  if (esTrasera(device)) score += 20;
  if (esAngular(device)) score += 100;
  if (esTele(device)) score -= 100;
  return score;
}

function settingsStream(stream) {
  const track = stream?.getVideoTracks?.()[0];
  const s = track?.getSettings?.() || {};
  const width = Number(s.width) || 0;
  const height = Number(s.height) || 0;
  return {
    label: track?.label || '—',
    width,
    height,
    pixels: width * height,
    frameRate: Number(s.frameRate) || 0,
    zoom: Number.isFinite(Number(s.zoom)) ? Number(s.zoom) : null,
    deviceId: s.deviceId || null,
    facingMode: s.facingMode || null,
  };
}

async function aplicarZoomAngular(stream) {
  try {
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities?.();
    if (!caps?.zoom || !Number.isFinite(caps.zoom.min)) return;
    const max = Number.isFinite(caps.zoom.max) ? caps.zoom.max : Infinity;
    const objetivo = Math.min(max, Math.max(caps.zoom.min, ZOOM_ANGULAR_PREFERIDO));
    await track.applyConstraints({ advanced: [{ zoom: objetivo }] });
  } catch {}
}

async function buscarAngular() {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const candidatas = devices.slice().sort((a, b) => puntuarAngular(b) - puntuarAngular(a));
    return candidatas.find((d) => esTrasera(d) && esAngular(d) && !esTele(d)) || null;
  } catch {
    return null;
  }
}

async function abrirPrincipal() {
  return navigator.mediaDevices.getUserMedia({ audio: false, video: BASE_VIDEO });
}

async function abrirAngular(device) {
  if (!device?.deviceId) return null;
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { ...BASE_VIDEO, deviceId: { exact: device.deviceId } },
  });
}

function angularPasaGate(principal, angular) {
  const p = settingsStream(principal);
  const a = settingsStream(angular);
  if (!a.width || !a.height) return { ok: false, razon: 'ANGULAR_SIN_RESOLUCION' };
  if (a.width < MIN_ANCHO_UTIL) return { ok: false, razon: 'ANGULAR_ANCHO_INSUFICIENTE' };
  if (p.pixels && a.pixels < p.pixels * MIN_RATIO_PIXELES_ANGULAR) {
    return { ok: false, razon: 'ANGULAR_PIERDE_DEMASIADA_RESOLUCION' };
  }
  return { ok: true, razon: 'ANGULAR_APROBADA' };
}

async function abrirStreamCalidadPrimero() {
  const modo = modoCamara();
  const principal = await abrirPrincipal();
  const diag = {
    modo,
    principal: settingsStream(principal),
    angular: null,
    elegido: 'primary',
    razon: modo === 'primary' ? 'FORZADO_PRIMARY' : 'PRIMARY_BASELINE',
  };

  if (modo === 'primary') return { stream: principal, seleccion: diag };

  const deviceAngular = await buscarAngular();
  if (!deviceAngular) {
    diag.razon = 'SIN_ANGULAR_EXPLICITA';
    return { stream: principal, seleccion: diag };
  }

  let angular = null;
  try {
    angular = await abrirAngular(deviceAngular);
    await aplicarZoomAngular(angular);
    diag.angular = settingsStream(angular);
  } catch {
    diag.razon = 'ANGULAR_NO_ABRIO';
    return { stream: principal, seleccion: diag };
  }

  if (modo === 'wide') {
    principal.getTracks().forEach((t) => t.stop());
    diag.elegido = 'wide';
    diag.razon = 'FORZADO_WIDE';
    return { stream: angular, seleccion: diag };
  }

  const gate = angularPasaGate(principal, angular);
  diag.razon = gate.razon;
  if (gate.ok) {
    principal.getTracks().forEach((t) => t.stop());
    diag.elegido = 'wide';
    return { stream: angular, seleccion: diag };
  }

  angular.getTracks().forEach((t) => t.stop());
  return { stream: principal, seleccion: diag };
}

function CamaraDocWeb({ style, onLista, onError }, ref) {
  const contenedor = useRef(null);
  const video = useRef(null);
  const stream = useRef(null);
  const seleccion = useRef(null);

  useEffect(() => {
    const nodo = contenedor.current;
    if (!nodo) return;
    let cancelado = false;
    const el = document.createElement('video');
    el.autoplay = true; el.muted = true; el.playsInline = true;
    el.setAttribute('playsinline', 'true'); el.setAttribute('muted', 'true');
    el.style.width = '100%'; el.style.height = '100%'; el.style.objectFit = AJUSTE_PREVIEW; el.style.display = 'block';
    nodo.appendChild(el); video.current = el;

    abrirStreamCalidadPrimero().then(({ stream: s, seleccion: sel }) => {
      if (cancelado) { s.getTracks().forEach((t) => t.stop()); return; }
      stream.current = s; seleccion.current = sel; el.srcObject = s;
      el.onloadedmetadata = () => {
        el.play().catch(() => {});
        onLista?.({ ancho: el.videoWidth, alto: el.videoHeight, camara: sel });
      };
    }).catch((err) => !cancelado && onError?.(err));

    return () => {
      cancelado = true; stream.current?.getTracks().forEach((t) => t.stop());
      el.srcObject = null; el.remove(); video.current = null; stream.current = null; seleccion.current = null;
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
      return {
        base64, ancho, alto,
        bytes: Math.round((base64.length * 3) / 4), ms: Date.now() - inicio,
        camara: seleccion.current,
      };
    },
    diagnostico() {
      const el = video.current; const track = stream.current?.getVideoTracks?.()[0];
      return {
        navegador: typeof navigator !== 'undefined' ? navigator.userAgent : '—',
        track: track?.getSettings?.() || null,
        capabilities: track?.getCapabilities?.() || null,
        label: track?.label || '—',
        videoWidth: el?.videoWidth || 0,
        videoHeight: el?.videoHeight || 0,
        ajuste: AJUSTE_PREVIEW,
        seleccionCamara: seleccion.current,
      };
    },
  }));

  return <View ref={contenedor} style={[style, { backgroundColor: '#000' }]} />;
}
export default forwardRef(CamaraDocWeb);
