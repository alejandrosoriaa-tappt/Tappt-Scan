import { leerToken } from './sesion';

const BASE = process.env.EXPO_PUBLIC_API_URL;

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
  escanear: (imagen, mimeType = 'image/jpeg', esquinas = null) =>
    request('/api/documentos/escanear', {
      method: 'POST',
      body: JSON.stringify({ imagen, mimeType, esquinas }),
    }),
  detectarBordes: (imagen) =>
    request('/api/documentos/detectar-bordes', {
      method: 'POST',
      body: JSON.stringify({ imagen }),
    }),
  importar: (archivo, mimeType, nombre) =>
    request('/api/documentos/importar', {
      method: 'POST',
      body: JSON.stringify({ archivo, mimeType, nombre }),
    }),
  pagina: (id, n = 0) => request(`/api/documentos/${id}/pagina/${n}`),
  editar: (id, anotaciones) =>
    request(`/api/documentos/${id}/editar`, {
      method: 'POST',
      body: JSON.stringify({ anotaciones }),
    }),
  gastos: (mes) => request(`/api/documentos/gastos${mes ? `?mes=${mes}` : ''}`),
  resumen: () => request('/api/documentos/resumen'),
  borrarDocumento: (id) => request(`/api/documentos/${id}`, { method: 'DELETE' }),

  urlConectarDrive: () => request('/api/drive/conectar'),
  usoDrive: () => request('/api/drive/uso'),
  carpetas: (carpeta) =>
    request(`/api/drive/carpetas${carpeta ? `?carpeta=${carpeta}` : ''}`),
};
