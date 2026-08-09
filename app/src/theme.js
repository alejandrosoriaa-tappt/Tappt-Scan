/**
 * Dirección de arte de TapptScan.
 *
 * Orden · Seguridad · Inteligencia · Rapidez · Privacidad.
 * Referencia: iOS + Notion + Drive + fintech moderna.
 *
 * Regla que gobierna el resto: los colores de categoría nunca compiten con
 * el verde TapptScan — van en pastel de fondo y saturados solo en el ícono.
 */

export const colores = {
  // Verde TapptScan: CTA, estados activos, indicadores, automatización.
  primario: '#18B875',
  primarioSuave: '#DDF7EA',

  // Superficies premium con profundidad: hero card, tarjeta de gastos.
  oscuro: '#073B4C',
  oscuroProfundo: '#063746',

  fondo: '#F7F9FA',
  superficie: '#FFFFFF',
  texto: '#0D1B2A',
  textoSuave: '#667587',
  divisor: '#E8EDF1',

  exito: '#18B875',
  alerta: '#F59E0B',
  peligro: '#E5484D',

  blanco: '#FFFFFF',
};

// Pastel para el fondo del cuadro, saturado para el trazo del ícono.
export const porSeccion = {
  '01 · Personal': { icono: 'usuario', fondo: '#DDF7EA', trazo: '#0EA47A' },
  '02 · Dinero': { icono: 'dinero', fondo: '#DCF5E7', trazo: '#18B875' },
  '03 · Casa': { icono: 'casa', fondo: '#FFEEDD', trazo: '#F08C2E' },
  '04 · Trabajo': { icono: 'maletin', fondo: '#DDEBFB', trazo: '#2F80ED' },
  '05 · Salud': { icono: 'corazon', fondo: '#FFE4E9', trazo: '#EB5E7C' },
  '06 · Legal': { icono: 'balanza', fondo: '#EAE4FB', trazo: '#7B61D9' },
  '07 · Vehículos': { icono: 'auto', fondo: '#DDE9FF', trazo: '#3B6EF5' },
  '99 · Por revisar': { icono: 'reloj', fondo: '#FFF1D6', trazo: '#E0A32E' },
};

export const porTipo = {
  identificacion: { clave: 'tipoIdentificacion', icono: 'credencial', fondo: '#DDF7EA', trazo: '#0EA47A' },
  recibo: { clave: 'tipoRecibo', icono: 'recibo', fondo: '#DCF5E7', trazo: '#18B875' },
  factura: { clave: 'tipoFactura', icono: 'documento', fondo: '#DDEBFB', trazo: '#2F80ED' },
  contrato: { clave: 'tipoContrato', icono: 'documento', fondo: '#FFEEDD', trazo: '#F08C2E' },
  estado_cuenta: { clave: 'tipoEstadoCuenta', icono: 'banco', fondo: '#EAE4FB', trazo: '#7B61D9' },
  receta: { clave: 'tipoReceta', icono: 'corazon', fondo: '#FFE4E9', trazo: '#EB5E7C' },
  poliza: { clave: 'tipoPoliza', icono: 'escudo', fondo: '#DDF7EA', trazo: '#0EA47A' },
  otro: { clave: 'tipoOtro', icono: 'documento', fondo: '#EEF2F5', trazo: '#667587' },
};

export const porCategoriaGasto = {
  supermercado: { icono: 'carrito', fondo: '#DCF5E7', trazo: '#18B875' },
  restaurantes: { icono: 'cubiertos', fondo: '#FFEEDD', trazo: '#F08C2E' },
  gasolina: { icono: 'gasolina', fondo: '#DDEBFB', trazo: '#2F80ED' },
  transporte: { icono: 'auto', fondo: '#DDE9FF', trazo: '#3B6EF5' },
  servicios: { icono: 'rayo', fondo: '#EAE4FB', trazo: '#7B61D9' },
  salud: { icono: 'corazon', fondo: '#FFE4E9', trazo: '#EB5E7C' },
  hogar: { icono: 'casa', fondo: '#FFEEDD', trazo: '#F08C2E' },
  entretenimiento: { icono: 'estrella', fondo: '#FFE4E9', trazo: '#EB5E7C' },
  ropa: { icono: 'etiqueta', fondo: '#DDF7EA', trazo: '#0EA47A' },
  educacion: { icono: 'documento', fondo: '#DDEBFB', trazo: '#2F80ED' },
  seguros: { icono: 'escudo', fondo: '#DDF7EA', trazo: '#0EA47A' },
  impuestos: { icono: 'banco', fondo: '#EEF2F5', trazo: '#667587' },
  trabajo: { icono: 'maletin', fondo: '#DDEBFB', trazo: '#2F80ED' },
  otros: { icono: 'mas_opciones', fondo: '#EEF2F5', trazo: '#667587' },
};

export const espacio = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// 14–18 px según la dirección de arte.
export const radio = { sm: 10, md: 14, lg: 18, xl: 24, chip: 12 };

/**
 * Escala tipográfica.
 *
 * SF Pro en iOS por herencia del sistema; en Android y web cae a la fuente
 * del sistema, que es lo más cercano sin cargar una familia propia.
 */
export const tipo = {
  titulo: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  tituloChico: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  seccion: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  cuerpo: { fontSize: 15, fontWeight: '400' },
  cuerpoFuerte: { fontSize: 15, fontWeight: '600' },
  secundario: { fontSize: 13, fontWeight: '400' },
  menor: { fontSize: 12, fontWeight: '400' },
  metrica: { fontSize: 26, fontWeight: '700', letterSpacing: -0.6 },
  metricaGrande: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8 },
};

// Sombra muy ligera: la separación la da el espacio, no el borde.
export const sombra = {
  shadowColor: '#0F2332',
  shadowOpacity: 0.06,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
