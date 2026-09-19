import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Icono from '../components/Icono';
import { useIdioma } from '../i18n';
import { colores, espacio, radio, sombra, tipo } from '../theme';

const PRIVACIDAD = 'https://www.tappt.lat/privacidad.html';
const TERMINOS = 'https://www.tappt.lat/terminos.html';

export default function BienvenidaScreen({ onContinuar }) {
  const { t } = useIdioma();
  const ventajas = [
    ['whatsapp', 'bienvenidaWhatsapp', 'bienvenidaWhatsappDetalle'],
    ['estrella', 'bienvenidaIa', 'bienvenidaIaDetalle'],
    ['nube', 'bienvenidaDrive', 'bienvenidaDriveDetalle'],
  ];

  return (
    <SafeAreaView style={estilos.pantalla}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="bienvenida" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#063746" />
            <Stop offset="0.55" stopColor="#0F1720" />
            <Stop offset="1" stopColor="#071E18" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bienvenida)" />
      </Svg>

      <ScrollView
        contentContainerStyle={estilos.contenido}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={estilos.marca}>
          <Image source={require('../../assets/tappt-logo.png')} style={estilos.logo} resizeMode="contain" />
          <Text style={estilos.nombre}>Tappt</Text>
          <View style={estilos.distintivo}>
            <Text style={estilos.distintivoTexto}>{t('bienvenidaDistintivo')}</Text>
          </View>
        </View>

        <Text style={estilos.titulo}>{t('bienvenidaTitulo')}</Text>
        <Text style={estilos.subtitulo}>{t('bienvenidaSubtitulo')}</Text>

        <View style={estilos.flujo}>
          <Text style={estilos.flujoTexto}>WhatsApp</Text>
          <Icono nombre="derecha" tamano={17} color={colores.primarioClaro} />
          <Text style={estilos.flujoTexto}>{t('bienvenidaFlujoIa')}</Text>
          <Icono nombre="derecha" tamano={17} color={colores.primarioClaro} />
          <Text style={estilos.flujoTexto}>Google Drive</Text>
        </View>

        <View style={estilos.ventajas}>
          {ventajas.map(([icono, titulo, detalle]) => (
            <View key={titulo} style={estilos.ventaja}>
              <View style={estilos.iconoCaja}>
                <Icono nombre={icono} tamano={23} color={colores.primarioClaro} grosor={2.1} />
              </View>
              <View style={estilos.ventajaContenido}>
                <Text style={estilos.ventajaTitulo}>{t(titulo)}</Text>
                <Text style={estilos.ventajaDetalle}>{t(detalle)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={estilos.pie}>
          <TouchableOpacity style={estilos.boton} onPress={onContinuar} activeOpacity={0.86}>
            <Text style={estilos.botonTexto}>{t('bienvenidaContinuar')}</Text>
            <Icono nombre="derecha" tamano={20} color={colores.blanco} grosor={2.4} />
          </TouchableOpacity>

          <Text style={estilos.legal}>
            {t('bienvenidaLegal')}{' '}
            <Text style={estilos.enlace} onPress={() => Linking.openURL(TERMINOS)}>{t('terminos')}</Text>
            {' '}{t('y')}{' '}
            <Text style={estilos.enlace} onPress={() => Linking.openURL(PRIVACIDAD)}>{t('privacidad')}</Text>.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { flexGrow: 1, paddingHorizontal: espacio.lg, paddingTop: espacio.lg, paddingBottom: espacio.md },
  marca: { alignItems: 'center' },
  logo: { width: 82, height: 82 },
  nombre: { fontSize: 24, fontWeight: '800', color: colores.texto, letterSpacing: -0.6, marginTop: 2 },
  distintivo: {
    marginTop: espacio.sm,
    borderWidth: 1,
    borderColor: 'rgba(55,211,146,0.42)',
    backgroundColor: 'rgba(24,184,117,0.13)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
  },
  distintivoTexto: { color: colores.primarioClaro, fontSize: 11, fontWeight: '800', letterSpacing: 0.9 },
  titulo: { ...tipo.titulo, fontSize: 31, lineHeight: 36, color: colores.texto, textAlign: 'center', marginTop: espacio.lg },
  subtitulo: { ...tipo.cuerpo, color: colores.textoSuave, textAlign: 'center', lineHeight: 21, marginTop: espacio.sm },
  flujo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: espacio.lg,
    paddingVertical: espacio.sm + 2,
    paddingHorizontal: espacio.md,
    borderRadius: radio.lg,
    backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  flujoTexto: { color: colores.texto, fontSize: 13, fontWeight: '700' },
  ventajas: { gap: espacio.sm, marginTop: espacio.lg },
  ventaja: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    borderRadius: radio.lg,
    backgroundColor: 'rgba(21,27,36,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.075)',
  },
  iconoCaja: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.primarioSuave },
  ventajaContenido: { flex: 1, marginLeft: espacio.md },
  ventajaTitulo: { ...tipo.cuerpoFuerte, color: colores.texto },
  ventajaDetalle: { ...tipo.menor, color: colores.textoSuave, lineHeight: 16, marginTop: 2 },
  pie: { marginTop: 'auto', paddingTop: espacio.lg },
  boton: {
    minHeight: 56,
    borderRadius: radio.lg,
    backgroundColor: colores.primario,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.sm,
    ...sombra,
  },
  botonTexto: { color: colores.blanco, fontSize: 17, fontWeight: '800' },
  legal: { ...tipo.menor, color: colores.textoTerciario, textAlign: 'center', lineHeight: 17, marginTop: espacio.sm },
  enlace: { color: colores.textoSuave, textDecorationLine: 'underline' },
});
