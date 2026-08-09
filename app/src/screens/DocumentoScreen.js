import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { colores, porTipo, espacio } from '../theme';

function Campo({ etiqueta, valor }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.campoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.campoValor}>{valor ?? '—'}</Text>
    </View>
  );
}

export default function DocumentoScreen({ route }) {
  const { documento } = route.params;
  const meta = porTipo[documento.tipo] || porTipo.otro;

  const proximamente = (que) =>
    Alert.alert(que, 'Función del plan Personal — pendiente de implementar.');

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View style={[estilos.vistaPrevia, { backgroundColor: `${meta.color}14` }]}>
        <Text style={estilos.vistaPreviaIcono}>{meta.icono}</Text>
        <Text style={estilos.nombreArchivo}>{documento.nombreArchivo}</Text>
      </View>

      <Text style={estilos.tituloSeccion}>Datos extraídos</Text>
      <View style={estilos.tarjeta}>
        <Campo etiqueta="Tipo" valor={meta.etiqueta} />
        <Campo etiqueta="Emisor" valor={documento.emisor} />
        <Campo etiqueta="Fecha" valor={documento.fecha} />
        <Campo
          etiqueta="Monto"
          valor={
            documento.monto != null
              ? `$${documento.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })} ${documento.moneda}`
              : null
          }
        />
        <Campo etiqueta="Carpeta" valor={meta.carpeta} />
      </View>

      <Text style={estilos.tituloSeccion}>Acciones</Text>
      <View style={estilos.acciones}>
        <TouchableOpacity style={estilos.boton} onPress={() => proximamente('Editar PDF')}>
          <Text style={estilos.botonTexto}>Editar PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity style={estilos.boton} onPress={() => proximamente('Firmar')}>
          <Text style={estilos.botonTexto}>Firmar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[estilos.boton, estilos.botonPrimario]}
          onPress={() => Linking.openURL(documento.driveLink)}
        >
          <Text style={[estilos.botonTexto, estilos.botonTextoPrimario]}>Abrir en Drive</Text>
        </TouchableOpacity>
      </View>

      <Text style={estilos.nota}>
        Este archivo vive en tu Google Drive. Nosotros solo guardamos sus datos para
        que puedas buscarlo.
      </Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.md, paddingBottom: espacio.xl },
  vistaPrevia: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: espacio.xl,
  },
  vistaPreviaIcono: { fontSize: 48 },
  nombreArchivo: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.sm },
  tituloSeccion: {
    fontSize: 13,
    fontWeight: '700',
    color: colores.textoSuave,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: espacio.lg,
    marginBottom: espacio.sm,
  },
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    paddingHorizontal: espacio.md,
  },
  campo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espacio.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.borde,
  },
  campoEtiqueta: { fontSize: 14, color: colores.textoSuave },
  campoValor: { fontSize: 14, fontWeight: '500', color: colores.texto },
  acciones: { gap: espacio.sm },
  boton: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonPrimario: { backgroundColor: colores.primario, borderColor: colores.primario },
  botonTexto: { fontSize: 15, fontWeight: '600', color: colores.texto },
  botonTextoPrimario: { color: '#FFFFFF' },
  nota: {
    fontSize: 12,
    color: colores.textoSuave,
    lineHeight: 18,
    marginTop: espacio.lg,
    textAlign: 'center',
  },
});
