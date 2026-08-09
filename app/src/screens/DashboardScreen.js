import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentoCard from '../components/DocumentoCard';
import { documentos, usuario, gastoDelMes } from '../data/mock';
import { colores, espacio } from '../theme';

export default function DashboardScreen({ navigation }) {
  const gasto = gastoDelMes();
  const restantes = usuario.escaneosLimite - usuario.escaneosUsados;

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <FlatList
        data={documentos}
        keyExtractor={(d) => d.id}
        contentContainerStyle={estilos.lista}
        ListHeaderComponent={
          <View>
            <Text style={estilos.saludo}>Hola, {usuario.nombre}</Text>
            <Text style={estilos.subSaludo}>Tus documentos, en tu propio Drive.</Text>

            <View style={estilos.filaStats}>
              <View style={estilos.stat}>
                <Text style={estilos.statValor}>{documentos.length}</Text>
                <Text style={estilos.statEtiqueta}>Documentos</Text>
              </View>
              <View style={estilos.stat}>
                <Text style={estilos.statValor}>
                  ${gasto.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
                </Text>
                <Text style={estilos.statEtiqueta}>Gasto del mes</Text>
              </View>
            </View>

            {usuario.plan === 'gratis' ? (
              <TouchableOpacity
                style={estilos.banner}
                onPress={() => navigation.navigate('Ajustes')}
                activeOpacity={0.8}
              >
                <Text style={estilos.bannerTitulo}>
                  Te quedan {restantes} escaneos este mes
                </Text>
                <Text style={estilos.bannerTexto}>
                  Pásate a Personal para escaneos ilimitados, edición de PDF y firmas.
                </Text>
              </TouchableOpacity>
            ) : null}

            <Text style={estilos.tituloSeccion}>Recientes</Text>
          </View>
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
});
