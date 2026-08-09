import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useIdioma } from '../i18n';
import { colores, espacio } from '../theme';

export default function LoginScreen() {
  const { t } = useIdioma();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registrando, setRegistrando] = useState(false);
  const [cargando, setCargando] = useState(false);

  const enviar = async () => {
    if (!email || !password) {
      Alert.alert(t('faltanDatos'), t('faltanDatosDetalle'));
      return;
    }

    setCargando(true);
    const { error } = registrando
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);

    if (error) {
      Alert.alert(t('noPudimosEntrar'), error.message);
    } else if (registrando) {
      Alert.alert(t('revisaCorreo'), t('revisaCorreoDetalle'));
    }
  };

  return (
    <SafeAreaView style={estilos.pantalla}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={estilos.contenido}
      >
        <Text style={estilos.logo}>TapptScan</Text>
        <Text style={estilos.promesa}>
          {t('promesa')}
        </Text>

        <TextInput
          style={estilos.input}
          placeholder={t('correo')}
          placeholderTextColor={colores.textoSuave}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={estilos.input}
          placeholder={t('contrasena')}
          placeholderTextColor={colores.textoSuave}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          style={[estilos.boton, cargando && estilos.botonInactivo]}
          onPress={enviar}
          disabled={cargando}
          activeOpacity={0.8}
        >
          <Text style={estilos.botonTexto}>
            {cargando ? t('espera') : registrando ? t('crearCuenta') : t('entrar')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setRegistrando(!registrando)}>
          <Text style={estilos.alterno}>
            {registrando ? t('yaTienesCuenta') : t('eresNuevo')}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { flex: 1, justifyContent: 'center', padding: espacio.lg },
  logo: { fontSize: 34, fontWeight: '800', color: colores.primario, textAlign: 'center' },
  promesa: {
    fontSize: 14,
    color: colores.textoSuave,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: espacio.sm,
    marginBottom: espacio.xl,
  },
  input: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 12,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.md,
    fontSize: 16,
    color: colores.texto,
    marginBottom: espacio.sm,
  },
  boton: {
    backgroundColor: colores.primario,
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
    marginTop: espacio.sm,
  },
  botonInactivo: { opacity: 0.6 },
  botonTexto: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  alterno: {
    color: colores.primario,
    textAlign: 'center',
    marginTop: espacio.lg,
    fontSize: 14,
  },
});
