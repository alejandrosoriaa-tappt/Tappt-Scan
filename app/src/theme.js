/**
 * Dirección de arte de TapptScan.
 *
 * Dark-first, benchmark CamScanner. Tokens tomados tal cual del brief
 * ejecutivo de producto (docs/DIRECCION-DISENO.md) — no inventar matices
 * nuevos sin actualizar ese documento primero.
 *
 * Regla que gobierna el resto: los colores de categoría nunca compiten con
 * el verde TapptScan — van en superficie oscura translúcida de fondo y
 * saturados solo en el ícono.
 */

// Mezcla un hex con alfa (dos dígitos hex, "00"-"ff") para las superficies
// de categoría: mismo trazo saturado de siempre, pero como velo translúcido
// sobre fondo oscuro en vez de pastel sólido sobre fondo claro.
function conAlfa(hex, alfa) {
  return `${hex}${alfa}`;
}

export const colores = {
  // Verde TapptScan: CTA, estados activos, indicadores, automatización.
  primario: '#18B875',
  primarioPresionado: '#12A56A',
  primarioClaro: '#37D392',
  primarioSuave: conAlfa('#18B875', '26'), // ~15% — chips y fondos suaves sobre dark

  // Superficies premium con profundidad: hero card, tarjeta de gastos.
  oscuro: '#073B4C',
  oscuroProfundo: '#063746',

  fondo: '#0F1720',
  superficie: '#151B24',
  superficieElevada: '#1D2430',
  texto: '#F5F7FA',
  textoSuave: '#B6C0CC',
  textoTerciario: '#7F8A98',
  divisor: '#2A3342',

  exito: '#22C55E',
  alerta: '#F59E0B',
  peligro: '#EF4444',
  info: '#3B82F6',

  blanco: '#FFFFFF',
};

// Superficie translúcida del trazo (fondo) + trazo saturado del ícono —
// mismo par de siempre, adaptado a dark.
export const porSeccion = {
  '01 · Personal': { icono: 'usuario', fondo: conAlfa('#2DD4A0', '20'), trazo: '#2DD4A0' },
  '02 · Dinero': { icono: 'dinero', fondo: conAlfa('#18B875', '20'), trazo: '#18B875' },
  '03 · Casa': { icono: 'casa', fondo: conAlfa('#F08C2E', '20'), trazo: '#F5A34F' },
  '04 · Trabajo': { icono: 'maletin', fondo: conAlfa('#3B82F6', '20'), trazo: '#5B9BFA' },
  '05 · Salud': { icono: 'corazon', fondo: conAlfa('#EB5E7C', '20'), trazo: '#F17E96' },
  '06 · Legal': { icono: 'balanza', fondo: conAlfa('#7B61D9', '20'), trazo: '#9683E3' },
  '07 · Vehículos': { icono: 'auto', fondo: conAlfa('#3B6EF5', '20'), trazo: '#6289F7' },
  '99 · Por revisar': { icono: 'reloj', fondo: conAlfa('#F59E0B', '20'), trazo: '#F5B23D' },
};

export const porTipo = {
  identificacion: { clave: 'tipoIdentificacion', icono: 'credencial', fondo: conAlfa('#2DD4A0', '20'), trazo: '#2DD4A0' },
  recibo: { clave: 'tipoRecibo', icono: 'recibo', fondo: conAlfa('#18B875', '20'), trazo: '#18B875' },
  factura: { clave: 'tipoFactura', icono: 'documento', fondo: conAlfa('#3B82F6', '20'), trazo: '#5B9BFA' },
  contrato: { clave: 'tipoContrato', icono: 'documento', fondo: conAlfa('#F08C2E', '20'), trazo: '#F5A34F' },
  estado_cuenta: { clave: 'tipoEstadoCuenta', icono: 'banco', fondo: conAlfa('#7B61D9', '20'), trazo: '#9683E3' },
  receta: { clave: 'tipoReceta', icono: 'corazon', fondo: conAlfa('#EB5E7C', '20'), trazo: '#F17E96' },
  poliza: { clave: 'tipoPoliza', icono: 'escudo', fondo: conAlfa('#2DD4A0', '20'), trazo: '#2DD4A0' },
  otro: { clave: 'tipoOtro', icono: 'documento', fondo: conAlfa('#B6C0CC', '18'), trazo: '#B6C0CC' },
};

export const porCategoriaGasto = {
  supermercado: { icono: 'carrito', fondo: conAlfa('#18B875', '20'), trazo: '#18B875' },
  restaurantes: { icono: 'cubiertos', fondo: conAlfa('#F08C2E', '20'), trazo: '#F5A34F' },
  gasolina: { icono: 'gasolina', fondo: conAlfa('#3B82F6', '20'), trazo: '#5B9BFA' },
  transporte: { icono: 'auto', fondo: conAlfa('#3B6EF5', '20'), trazo: '#6289F7' },
  servicios: { icono: 'rayo', fondo: conAlfa('#7B61D9', '20'), trazo: '#9683E3' },
  salud: { icono: 'corazon', fondo: conAlfa('#EB5E7C', '20'), trazo: '#F17E96' },
  hogar: { icono: 'casa', fondo: conAlfa('#F08C2E', '20'), trazo: '#F5A34F' },
  entretenimiento: { icono: 'estrella', fondo: conAlfa('#EB5E7C', '20'), trazo: '#F17E96' },
  ropa: { icono: 'etiqueta', fondo: conAlfa('#2DD4A0', '20'), trazo: '#2DD4A0' },
  educacion: { icono: 'documento', fondo: conAlfa('#3B82F6', '20'), trazo: '#5B9BFA' },
  seguros: { icono: 'escudo', fondo: conAlfa('#2DD4A0', '20'), trazo: '#2DD4A0' },
  impuestos: { icono: 'banco', fondo: conAlfa('#B6C0CC', '18'), trazo: '#B6C0CC' },
  trabajo: { icono: 'maletin', fondo: conAlfa('#3B82F6', '20'), trazo: '#5B9BFA' },
  otros: { icono: 'mas_opciones', fondo: conAlfa('#B6C0CC', '18'), trazo: '#B6C0CC' },
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

// Sobre fondo oscuro la sombra casi no se ve — la separación real la da el
// contraste entre `superficie` y `superficieElevada`, no la sombra. Se deja
// muy tenue solo para no perder algo de profundidad en iOS nativo.
export const sombra = {
  shadowColor: '#000000',
  shadowOpacity: 0.35,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};
