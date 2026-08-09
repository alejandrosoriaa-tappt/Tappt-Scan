import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colores, porTipo, espacio } from '../theme';

function formatoMonto(monto, moneda) {
  if (monto == null) return null;
  const numero = Number(monto).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  return `$${numero} ${moneda || ''}`.trim();
}

export default function DocumentoCard({ documento, onPress }) {
  const meta = porTipo[documento.tipo] || porTipo.otro;
  const monto = formatoMonto(documento.monto, documento.moneda);

  return (
    <TouchableOpacity style={estilos.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[estilos.icono, { backgroundColor: `${meta.color}1A` }]}>
        <Text style={estilos.iconoTexto}>{meta.icono}</Text>
      </View>

      <View style={estilos.centro}>
        <Text style={estilos.emisor} numberOfLines={1}>
          {documento.emisor || 'Sin emisor'}
        </Text>
        <Text style={estilos.sub}>
          {meta.etiqueta} · {documento.fecha}
        </Text>
      </View>

      {monto ? <Text style={estilos.monto}>{monto}</Text> : null}
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espacio.md,
    marginBottom: espacio.sm,
  },
  icono: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espacio.md,
  },
  iconoTexto: { fontSize: 20 },
  centro: { flex: 1 },
  emisor: { fontSize: 16, fontWeight: '600', color: colores.texto },
  sub: { fontSize: 13, color: colores.textoSuave, marginTop: 2 },
  monto: { fontSize: 15, fontWeight: '600', color: colores.texto, marginLeft: espacio.sm },
});
