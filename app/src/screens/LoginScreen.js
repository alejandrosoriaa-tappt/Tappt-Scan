import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { alertar } from '../lib/alerta';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import Icono, { IconoChip } from '../components/Icono';
import { colores, espacio, radio, tipo, sombra } from '../theme';

const INTERVALO_MS = 2500;

// En web, Linking.openURL usa window.open por debajo — y si ya pasó un
// await (la llamada al backend) antes de invocarlo, el navegador ya no lo
// considera una reacción directa al toque y lo bloquea en silencio, sin
// error. Navegar en la misma pestaña con window.location no tiene ese
// problema y es justo lo que se quiere: mandar al usuario a WhatsApp.
function abrirEnlace(url) {
  if (Platform.OS === 'web') {
    window.location.href = url;
    return Promise.resolve();
  }
  return Linking.openURL(url);
}

/**
 * Acceso por SMS, exclusivo de iOS.
 *
 * Apple rechaza una app cuyo único acceso obligue a instalar otra app
 * (guía 4.8) — así se rechazó el login de WhatsApp en MuralEx. Aquí el
 * riesgo es mayor porque WhatsApp era el ÚNICO login que existía, así que
 * en iOS este es el camino de entrada; Android y la web app conservan el
 * flujo de WhatsApp tal cual.
 */
function LoginSms() {
  const { t } = useIdioma();
  const { entrarConToken } = useSesion();

  const [paso, setPaso] = useState('telefono'); // 'telefono' | 'codigo'
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const enviarCodigo = async () => {
    setError(null);
    setCargando(true);
    try {
      await api.iniciarSesionSms(nombre.trim(), telefono.trim());
      setPaso('codigo');
    } catch (err) {
      if (err.message === 'telefono_invalido') setError(t('smsErrorTelefonoInvalido'));
      else if (err.message === 'demasiados_intentos') setError(t('smsErrorDemasiadosIntentos'));
      else setError(t('smsErrorGenerico'));
    } finally {
      setCargando(false);
    }
  };

  const verificarCodigo = async () => {
    setError(null);
    setCargando(true);
    try {
      const resultado = await api.verificarSesionSms(telefono.trim(), codigo.trim());
      if (resultado.estado === 'listo') {
        entrarConToken(resultado.token);
      } else if (resultado.estado === 'codigo_incorrecto') {
        setError(t('smsErrorCodigoIncorrecto', { intentos: resultado.intentosRestantes }));
      } else if (resultado.estado === 'vencido' || resultado.estado === 'sin_reto') {
        setError(t('smsErrorVencido'));
      } else {
        setError(t('smsErrorGenerico'));
      }
    } catch {
      setError(t('smsErrorGenerico'));
    } finally {
      setCargando(false);
    }
  };

  if (paso === 'codigo') {
    return (
      <View style={estilos.espera}>
        <Text style={estilos.esperaTitulo}>{t('smsEsperandoTitulo')}</Text>
        <Text style={estilos.esperaDetalle}>{t('smsEsperandoDetalle', { telefono })}</Text>

        <TextInput
          style={estilos.input}
          value={codigo}
          onChangeText={setCodigo}
          placeholder={t('smsCodigoPlaceholder')}
          placeholderTextColor={colores.textoSuave}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />

        {error ? <Text style={estilos.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[estilos.boton, estilos.botonSms]}
          onPress={verificarCodigo}
          disabled={cargando || codigo.trim().length !== 6}
          activeOpacity={0.85}
        >
          {cargando ? <ActivityIndicator color={colores.blanco} /> : <Text style={estilos.botonTexto}>{t('smsVerificar')}</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={enviarCodigo} disabled={cargando}>
          <Text style={estilos.enlace}>{t('smsReenviar')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setPaso('telefono'); setCodigo(''); setError(null); }}>
          <Text style={estilos.enlace}>{t('smsCambiarTelefono')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <TextInput
        style={estilos.input}
        value={nombre}
        onChangeText={setNombre}
        placeholder={t('smsNombrePlaceholder')}
        placeholderTextColor={colores.textoSuave}
        autoCapitalize="words"
      />
      <TextInput
        style={estilos.input}
        value={telefono}
        onChangeText={setTelefono}
        placeholder={t('smsTelefonoPlaceholder')}
        placeholderTextColor={colores.textoSuave}
        keyboardType="phone-pad"
        maxLength={10}
      />

      {error ? <Text style={estilos.error}>{error}</Text> : null}

      <TouchableOpacity
        style={[estilos.boton, estilos.botonSms]}
        onPress={enviarCodigo}
        disabled={cargando || telefono.trim().length !== 10}
        activeOpacity={0.85}
      >
        {cargando ? (
          <ActivityIndicator color={colores.blanco} />
        ) : (
          <Text style={estilos.botonTexto}>{t('smsEnviarCodigo')}</Text>
        )}
      </TouchableOpacity>

      <View style={estilos.privacidad}>
        <IconoChip nombre="escudo" fondo={colores.primarioSuave} trazo={colores.primario} tamano={34} />
        <Text style={estilos.privacidadTexto}>{t('smsConsentimiento')}</Text>
      </View>
    </View>
  );
}

/**
 * Acceso sin correo ni contraseña.
 *
 * WhatsApp no deja escribirle primero a quien no te ha escrito, salvo con
 * plantilla aprobada. Así que se invierte: la app abre WhatsApp con el
 * mensaje ya redactado y el usuario solo toca "enviar". Menos pasos que
 * teclear un código, y sin trámites con Meta.
 *
 * iOS no usa este flujo (ver `LoginSms` arriba): Apple no acepta un login
 * que obligue a tener WhatsApp instalado.
 */
export default function LoginScreen() {
  const { t } = useIdioma();

  if (Platform.OS === 'ios') {
    return (
      <SafeAreaView style={estilos.pantalla}>
        <View style={estilos.contenido}>
          <View style={estilos.marca}>
            <Image source={require('../../assets/tappt-logo.png')} style={estilos.logoImagen} resizeMode="contain" />
            <Text style={estilos.nombreMarca}>Tappt</Text>
            <Text style={estilos.promesa}>{t('promesa')}</Text>
          </View>
          <LoginSms />
        </View>
      </SafeAreaView>
    );
  }

  return <LoginScreenWhatsapp />;
}

function LoginScreenWhatsapp() {
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
          alertar(t('codigoVencido'), t('codigoVencidoDetalle'));
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
      await abrirEnlace(nueva.enlaceWhatsapp);
    } catch (err) {
      alertar(t('noSePudo'), err.message);
      setEsperando(false);
    } finally {
      setCargando(false);
    }
  };

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.contenido}>
        <View style={estilos.marca}>
          <Image source={require('../../assets/tappt-logo.png')} style={estilos.logoImagen} resizeMode="contain" />
          <Text style={estilos.nombreMarca}>Tappt</Text>
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

            <TouchableOpacity onPress={() => abrirEnlace(sesion.enlaceWhatsapp)}>
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
  logoImagen: { width: 124, height: 124 },
  nombreMarca: { fontSize: 30, fontWeight: '700', color: colores.texto, letterSpacing: -0.7, marginTop: espacio.sm },
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
  enlace: { ...tipo.cuerpo, color: colores.primario, marginTop: espacio.lg, textAlign: 'center' },

  input: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.md,
    fontSize: 16,
    color: colores.texto,
    marginBottom: espacio.md,
    ...sombra,
  },
  botonSms: { marginTop: espacio.sm },
  error: { ...tipo.secundario, color: colores.error || '#DC2626', marginBottom: espacio.md, textAlign: 'center' },
});
