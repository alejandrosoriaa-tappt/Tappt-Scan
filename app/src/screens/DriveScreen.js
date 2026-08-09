import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentoCard from '../components/DocumentoCard';
import useCargar from '../hooks/useCargar';
import { api } from '../lib/api';
import { colores, porTipo, espacio } from '../theme';

const CARPETA_A_TIPO = {
  Identificaciones: 'identificacion',
  Recibos: 'recibo',
  Contratos: 'contrato',
  Otros: 'otro',
};

// Explorador de la carpeta TapptScan/ del Drive del usuario.
export default function DriveScreen({ navigation }) {
  const [carpetaAbierta, setCarpetaAbierta] = useState(null);
  const carpetas = useCargar(() => api.carpetas(), []);
  const contenido = useCargar(
    () => (carpetaAbierta ? api.documentos(CARPETA_A_TIPO[carpetaAbierta]) : Promise.resolve(null)),
    [carpetaAbierta]
  );

  if (carpetaAbierta) {
    return (
      <SafeAreaView style={estilos.pantalla} edges={['top']}>
        <View style={estilos.encabezado}>
          <TouchableOpacity onPress={() => setCarpetaAbierta(null)}>
            <Text style={estilos.volver}>‹ TapptScan</Text>
          </TouchableOpacity>
          <Text style={estilos.titulo}>{carpetaAbierta}</Text>
        </View>

        <FlatList
          data={contenido.datos || []}
          keyExtractor={(d) => d.id}
          contentContainerStyle={estilos.lista}
          ListEmptyComponent={
            contenido.cargando ? (
              <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />
            ) : (
              <Text style={estilos.vacio}>Esta carpeta está vacía.</Text>
            )
          }
          renderItem={({ item }) => (
            <DocumentoCard
              documento={item}
              onPress={() => navigation.navigate('Documento', { documento: item })}
            />
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>TapptScan</Text>
        <Text style={estilos.subtitulo}>En tu Google Drive</Text>
      </View>

      <FlatList
        data={carpetas.datos || []}
        keyExtractor={(c) => c.nombre}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={
          carpetas.cargando ? (
            <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />
          ) : (
            <Text style={estilos.vacio}>{carpetas.error || 'Sin carpetas todavía.'}</Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={estilos.carpeta}
            activeOpacity={0.7}
            onPress={() => setCarpetaAbierta(item.nombre)}
          >
            <Text style={estilos.carpetaIcono}>
              {porTipo[CARPETA_A_TIPO[item.nombre]]?.icono || '📁'}
            </Text>
            <Text style={estilos.carpetaNombre}>{item.nombre}</Text>
            <Text style={estilos.carpetaCantidad}>{item.cantidad}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  encabezado: { paddingHorizontal: espacio.md, paddingTop: espacio.sm, paddingBottom: espacio.xs },
  volver: { color: colores.primario, fontSize: 15, marginBottom: espacio.xs },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.texto },
  subtitulo: { fontSize: 13, color: colores.textoSuave, marginTop: 2 },
  lista: { padding: espacio.md },
  vacio: { color: colores.textoSuave, fontSize: 14, textAlign: 'center', marginTop: espacio.xl },
  carpeta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espacio.md,
    marginBottom: espacio.sm,
  },
  carpetaIcono: { fontSize: 20, marginRight: espacio.md },
  carpetaNombre: { flex: 1, fontSize: 16, fontWeight: '500', color: colores.texto },
  carpetaCantidad: { fontSize: 14, color: colores.textoSuave },
});
