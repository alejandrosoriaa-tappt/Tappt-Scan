import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { api } from '../lib/api';
import { useSesion } from '../context/SesionContext';
import { colores, espacio } from '../theme';

// Dos conexiones antes de poder escanear: el número de WhatsApp (por código
// de un solo uso) y el Google Drive donde vivirán los archivos.
export default function OnboardingScreen() {
  const { cuenta, refrescarCuenta, cerrarSesion } = useSesion();
  const [codigo, setCodigo] = useState(null);
  const [cargando, setCargando] = useState(false);

  const pedirCodigo = async () => {
    setCargando(true);
    try {
      const { codigo } = await api.codigoWhatsapp();
      setCodigo(codigo);
    } catch (err) {
      Alert.alert('No pudimos generar el código', err.message);
    } finally {
      setCargando(false);
    }
  };

  const conectarDrive = async () => {
    setCargando(true);
    try {
      const { url } = await api.urlConectarDrive();
      await WebBrowser.openAuthSessionAsync(url);
      await refrescarCuenta();
    } catch (err) {
      Alert.alert('No pudimos conectar tu Drive', err.message);
    } finally {
      setCargando(false);
    }
  };

  const whatsappListo = Boolean(cuenta?.whatsapp);
  const driveListo = Boolean(cuenta?.driveConectado);

  return (
    <SafeAreaView style={estilos.pantalla}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Text style={estilos.titulo}>Ya casi</Text>
        <Text style={estilos.subtitulo}>
          Dos pasos y puedes empezar a escanear desde WhatsApp.
        </Text>

        <View style={estilos.paso}>
          <View style={estilos.pasoEncabezado}>
            <Text style={estilos.pasoNumero}>1</Text>
            <Text style={estilos.pasoTitulo}>Conecta tu WhatsApp</Text>
            {whatsappListo ? <Text style={estilos.listo}>✓</Text> : null}
          </View>

          {whatsappListo ? (
            <Text style={estilos.pasoTexto}>Conectado: {cuenta.whatsapp}</Text>
          ) : codigo ? (
            <View>
              <Text style={estilos.codigo}>{codigo}</Text>
              <Text style={estilos.pasoTexto}>
                Manda este código por WhatsApp a TapptScan desde el número que quieres
                conectar. Vence en 15 minutos.
              </Text>
              <TouchableOpacity onPress={refrescarCuenta}>
                <Text style={estilos.enlace}>Ya lo mandé, verificar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={estilos.boton}
              onPress={pedirCodigo}
              disabled={cargando}
              activeOpacity={0.8}
            >
              <Text style={estilos.botonTexto}>Generar código</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={estilos.paso}>
          <View style={estilos.pasoEncabezado}>
            <Text style={estilos.pasoNumero}>2</Text>
            <Text style={estilos.pasoTitulo}>Conecta tu Google Drive</Text>
            {driveListo ? <Text style={estilos.listo}>✓</Text> : null}
          </View>

          {driveListo ? (
            <Text style={estilos.pasoTexto}>
              Listo. Creamos la carpeta TapptScan con sus subcarpetas.
            </Text>
          ) : (
            <View>
              <Text style={estilos.pasoTexto}>
                Ahí se guardan tus documentos. Nosotros solo guardamos sus datos para que
                puedas buscarlos.
              </Text>
              <TouchableOpacity
                style={estilos.boton}
                onPress={conectarDrive}
                disabled={cargando}
                activeOpacity={0.8}
              >
                <Text style={estilos.botonTexto}>Conectar Drive</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity onPress={cerrarSesion}>
          <Text style={estilos.salir}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.lg },
  titulo: { fontSize: 28, fontWeight: '700', color: colores.texto },
  subtitulo: { fontSize: 14, color: colores.textoSuave, marginTop: 4, marginBottom: espacio.lg },
  paso: {
    backgroundColor: colores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espacio.md,
    marginBottom: espacio.md,
  },
  pasoEncabezado: { flexDirection: 'row', alignItems: 'center', marginBottom: espacio.sm },
  pasoNumero: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colores.primarioSuave,
    color: colores.primario,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '700',
    fontSize: 13,
    marginRight: espacio.sm,
  },
  pasoTitulo: { flex: 1, fontSize: 16, fontWeight: '600', color: colores.texto },
  listo: { color: '#16A34A', fontSize: 18, fontWeight: '700' },
  pasoTexto: { fontSize: 13, color: colores.textoSuave, lineHeight: 19 },
  codigo: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 6,
    color: colores.primario,
    textAlign: 'center',
    marginVertical: espacio.sm,
  },
  boton: {
    backgroundColor: colores.primario,
    borderRadius: 10,
    paddingVertical: espacio.sm + 2,
    alignItems: 'center',
    marginTop: espacio.md,
  },
  botonTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  enlace: { color: colores.primario, fontSize: 14, marginTop: espacio.md, textAlign: 'center' },
  salir: { color: colores.textoSuave, fontSize: 14, textAlign: 'center', marginTop: espacio.lg },
});
