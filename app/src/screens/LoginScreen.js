import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import Icono, { IconoChip } from '../components/Icono';
import { colores, espacio, radio, tipo, sombra } from '../theme';

const INTERVALO_MS = 2500;

/**
 * Acceso sin correo ni contraseña.
 *
 * WhatsApp no deja escribirle primero a quien no te ha escrito, salvo con
 * plantilla aprobada. Así que se invierte: la app abre WhatsApp con el
 * mensaje ya redactado y el usuario solo toca "enviar". Menos pasos que
 * teclear un código, y sin trámites con Meta.
 */
export default function LoginScreen() {
  const { t } = useIdioma();
  const { entrarConToken } = useSesion();

  const [sesion, setSesion] = useState(null); // { codigo, enlaceWhatsapp }
  const [esperando, setEsperando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const temporizador = useRef(null);

  // Mientras el usuario está en WhatsApp, se pregunta al backend si ya
  // llegó su mensaje.
  useEffect(() => {
    if (!esperando || !sesion) return;

    temporizador.current = setInterval(async () => {
      try {
        const estado = await api.estadoSesion(sesion.codigo);

        if (estado.estado === 'listo') {
          clearInterval(temporizador.current);
          entrarConToken(estado.token);
        } else if (estado.estado === 'vencido') {
          clearInterval(temporizador.current);
          setEsperando(false);
          setSesion(null);
          Alert.alert(t('codigoVencido'), t('codigoVencidoDetalle'));
        }
      } catch {
        // Un fallo de red suelto no debe cortar la espera.
      }
    }, INTERVALO_MS);

    return () => clearInterval(temporizador.current);
  }, [esperando, sesion, entrarConToken, t]);

  const entrar = async () => {
    setCargando(true);
    try {
      const nueva = await api.iniciarSesion();
      setSesion(nueva);
      setEsperando(true);
      await Linking.openURL(nueva.enlaceWhatsapp);
    } catch (err) {
      Alert.alert(t('noSePudo'), err.message);
      setEsperando(false);
    } finally {
      setCargando(false);
    }
  };

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.contenido}>
        <View style={estilos.marca}>
          <Text style={estilos.logo}>
            Tappt<Text style={estilos.logoAcento}>Scan</Text>
          </Text>
          <Text style={estilos.promesa}>{t('promesa')}</Text>
        </View>

        {esperando && sesion ? (
          <View style={estilos.espera}>
            <ActivityIndicator color={colores.primario} />
            <Text style={estilos.esperaTitulo}>{t('esperandoWhatsapp')}</Text>
            <Text style={estilos.esperaDetalle}>{t('esperandoWhatsappDetalle')}</Text>

            <View style={estilos.codigoCaja}>
              <Text style={estilos.codigoEtiqueta}>{t('tuCodigo')}</Text>
              <Text style={estilos.codigo}>{sesion.codigo}</Text>
            </View>

            <TouchableOpacity onPress={() => Linking.openURL(sesion.enlaceWhatsapp)}>
              <Text style={estilos.enlace}>{t('abrirWhatsappOtraVez')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <TouchableOpacity
              style={estilos.boton}
              onPress={entrar}
              disabled={cargando}
              activeOpacity={0.85}
            >
              {cargando ? (
                <ActivityIndicator color={colores.blanco} />
              ) : (
                <>
                  <Icono nombre="whatsapp" tamano={21} color={colores.blanco} />
                  <Text style={estilos.botonTexto}>{t('entrarConWhatsapp')}</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={estilos.pasos}>
              {['pasoUno', 'pasoDos', 'pasoTres'].map((clave, i) => (
                <View key={clave} style={estilos.paso}>
                  <Text style={estilos.pasoNumero}>{i + 1}</Text>
                  <Text style={estilos.pasoTexto}>{t(clave)}</Text>
                </View>
              ))}
            </View>

            <View style={estilos.privacidad}>
              <IconoChip nombre="escudo" fondo={colores.primarioSuave} trazo={colores.primario} tamano={34} />
              <Text style={estilos.privacidadTexto}>{t('sinContrasena')}</Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { flex: 1, justifyContent: 'center', padding: espacio.lg },

  marca: { alignItems: 'center', marginBottom: espacio.xl },
  logo: { fontSize: 34, fontWeight: '700', color: colores.texto, letterSpacing: -0.8 },
  logoAcento: { color: colores.primario },
  promesa: {
    ...tipo.cuerpo,
    color: colores.textoSuave,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: espacio.sm,
  },

  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.sm,
    backgroundColor: colores.primario,
    borderRadius: radio.lg,
    paddingVertical: espacio.md + 2,
    ...sombra,
  },
  botonTexto: { color: colores.blanco, fontSize: 16, fontWeight: '600' },

  pasos: { marginTop: espacio.xl, gap: espacio.md },
  paso: { flexDirection: 'row', alignItems: 'center' },
  pasoNumero: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colores.primarioSuave,
    color: colores.primario,
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '700',
    fontSize: 12,
    marginRight: espacio.md,
  },
  pasoTexto: { flex: 1, ...tipo.secundario, color: colores.textoSuave, lineHeight: 19 },

  privacidad: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espacio.md,
    marginTop: espacio.xl,
    ...sombra,
  },
  privacidadTexto: { flex: 1, ...tipo.menor, color: colores.textoSuave, marginLeft: espacio.md, lineHeight: 17 },

  espera: { alignItems: 'center' },
  esperaTitulo: { ...tipo.seccion, color: colores.texto, marginTop: espacio.md },
  esperaDetalle: {
    ...tipo.secundario,
    color: colores.textoSuave,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: espacio.xs,
  },
  codigoCaja: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.xl,
    alignItems: 'center',
    marginTop: espacio.lg,
    ...sombra,
  },
  codigoEtiqueta: { ...tipo.menor, color: colores.textoSuave },
  codigo: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
    color: colores.primario,
    marginTop: espacio.xs,
  },
  enlace: { ...tipo.cuerpo, color: colores.primario, marginTop: espacio.lg },
});
