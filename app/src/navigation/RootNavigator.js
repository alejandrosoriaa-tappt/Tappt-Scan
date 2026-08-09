import React from 'react';
import { Text, View, ActivityIndicator, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import DashboardScreen from '../screens/DashboardScreen';
import EscanearScreen from '../screens/EscanearScreen';
import DriveScreen from '../screens/DriveScreen';
import AjustesScreen from '../screens/AjustesScreen';
import DocumentoScreen from '../screens/DocumentoScreen';
import EditorScreen from '../screens/EditorScreen';
import RecorteScreen from '../screens/RecorteScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import { colores } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONOS = { Inicio: '🏠', Escanear: '📷', Drive: '📁', Ajustes: '⚙️' };

function Tabs() {
  const { t } = useIdioma();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.textoSuave,
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 18, color }}>{ICONOS[route.name]}</Text>
        ),
        // Las rutas conservan su nombre interno en español; solo la
        // etiqueta visible se traduce.
        tabBarLabel: t(route.name.toLowerCase()),
      })}
    >
      <Tab.Screen name="Inicio" component={DashboardScreen} />
      <Tab.Screen name="Escanear" component={EscanearScreen} />
      <Tab.Screen name="Drive" component={DriveScreen} />
      <Tab.Screen name="Ajustes" component={AjustesScreen} />
    </Tab.Navigator>
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

  // Tres puertas: sin sesión → login; con sesión pero sin Drive conectado →
  // onboarding; todo listo → la app.
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

  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Documento"
        component={DocumentoScreen}
        options={{ title: t('documento'), headerTintColor: colores.primario }}
      />
      <Stack.Screen
        name="Editor"
        component={EditorScreen}
        options={{ title: t('editar'), headerTintColor: colores.primario }}
      />
      <Stack.Screen
        name="Recorte"
        component={RecorteScreen}
        options={{ title: t('ajustarRecorte'), headerTintColor: colores.primario }}
      />
    </Stack.Navigator>
  );
}

const estilos = StyleSheet.create({
  centrado: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colores.fondo },
});
