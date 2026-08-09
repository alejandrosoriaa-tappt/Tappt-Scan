import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colores, espacio } from '../theme';

// Cámara de respaldo: el camino principal sigue siendo WhatsApp, pero la app
// debe poder escanear por sí sola (requisito de tiendas, guía 4.2 de Apple).
export default function EscanearScreen({ navigation }) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [capturando, setCapturando] = useState(false);
  const camara = useRef(null);

  if (!permiso) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!permiso.granted) {
    return (
      <SafeAreaView style={estilos.centrado}>
        <Text style={estilos.permisoTitulo}>Necesitamos la cámara</Text>
        <Text style={estilos.permisoTexto}>
          Para escanear tus documentos desde la app. También puedes mandarlos por WhatsApp.
        </Text>
        <TouchableOpacity style={estilos.botonPermiso} onPress={pedirPermiso} activeOpacity={0.8}>
          <Text style={estilos.botonPermisoTexto}>Permitir cámara</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const capturar = async () => {
    if (!camara.current || capturando) return;

    setCapturando(true);
    try {
      // La foto no se sube aquí: primero pasa por el recorte, que es quien
      // la manda ya enderezada.
      const foto = await camara.current.takePictureAsync({ quality: 0.8, base64: true });
      navigation.navigate('Recorte', { fotoBase64: foto.base64 });
    } catch (err) {
      Alert.alert('No se pudo capturar', err.message);
    } finally {
      setCapturando(false);
    }
  };

  return (
    <View style={estilos.pantalla}>
      <CameraView ref={camara} style={StyleSheet.absoluteFill} facing="back" />

      <SafeAreaView style={estilos.capa} edges={['top', 'bottom']}>
        <View style={estilos.visor}>
          <View style={estilos.marco}>
            <Text style={estilos.marcoTexto}>Coloca el documento dentro del marco</Text>
          </View>
        </View>

        <View style={estilos.controles}>
          <TouchableOpacity
            style={estilos.obturador}
            activeOpacity={0.8}
            onPress={capturar}
            disabled={capturando}
          >
            <View style={[estilos.obturadorInterior, capturando && estilos.obturadorActivo]} />
          </TouchableOpacity>
          <Text style={estilos.ayuda}>
            {capturando
              ? 'Tomando la foto…'
              : 'También puedes mandarnos la foto por WhatsApp y la guardamos igual.'}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#0B1220' },
  capa: { flex: 1 },
  centrado: {
    flex: 1,
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacio.lg,
  },
  permisoTitulo: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  permisoTexto: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: espacio.sm,
  },
  botonPermiso: {
    backgroundColor: colores.primario,
    borderRadius: 12,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.xl,
    marginTop: espacio.lg,
  },
  botonPermisoTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  visor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.lg },
  marco: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcoTexto: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  controles: { alignItems: 'center', paddingBottom: espacio.lg, paddingHorizontal: espacio.lg },
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
  obturadorActivo: { backgroundColor: 'rgba(255,255,255,0.5)' },
  ayuda: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: espacio.md,
  },
});
