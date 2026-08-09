import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colores, espacio } from '../theme';

// Cámara de respaldo: el camino principal sigue siendo WhatsApp, pero la app
// debe poder escanear por sí sola (requisito de tiendas, guía 4.2 de Apple).
// Por ahora es el marco visual; falta montar expo-camera + detección de bordes.
export default function EscanearScreen() {
  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <View style={estilos.visor}>
        <View style={estilos.marco}>
          <Text style={estilos.marcoTexto}>Coloca el documento dentro del marco</Text>
        </View>
        <Text style={estilos.pendiente}>Vista previa de cámara — pendiente expo-camera</Text>
      </View>

      <View style={estilos.controles}>
        <TouchableOpacity
          style={estilos.obturador}
          activeOpacity={0.8}
          onPress={() => Alert.alert('Captura', 'Aquí se dispara la captura y el recorte automático.')}
        >
          <View style={estilos.obturadorInterior} />
        </TouchableOpacity>
        <Text style={estilos.ayuda}>
          También puedes mandarnos la foto por WhatsApp y la guardamos igual.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#0B1220' },
  visor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.lg },
  marco: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: 16,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcoTexto: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  pendiente: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: espacio.md },
  controles: { alignItems: 'center', paddingBottom: espacio.xl, paddingHorizontal: espacio.lg },
  obturador: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  obturadorInterior: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
  ayuda: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: espacio.md,
  },
});
