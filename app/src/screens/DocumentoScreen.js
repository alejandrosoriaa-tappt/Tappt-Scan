import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { api } from '../lib/api';
import { colores, porTipo, espacio } from '../theme';

function Campo({ etiqueta, valor }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.campoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.campoValor}>{valor ?? '—'}</Text>
    </View>
  );
}

export default function DocumentoScreen({ route, navigation }) {
  const { documento } = route.params;
  const meta = porTipo[documento.tipo] || porTipo.otro;
  const [abriendo, setAbriendo] = useState(false);

  // El original vive en Drive; el backend nos manda la primera página ya
  // lista para mostrar (rasterizada si es PDF).
  const abrirEditor = async () => {
    setAbriendo(true);
    try {
      const paginaInicial = await api.pagina(documento.id, 0);
      navigation.navigate('Editor', { documento, paginaInicial });
    } catch (err) {
      Alert.alert('No pudimos abrir el editor', err.message);
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View style={[estilos.vistaPrevia, { backgroundColor: `${meta.color}14` }]}>
        <Text style={estilos.vistaPreviaIcono}>{meta.icono}</Text>
        <Text style={estilos.nombreArchivo}>{documento.nombre_archivo}</Text>
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
              ? `$${Number(documento.monto).toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })} ${documento.moneda || ''}`.trim()
              : null
          }
        />
        <Campo etiqueta="Carpeta" valor={meta.carpeta} />
        <Campo
          etiqueta="Formato"
          valor={
            documento.mime_type === 'application/pdf'
              ? `PDF · ${documento.paginas || 1} ${documento.paginas > 1 ? 'páginas' : 'página'}`
              : 'Imagen'
          }
        />
      </View>

      <Text style={estilos.tituloSeccion}>Acciones</Text>
      <View style={estilos.acciones}>
        <TouchableOpacity style={estilos.boton} onPress={abrirEditor} disabled={abriendo}>
          <Text style={estilos.botonTexto}>
            {abriendo ? 'Abriendo…' : 'Editar y firmar'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[estilos.boton, estilos.botonPrimario]}
          onPress={() => Linking.openURL(documento.drive_link)}
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
