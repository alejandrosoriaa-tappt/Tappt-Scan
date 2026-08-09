import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { IdiomaProvider } from './src/i18n';
import { SesionProvider } from './src/context/SesionContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <IdiomaProvider>
        <SesionProvider>
          <NavigationContainer>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </SesionProvider>
      </IdiomaProvider>
    </SafeAreaProvider>
  );
}
