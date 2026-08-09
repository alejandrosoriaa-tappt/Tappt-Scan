export const colores = {
  primario: '#0F766E',
  primarioSuave: '#CCFBF1',
  fondo: '#F8FAFC',
  superficie: '#FFFFFF',
  borde: '#E2E8F0',
  texto: '#0F172A',
  textoSuave: '#64748B',
  acento: '#F59E0B',
  peligro: '#DC2626',
};

// Cada tipo de documento tiene su color e ícono para que la lista se lea
// de un vistazo.
export const porTipo = {
  identificacion: { etiqueta: 'Identificación', icono: '🪪', color: '#6366F1', carpeta: 'Identificaciones' },
  recibo: { etiqueta: 'Recibo', icono: '🧾', color: '#0F766E', carpeta: 'Recibos' },
  contrato: { etiqueta: 'Contrato', icono: '📄', color: '#B45309', carpeta: 'Contratos' },
  otro: { etiqueta: 'Otro', icono: '🗂️', color: '#64748B', carpeta: 'Otros' },
};

export const espacio = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
