import { leerToken } from './sesion';

const BASE = process.env.EXPO_PUBLIC_API_URL;

function scannerDebugActivo() {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('scannerDebug') === '1';
  } catch {
    return false;
  }
}

function base64ABlob(base64, tipo = 'image/jpeg') {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

async function compartirFixtureScanner() {
  const fixture = typeof window !== 'undefined' ? window.__tapptscanFixture : null;
  if (!fixture?.imagen) return;

  const sello = fixture.fecha.replace(/[:.]/g, '-');
  const imagenBlob = base64ABlob(fixture.imagen);
  const jsonBlob = new Blob(
    [
      JSON.stringify(
        {
          fecha: fixture.fecha,
          resultado: fixture.resultado,
        },
        null,
        2
      ),
    ],
    { type: 'application/json' }
  );

  const imagenFile = new File([imagenBlob], `tapptscan-fixture-${sello}.jpg`, {
    type: 'image/jpeg',
  });
  const jsonFile = new File([jsonBlob], `tapptscan-fixture-${sello}.json`, {
    type: 'application/json',
  });

  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [imagenFile, jsonFile] }))) {
    await navigator.share({
      title: 'TapptScan scanner fixture',
      text: 'Frame exacto enviado al detector + diagnostico JSON',
      files: [imagenFile, jsonFile],
    });
    return;
  }

  for (const archivo of [imagenFile, jsonFile]) {
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = archivo.name;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

function guardarFixtureScanner(imagen, resultado) {
  if (!scannerDebugActivo() || typeof document === 'undefined') return;

  window.__tapptscanFixture = {
    fecha: new Date().toISOString(),
    imagen,
    resultado,
  };

  let boton = document.getElementById('tapptscan-scanner-fixture');
  if (boton) return;

  boton = document.createElement('button');
  boton.id = 'tapptscan-scanner-fixture';
  boton.type = 'button';
  boton.textContent = 'Compartir fixture';
  boton.style.position = 'fixed';
  boton.style.left = '16px';
  boton.style.bottom = '150px';
  boton.style.zIndex = '2147483647';
  boton.style.border = '1px solid rgba(124,245,192,.8)';
  boton.style.borderRadius = '999px';
  boton.style.padding = '10px 14px';
  boton.style.background = 'rgba(0,0,0,.82)';
  boton.style.color = '#7CF5C0';
  boton.style.font = '600 12px -apple-system, BlinkMacSystemFont, sans-serif';
  boton.style.boxShadow = '0 2px 12px rgba(0,0,0,.25)';
  boton.addEventListener('click', () => {
    compartirFixtureScanner().catch((err) => {
      console.error('[scanner-debug] no se pudo compartir fixture', err);
      alert(`No se pudo compartir fixture: ${err?.message || err}`);
    });
  });
  document.body.appendChild(boton);
}

// Toda llamada al backend va firmada con el token de TapptScan.
async function request(ruta, opciones = {}) {
  const token = await leerToken();

  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opciones.headers,
    },
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.json().catch(() => ({}));
    throw new Error(detalle.error || `error_${respuesta.status}`);
  }

  return respuesta.json();
}

export const api = {
  // Acceso: la app pide un código y espera a que el usuario lo mande por
  // WhatsApp. Ninguno de estos dos lleva token todavía.
  iniciarSesion: () => request('/api/auth/iniciar', { method: 'POST' }),
  estadoSesion: (codigo) => request(`/api/auth/estado/${codigo}`),

  cuenta: () => request('/api/cuenta'),
  preferencias: (cambios) =>
    request('/api/cuenta/preferencias', { method: 'PUT', body: JSON.stringify(cambios) }),
  upgrade: (plan) =>
    request('/api/cuenta/upgrade', { method: 'POST', body: JSON.stringify({ plan }) }),

  documentos: (tipo) => request(`/api/documentos${tipo ? `?tipo=${tipo}` : ''}`),
  escanear: (imagen, mimeType = 'image/jpeg', esquinas = null, filtro = null) =>
    request('/api/documentos/escanear', {
      method: 'POST',
      body: JSON.stringify({ imagen, mimeType, esquinas, filtro }),
    }),
  vistaFiltro: (imagen, filtro) =>
    request('/api/documentos/vista-filtro', {
      method: 'POST',
      body: JSON.stringify({ imagen, filtro }),
    }),
  detectarBordes: async (imagen) => {
    const resultado = await request('/api/documentos/detectar-bordes', {
      method: 'POST',
      body: JSON.stringify({ imagen }),
    });
    guardarFixtureScanner(imagen, resultado);
    return resultado;
  },
  firmaDesdeFoto: (imagen, color) =>
    request('/api/documentos/firma-desde-foto', {
      method: 'POST',
      body: JSON.stringify({ imagen, color }),
    }),
  importar: (archivo, mimeType, nombre) =>
    request('/api/documentos/importar', {
      method: 'POST',
      body: JSON.stringify({ archivo, mimeType, nombre }),
    }),
  favorito: (id, favorito) =>
    request(`/api/documentos/${id}/favorito`, {
      method: 'PUT',
      body: JSON.stringify({ favorito }),
    }),
  pagina: (id, n = 0) => request(`/api/documentos/${id}/pagina/${n}`),
  editar: (id, anotaciones) =>
    request(`/api/documentos/${id}/editar`, {
      method: 'POST',
      body: JSON.stringify({ anotaciones }),
    }),
  versiones: (id) => request(`/api/documentos/${id}/versiones`),
  eliminarPaginas: (id, paginas) =>
    request(`/api/documentos/${id}/paginas/eliminar`, {
      method: 'POST',
      body: JSON.stringify({ paginas }),
    }),
  compartirPaginas: (id, paginas) =>
    request(`/api/documentos/${id}/paginas/compartir`, {
      method: 'POST',
      body: JSON.stringify({ paginas }),
    }),
  gastos: (mes) => request(`/api/documentos/gastos${mes ? `?mes=${mes}` : ''}`),
  resumen: () => request('/api/documentos/resumen'),
  borrarDocumento: (id) => request(`/api/documentos/${id}`, { method: 'DELETE' }),

  verificarCompraIAP: (body) =>
    request('/api/pagos/iap/verificar', { method: 'POST', body: JSON.stringify(body) }),

  urlConectarDrive: () => request('/api/drive/conectar'),
  usoDrive: () => request('/api/drive/uso'),
  carpetas: (carpeta) =>
    request(`/api/drive/carpetas${carpeta ? `?carpeta=${carpeta}` : ''}`),

  firmas: () => request('/api/firmas'),
  guardarFirma: (datos, color) =>
    request('/api/firmas', { method: 'POST', body: JSON.stringify({ datos, color }) }),
  borrarFirma: (id) => request(`/api/firmas/${id}`, { method: 'DELETE' }),
};
