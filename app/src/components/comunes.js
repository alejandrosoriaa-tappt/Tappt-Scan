import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colores, espacio, radio, sombra } from '../theme';

export function Tarjeta({ style, children }) {
  return <View style={[estilos.tarjeta, style]}>{children}</View>;
}

// Barra de progreso: almacenamiento de Drive y peso de cada categoría.
export function Barra({ porcentaje, color = colores.primario, alto = 6 }) {
  return (
    <View style={[estilos.barraFondo, { height: alto, borderRadius: alto / 2 }]}>
      <View
        style={{
          width: `${Math.min(100, Math.max(0, porcentaje || 0))}%`,
          height: '100%',
          backgroundColor: color,
          borderRadius: alto / 2,
        }}
      />
    </View>
  );
}

export function formatoDinero(monto, moneda) {
  if (monto == null) return null;
  const numero = Number(monto).toLocaleString('es-MX', {
    minimumFractionDigits: Number.isInteger(Number(monto)) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `$${numero}${moneda ? ` ${moneda}` : ''}`;
}

export function formatoBytes(bytes) {
  if (!bytes) return '0 GB';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espacio.md,
    ...sombra,
  },
  barraFondo: { width: '100%', backgroundColor: colores.divisor, overflow: 'hidden' },
});
