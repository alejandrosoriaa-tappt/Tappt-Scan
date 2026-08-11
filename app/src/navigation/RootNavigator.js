import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import DashboardScreen from '../screens/DashboardScreen';
import DocumentosScreen from '../screens/DocumentosScreen';
import GastosScreen from '../screens/GastosScreen';
import CarpetasScreen from '../screens/CarpetasScreen';
import EscanearScreen from '../screens/EscanearScreen';
import AjustesScreen from '../screens/AjustesScreen';
import DocumentoScreen from '../screens/DocumentoScreen';
import EditorScreen from '../screens/EditorScreen';
import RecorteScreen from '../screens/RecorteScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';

import Icono from '../components/Icono';
import HojaCaptura from '../components/HojaCaptura';
import HojaLimite from '../components/HojaLimite';
import { importarArchivo, importarDeGaleria } from '../lib/importar';
import { alertar } from '../lib/alerta';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import { colores, espacio, tipo, sombra } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONOS = {
  Inicio: 'inicio',
  Documentos: 'documento',
  Gastos: 'dinero',
  Carpetas: 'carpeta',
};

/**
 * Barra inferior propia en lugar de la de React Navigation, porque el botón
 * central va elevado por encima de la barra y eso no se puede hacer con la
 * barra estándar.
 */
function BarraInferior({ state, navigation, onCapturar }) {
  const { t } = useIdioma();
  const izquierda = state.routes.slice(0, 2);
  const derecha = state.routes.slice(2);

  const boton = (ruta) => {
    const indice = state.routes.findIndex((r) => r.key === ruta.key);
    const activo = state.index === indice;

    return (
      <TouchableOpacity
        key={ruta.key}
        style={estilos.tab}
        activeOpacity={0.7}
        onPress={() => navigation.navigate(ruta.name)}
      >
        <Icono
          nombre={ICONOS[ruta.name]}
          tamano={22}
          color={activo ? colores.primario : '#98A5B0'}
          grosor={activo ? 2.1 : 1.8}
        />
        <Text style={[estilos.tabTexto, activo && estilos.tabTextoActivo]}>
          {t(ruta.name.toLowerCase())}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['bottom']} style={estilos.barraContenedor}>
      <View style={estilos.barra}>
        {izquierda.map(boton)}

        <View style={estilos.huecoCentral}>
          <TouchableOpacity style={estilos.fab} activeOpacity={0.85} onPress={onCapturar}>
            <Icono nombre="mas" tamano={26} color={colores.blanco} grosor={2.4} />
          </TouchableOpacity>
        </View>

        {derecha.map(boton)}
      </View>
    </SafeAreaView>
  );
}

function Tabs({ navigation }) {
  const { t } = useIdioma();
  const [hoja, setHoja] = useState(false);
  const [limite, setLimite] = useState(false);

  const importar = async (elegir) => {
    try {
      const documento = await elegir();
      if (documento) navigation.navigate('Documento', { documento });
    } catch (err) {
      if (err.message === 'limite_alcanzado') return setLimite(true);
      const mensajes = { drive_sin_conectar: t('driveSinConectar') };
      alertar(t('noSePudo'), mensajes[err.message] || err.message);
    }
  };

  return (
    <>
      <Tab.Navigator
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <BarraInferior {...props} onCapturar={() => setHoja(true)} />}
      >
        <Tab.Screen name="Inicio" component={DashboardScreen} />
        <Tab.Screen name="Documentos" component={DocumentosScreen} />
        <Tab.Screen name="Gastos" component={GastosScreen} />
        <Tab.Screen name="Carpetas" component={CarpetasScreen} />
      </Tab.Navigator>

      <HojaCaptura
        visible={hoja}
        onCerrar={() => setHoja(false)}
        onEscanear={() => navigation.navigate('Escanear')}
        onImportarArchivo={() => importar(importarArchivo)}
        onImportarFoto={() => importar(importarDeGaleria)}
      />

      <HojaLimite visible={limite} onCerrar={() => setLimite(false)} />
    </>
  );
}

export default function RootNavigator() {
  const { sesion, cuenta, cargando } = useSesion();
  const { t } = useIdioma();

  if (cargando) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator color={colores.primario} />
      </View>
    );
  }

  // Tres puertas: sin sesión → Login; con sesión pero sin Drive → Onboarding;
  // todo listo → la app.
  if (!sesion) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    );
  }

  if (cuenta && !cuenta.driveConectado) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      </Stack.Navigator>
    );
  }

  const encabezado = {
    headerTintColor: colores.primario,
    headerTitleStyle: { ...tipo.seccion, color: colores.texto },
    headerShadowVisible: false,
    headerStyle: { backgroundColor: colores.fondo },
  };

  return (
    <Stack.Navigator screenOptions={encabezado}>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="Documento" component={DocumentoScreen} options={{ title: t('documento') }} />
      <Stack.Screen name="Editor" component={EditorScreen} options={{ title: t('editar') }} />
      <Stack.Screen name="Recorte" component={RecorteScreen} options={{ title: t('ajustarRecorte') }} />
      <Stack.Screen name="Escanear" component={EscanearScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Ajustes" component={AjustesScreen} options={{ title: t('ajustes') }} />
    </Stack.Navigator>
  );
}

const estilos = StyleSheet.create({
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.fondo,
  },
  barraContenedor: {
    backgroundColor: colores.superficie,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colores.divisor,
  },
  barra: { flexDirection: 'row', alignItems: 'flex-end', height: 58 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', gap: 3 },
  tabTexto: { ...tipo.menor, fontSize: 11, color: '#98A5B0' },
  tabTextoActivo: { color: colores.primario, fontWeight: '600' },

  huecoCentral: { width: 72, alignItems: 'center', height: '100%' },
  fab: {
    position: 'absolute',
    top: -22,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
    ...sombra,
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowColor: colores.primario,
    elevation: 6,
  },
});
