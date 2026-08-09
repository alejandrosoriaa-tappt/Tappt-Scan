import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import DashboardScreen from '../screens/DashboardScreen';
import EscanearScreen from '../screens/EscanearScreen';
import DriveScreen from '../screens/DriveScreen';
import AjustesScreen from '../screens/AjustesScreen';
import DocumentoScreen from '../screens/DocumentoScreen';
import { colores } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const ICONOS = {
  Inicio: '🏠',
  Escanear: '📷',
  Drive: '📁',
  Ajustes: '⚙️',
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colores.primario,
        tabBarInactiveTintColor: colores.textoSuave,
        tabBarIcon: ({ color }) => (
          <Text style={{ fontSize: 18, color }}>{ICONOS[route.name]}</Text>
        ),
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
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Documento"
        component={DocumentoScreen}
        options={{ title: 'Documento', headerTintColor: colores.primario }}
      />
    </Stack.Navigator>
  );
}
