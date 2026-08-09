import { supabase } from './supabase';

const BASE = process.env.EXPO_PUBLIC_API_URL;

// Toda llamada al backend va firmada con el JWT de Supabase.
async function request(ruta, opciones = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const respuesta = await fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
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
  cuenta: () => request('/api/cuenta'),
  codigoWhatsapp: () => request('/api/cuenta/codigo-whatsapp', { method: 'POST' }),
  upgrade: (plan) =>
    request('/api/cuenta/upgrade', { method: 'POST', body: JSON.stringify({ plan }) }),

  documentos: (tipo) => request(`/api/documentos${tipo ? `?tipo=${tipo}` : ''}`),
  escanear: (imagen, mimeType = 'image/jpeg') =>
    request('/api/documentos/escanear', {
      method: 'POST',
      body: JSON.stringify({ imagen, mimeType }),
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
  gastos: () => request('/api/documentos/gastos'),
  borrarDocumento: (id) => request(`/api/documentos/${id}`, { method: 'DELETE' }),

  urlConectarDrive: () => request('/api/drive/conectar'),
  carpetas: () => request('/api/drive/carpetas'),
};
