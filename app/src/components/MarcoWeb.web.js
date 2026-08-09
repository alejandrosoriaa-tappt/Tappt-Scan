import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';

const ANCHO_TELEFONO = 430;
const UMBRAL_ESCRITORIO = 620;

/**
 * Marco de la web app.
 *
 * En un teléfono ocupa toda la pantalla y no se nota que existe. En una
 * laptop, en cambio, estirar una interfaz de app a 2000 px de ancho la
 * delata al instante: los botones quedan gigantes y el contenido perdido.
 * Así que en escritorio la app se centra en un ancho de teléfono, sobre un
 * fondo neutro.
 *
 * El alto usa `--alto-real` (lo publica `estilosWeb.web.js`) en lugar de
 * `100vh`, porque en móvil `100vh` incluye la barra de direcciones y deja
 * la app cortada por abajo.
 */
export default function MarcoWeb({ children }) {
  const { width } = useWindowDimensions();
  const escritorio = width >= UMBRAL_ESCRITORIO;

  if (!escritorio) {
    return <View style={estilos.completo}>{children}</View>;
  }

  return (
    <View style={estilos.fondo}>
      <View style={estilos.telefono}>{children}</View>
    </View>
  );
}

const estilos = StyleSheet.create({
  completo: {
    flex: 1,
    width: '100%',
    // El alto real medido; `100vh` miente en móvil.
    height: 'var(--alto-real, 100vh)',
    overflow: 'hidden',
  },
  fondo: {
    flex: 1,
    width: '100%',
    height: 'var(--alto-real, 100vh)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    // Aire para que el "teléfono" flote en vez de pegarse a los bordes.
    padding: 28,
  },
  telefono: {
    width: ANCHO_TELEFONO,
    height: '100%',
    maxHeight: 940,
    backgroundColor: '#F8FAFC',
    borderRadius: 28,
    overflow: 'hidden',
    boxShadow: '0 24px 70px rgba(0,0,0,0.45)',
  },
});
