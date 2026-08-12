import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { api } from '../lib/api';
import { alertar } from '../lib/alerta';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import Icono, { IconoChip } from '../components/Icono';
import { colores, espacio, radio, tipo, sombra } from '../theme';

/**
 * Único paso previo a usar la app: conectar Google Drive.
 *
 * El número de WhatsApp ya quedó verificado al entrar, así que aquí solo
 * falta decidir dónde van a vivir los documentos.
 */
export default function OnboardingScreen() {
  const { cuenta, refrescarCuenta, cerrarSesion } = useSesion();
  const { t } = useIdioma();
  const [cargando, setCargando] = useState(false);

  const conectarDrive = async () => {
    setCargando(true);
    try {
      const { url } = await api.urlConectarDrive();

      if (Platform.OS === 'web') {
        // Navegar la misma pestaña en vez de un popup: el callback del
        // backend regresa a "/" cuando Google termina, y ahí la app
        // vuelve a cargar ya con el Drive conectado.
        window.location.href = url;
        return;
      }

      await WebBrowser.openAuthSessionAsync(url);
      await refrescarCuenta();
    } catch (err) {
      alertar(t('noSePudo'), err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.contenido}>
        <View style={estilos.encabezado}>
          <IconoChip nombre="nube" fondo="rgba(59,130,246,0.18)" trazo="#5B9BFA" tamano={56} />
          <Text style={estilos.titulo}>{t('conectaDrive')}</Text>
          <Text style={estilos.subtitulo}>{t('driveDetalle')}</Text>
        </View>

        <View style={estilos.tarjeta}>
          {[
            ['carpeta', t('ventajaCarpetas')],
            ['escudo', t('ventajaPrivacidad')],
            ['verificado', t('ventajaTuyo')],
          ].map(([icono, texto]) => (
            <View key={icono} style={estilos.ventaja}>
              <Icono nombre={icono} tamano={18} color={colores.primario} />
              <Text style={estilos.ventajaTexto}>{texto}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={estilos.boton}
          onPress={conectarDrive}
          disabled={cargando}
          activeOpacity={0.85}
        >
          {cargando ? (
            <ActivityIndicator color={colores.blanco} />
          ) : (
            <Text style={estilos.botonTexto}>{t('conectarDrive')}</Text>
          )}
        </TouchableOpacity>

        {cuenta?.whatsapp ? (
          <Text style={estilos.conectado}>{t('conectado', { valor: cuenta.whatsapp })}</Text>
        ) : null}

        <TouchableOpacity onPress={cerrarSesion}>
          <Text style={estilos.salir}>{t('cerrarSesion')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { flex: 1, justifyContent: 'center', padding: espacio.lg },

  encabezado: { alignItems: 'center', marginBottom: espacio.xl },
  titulo: { ...tipo.titulo, color: colores.texto, marginTop: espacio.md, textAlign: 'center' },
  subtitulo: {
    ...tipo.cuerpo,
    color: colores.textoSuave,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: espacio.sm,
  },

  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espacio.md,
    gap: espacio.md,
    ...sombra,
  },
  ventaja: { flexDirection: 'row', alignItems: 'center' },
  ventajaTexto: { flex: 1, ...tipo.secundario, color: colores.texto, marginLeft: espacio.md, lineHeight: 19 },

  boton: {
    backgroundColor: colores.primario,
    borderRadius: radio.lg,
    paddingVertical: espacio.md + 2,
    alignItems: 'center',
    marginTop: espacio.lg,
    ...sombra,
  },
  botonTexto: { color: colores.blanco, fontSize: 16, fontWeight: '600' },

  conectado: { ...tipo.menor, color: colores.textoSuave, textAlign: 'center', marginTop: espacio.lg },
  salir: { ...tipo.secundario, color: colores.textoSuave, textAlign: 'center', marginTop: espacio.md },
});
