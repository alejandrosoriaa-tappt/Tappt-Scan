import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentoCard from '../components/DocumentoCard';
import useCargar from '../hooks/useCargar';
import { api } from '../lib/api';
import { useSesion } from '../context/SesionContext';
import { colores, espacio } from '../theme';

export default function DashboardScreen({ navigation }) {
  const { cuenta, refrescarCuenta } = useSesion();
  const documentos = useCargar(() => api.documentos(), []);
  const gastos = useCargar(() => api.gastos(), []);

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
  vacio: {
    fontSize: 14,
    color: colores.textoSuave,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: espacio.lg,
  },
});
