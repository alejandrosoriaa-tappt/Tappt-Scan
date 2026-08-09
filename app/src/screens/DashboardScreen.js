import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentoCard from '../components/DocumentoCard';
import useCargar from '../hooks/useCargar';
import { api } from '../lib/api';
import { importarArchivo, importarDeGaleria } from '../lib/importar';
import { useSesion } from '../context/SesionContext';
import { colores, espacio } from '../theme';

export default function DashboardScreen({ navigation }) {
  const { cuenta, refrescarCuenta } = useSesion();
  const documentos = useCargar(() => api.documentos(), []);
  const gastos = useCargar(() => api.gastos(), []);
  const [importando, setImportando] = useState(false);

  const importar = async (elegir) => {
    setImportando(true);
    try {
      const documento = await elegir();
      if (!documento) return;

      documentos.recargar();
      refrescarCuenta();
      navigation.navigate('Documento', { documento });
    } catch (err) {
      const mensajes = {
        limite_alcanzado: 'Ya usaste tus escaneos gratis del mes.',
        drive_sin_conectar: 'Conecta tu Google Drive para poder guardar documentos.',
      };
      Alert.alert('No se pudo importar', mensajes[err.message] || err.message);
    } finally {
      setImportando(false);
    }
  };

  const recargarTodo = () => {
    documentos.recargar();
    gastos.recargar();
    refrescarCuenta();
  };

  const restantes =
    cuenta?.escaneosLimite != null ? cuenta.escaneosLimite - cuenta.escaneosUsados : null;

  if (documentos.cargando && !documentos.datos) {
    return (
      <SafeAreaView style={estilos.centrado}>
        <ActivityIndicator color={colores.primario} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <FlatList
        data={documentos.datos || []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={estilos.lista}
        refreshControl={
          <RefreshControl refreshing={documentos.cargando} onRefresh={recargarTodo} />
        }
        ListHeaderComponent={
          <View>
            <Text style={estilos.saludo}>Hola</Text>
            <Text style={estilos.subSaludo}>Tus documentos, en tu propio Drive.</Text>

            <View style={estilos.filaStats}>
              <View style={estilos.stat}>
                <Text style={estilos.statValor}>{documentos.datos?.length ?? 0}</Text>
                <Text style={estilos.statEtiqueta}>Documentos</Text>
              </View>
              <View style={estilos.stat}>
                <Text style={estilos.statValor}>
                  ${(gastos.datos?.total ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                </Text>
                <Text style={estilos.statEtiqueta}>Gasto del mes</Text>
              </View>
            </View>

            {cuenta?.plan === 'gratis' && restantes != null ? (
              <TouchableOpacity
                style={estilos.banner}
                onPress={() => navigation.navigate('Ajustes')}
                activeOpacity={0.8}
              >
                <Text style={estilos.bannerTitulo}>
                  Te {restantes === 1 ? 'queda' : 'quedan'} {Math.max(restantes, 0)} escaneos este mes
                </Text>
                <Text style={estilos.bannerTexto}>
                  Pásate a Personal para escaneos ilimitados, edición de PDF y firmas.
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={estilos.filaImportar}>
              <TouchableOpacity
                style={estilos.botonImportar}
                onPress={() => importar(importarArchivo)}
                disabled={importando}
                activeOpacity={0.8}
              >
                <Text style={estilos.importarIcono}>📄</Text>
                <Text style={estilos.importarTexto}>
                  {importando ? 'Subiendo…' : 'Importar archivo'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={estilos.botonImportar}
                onPress={() => importar(importarDeGaleria)}
                disabled={importando}
                activeOpacity={0.8}
              >
                <Text style={estilos.importarIcono}>🖼️</Text>
                <Text style={estilos.importarTexto}>Desde galería</Text>
              </TouchableOpacity>
            </View>

            <Text style={estilos.tituloSeccion}>Recientes</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={estilos.vacio}>
            Todavía no tienes documentos. Mándanos una foto por WhatsApp o usa la cámara.
          </Text>
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

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.fondo },
  lista: { padding: espacio.md, paddingBottom: espacio.xl },
  saludo: { fontSize: 26, fontWeight: '700', color: colores.texto },
  subSaludo: { fontSize: 14, color: colores.textoSuave, marginTop: 4 },
  filaStats: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.lg },
  stat: {
    flex: 1,
    backgroundColor: colores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espacio.md,
  },
  statValor: { fontSize: 22, fontWeight: '700', color: colores.texto },
  statEtiqueta: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  banner: {
    backgroundColor: colores.primarioSuave,
    borderRadius: 12,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  bannerTitulo: { fontSize: 15, fontWeight: '700', color: colores.primario },
  bannerTexto: { fontSize: 13, color: colores.primario, marginTop: 4, lineHeight: 18 },
  tituloSeccion: {
    fontSize: 13,
    fontWeight: '700',
    color: colores.textoSuave,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: espacio.lg,
    marginBottom: espacio.sm,
  },
  filaImportar: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.md },
  botonImportar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.xs,
    backgroundColor: colores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    paddingVertical: espacio.md,
  },
  importarIcono: { fontSize: 16 },
  importarTexto: { fontSize: 13, fontWeight: '600', color: colores.texto },
  vacio: {
    fontSize: 14,
    color: colores.textoSuave,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: espacio.lg,
  },
});
