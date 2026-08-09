import React from 'react';
import { View } from 'react-native';
import Svg, { Path, Circle, Rect, Line, Polyline } from 'react-native-svg';
import { colores } from '../theme';

/**
 * Set de iconos propio, estilo outline geométrico (referencia: SF Symbols y
 * Lucide). Se dibujan a mano en vez de traer una librería de iconos porque
 * son pocos y así el trazo queda consistente en todos.
 *
 * Reglas del set: lienzo 24×24, solo trazo (nunca relleno), extremos y
 * uniones redondeados, y un único `strokeWidth` para todo.
 */

const TRAZO = 1.8;

const FORMAS = {
  // --- Navegación ---
  inicio: (p) => (
    <>
      <Path d="M3 10.5 12 3l9 7.5" {...p} />
      <Path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" {...p} />
    </>
  ),
  documento: (p) => (
    <>
      <Path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5z" {...p} />
      <Path d="M14 3v4.5h4.5" {...p} />
    </>
  ),
  mas: (p) => (
    <>
      <Line x1="12" y1="5" x2="12" y2="19" {...p} />
      <Line x1="5" y1="12" x2="19" y2="12" {...p} />
    </>
  ),
  dinero: (p) => (
    <>
      <Line x1="12" y1="3" x2="12" y2="21" {...p} />
      <Path d="M16 7.5A3 3 0 0 0 13 5.5h-2a2.75 2.75 0 0 0 0 5.5h2a2.75 2.75 0 0 1 0 5.5H10.5A3 3 0 0 1 7.5 14.5" {...p} />
    </>
  ),
  carpeta: (p) => (
    <Path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z" {...p} />
  ),

  // --- Acciones de entrada ---
  whatsapp: (p) => (
    <>
      <Path d="M3.5 20.5l1.3-4.2A8.2 8.2 0 1 1 8 19.4z" {...p} />
      <Path d="M9 9.2c.2 1.6 1.2 3 2.6 3.9.6.4 1.4.6 2.1.7l.6-1.3-1.6-.8-.7.8a5 5 0 0 1-1.8-1.9l.8-.7-.8-1.6z" {...p} />
    </>
  ),
  camara: (p) => (
    <>
      <Path d="M3.5 8.5A1.5 1.5 0 0 1 5 7h2.2l1.2-2h7.2l1.2 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" {...p} />
      <Circle cx="12" cy="13" r="3.2" {...p} />
    </>
  ),
  subir: (p) => (
    <>
      <Path d="M12 16V4" {...p} />
      <Path d="M8 7.5 12 3.5l4 4" {...p} />
      <Path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" {...p} />
    </>
  ),

  // --- Interfaz ---
  buscar: (p) => (
    <>
      <Circle cx="11" cy="11" r="6.5" {...p} />
      <Line x1="16" y1="16" x2="20.5" y2="20.5" {...p} />
    </>
  ),
  filtro: (p) => <Path d="M4 6h16M7 12h10M10 18h4" {...p} />,
  campana: (p) => (
    <>
      <Path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" {...p} />
      <Path d="M10.5 19.5a1.8 1.8 0 0 0 3 0" {...p} />
    </>
  ),
  derecha: (p) => <Polyline points="9,5 16,12 9,19" {...p} />,
  izquierda: (p) => <Polyline points="15,5 8,12 15,19" {...p} />,
  cerrar: (p) => <Path d="M6 6l12 12M18 6 6 18" {...p} />,
  ajustes: (p) => (
    <>
      <Circle cx="12" cy="12" r="3" {...p} />
      <Path d="M19.4 14.5a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.6 1v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-2.7-1l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0-1-2.6h-.3a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1-2.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 2.6-1v-.3a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 2.7 1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0 1 2.6h.3a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4 1z" {...p} />
    </>
  ),
  mas_opciones: (p) => (
    <>
      <Circle cx="5.5" cy="12" r="1.4" {...p} />
      <Circle cx="12" cy="12" r="1.4" {...p} />
      <Circle cx="18.5" cy="12" r="1.4" {...p} />
    </>
  ),
  nube: (p) => (
    <Path d="M7 18.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17.3 10a3.8 3.8 0 0 1-.3 8.5z" {...p} />
  ),
  verificado: (p) => (
    <>
      <Circle cx="12" cy="12" r="8.5" {...p} />
      <Polyline points="8.5,12.3 11,14.8 15.5,9.7" {...p} />
    </>
  ),

  // --- Categorías ---
  usuario: (p) => (
    <>
      <Circle cx="12" cy="8.5" r="3.5" {...p} />
      <Path d="M5 20a7 7 0 0 1 14 0" {...p} />
    </>
  ),
  casa: (p) => (
    <>
      <Path d="M3.5 10.5 12 4l8.5 6.5" {...p} />
      <Path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" {...p} />
    </>
  ),
  maletin: (p) => (
    <>
      <Rect x="3" y="7.5" width="18" height="12" rx="1.8" {...p} />
      <Path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" {...p} />
    </>
  ),
  corazon: (p) => (
    <Path d="M12 20s-7-4.4-7-9.2A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z" {...p} />
  ),
  balanza: (p) => (
    <>
      <Line x1="12" y1="4" x2="12" y2="20" {...p} />
      <Line x1="7" y1="20" x2="17" y2="20" {...p} />
      <Path d="M5 7h14" {...p} />
      <Path d="M5 7 2.5 13h5z" {...p} />
      <Path d="M19 7l-2.5 6h5z" {...p} />
    </>
  ),
  auto: (p) => (
    <>
      <Path d="M4 16.5v-3l1.8-4.3A1.5 1.5 0 0 1 7.2 8.3h9.6a1.5 1.5 0 0 1 1.4.9L20 13.5v3" {...p} />
      <Rect x="3" y="13.5" width="18" height="3.5" rx="1.2" {...p} />
      <Circle cx="7.5" cy="17.5" r="1.4" {...p} />
      <Circle cx="16.5" cy="17.5" r="1.4" {...p} />
    </>
  ),
  reloj: (p) => (
    <>
      <Circle cx="12" cy="12" r="8.5" {...p} />
      <Polyline points="12,7.5 12,12 15,13.8" {...p} />
    </>
  ),
  credencial: (p) => (
    <>
      <Rect x="3" y="5.5" width="18" height="13" rx="2" {...p} />
      <Circle cx="8.8" cy="11" r="2" {...p} />
      <Path d="M5.6 15.6a3.6 3.6 0 0 1 6.4 0" {...p} />
      <Line x1="14.8" y1="10" x2="18.5" y2="10" {...p} />
      <Line x1="14.8" y1="13.5" x2="18.5" y2="13.5" {...p} />
    </>
  ),
  recibo: (p) => (
    <>
      <Path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z" {...p} />
      <Line x1="9" y1="8.5" x2="15" y2="8.5" {...p} />
      <Line x1="9" y1="12.5" x2="15" y2="12.5" {...p} />
    </>
  ),
  banco: (p) => (
    <>
      <Path d="M3.5 9.5 12 4.5l8.5 5" {...p} />
      <Line x1="6" y1="11.5" x2="6" y2="17" {...p} />
      <Line x1="10" y1="11.5" x2="10" y2="17" {...p} />
      <Line x1="14" y1="11.5" x2="14" y2="17" {...p} />
      <Line x1="18" y1="11.5" x2="18" y2="17" {...p} />
      <Line x1="3.5" y1="19.5" x2="20.5" y2="19.5" {...p} />
    </>
  ),
  escudo: (p) => (
    <Path d="M12 3.5 5 6.2v5.3c0 4.3 2.9 7.6 7 9 4.1-1.4 7-4.7 7-9V6.2z" {...p} />
  ),
  carrito: (p) => (
    <>
      <Path d="M3 5h2.2l2 9.5h9.3l1.8-7H6.2" {...p} />
      <Circle cx="8.5" cy="18.5" r="1.4" {...p} />
      <Circle cx="16" cy="18.5" r="1.4" {...p} />
    </>
  ),
  cubiertos: (p) => (
    <>
      <Path d="M7 3.5v7a2 2 0 0 0 4 0v-7" {...p} />
      <Line x1="9" y1="10.5" x2="9" y2="20.5" {...p} />
      <Path d="M16.5 3.5c-1.4 1.2-2 3-2 5.2 0 1.6.7 2.6 2 2.9v8.9" {...p} />
    </>
  ),
  gasolina: (p) => (
    <>
      <Path d="M5 20.5V6a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 13 6v14.5" {...p} />
      <Line x1="3.5" y1="20.5" x2="14.5" y2="20.5" {...p} />
      <Line x1="5" y1="10.5" x2="13" y2="10.5" {...p} />
      <Path d="M13 8.5h3.2a1.3 1.3 0 0 1 1.3 1.3v6a1.5 1.5 0 0 0 3 0V9l-2-2.2" {...p} />
    </>
  ),
  rayo: (p) => <Path d="M13.5 3 5.5 13.5h5.2L10 21l8.2-10.7H13z" {...p} />,
  estrella: (p) => (
    <Path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8z" {...p} />
  ),
  etiqueta: (p) => (
    <>
      <Path d="M3.5 11.5V5a1.5 1.5 0 0 1 1.5-1.5h6.5l9 9-8 8z" {...p} />
      <Circle cx="8" cy="8" r="1.4" {...p} />
    </>
  ),
};

export default function Icono({ nombre, tamano = 22, color = colores.texto, grosor = TRAZO }) {
  const dibujar = FORMAS[nombre] || FORMAS.documento;

  const props = {
    stroke: color,
    strokeWidth: grosor,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  return (
    <Svg width={tamano} height={tamano} viewBox="0 0 24 24">
      {dibujar(props)}
    </Svg>
  );
}

// Cuadro redondeado pastel con el ícono saturado dentro. Es el patrón que
// se repite en documentos, carpetas y categorías de gasto.
export function IconoChip({ nombre, fondo, trazo, tamano = 40 }) {
  return (
    <View
      style={{
        width: tamano,
        height: tamano,
        borderRadius: tamano * 0.3,
        backgroundColor: fondo,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icono nombre={nombre} tamano={tamano * 0.52} color={trazo} />
    </View>
  );
}
