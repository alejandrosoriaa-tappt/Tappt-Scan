import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { aplicarEstilosWeb } from './src/lib/estilosWeb';
import MarcoWeb from './src/components/MarcoWeb';
import { IdiomaProvider } from './src/i18n';
import { SesionProvider } from './src/context/SesionContext';
import { faltaConfiguracion } from './src/lib/supabase';
import ConfiguracionScreen from './src/screens/ConfiguracionScreen';
import RootNavigator from './src/navigation/RootNavigator';

// Se aplica antes del primer render para que no haya un parpadeo con los
// estilos del navegador. En móvil no hace nada.
aplicarEstilosWeb();

export default function App() {
  // Sin variables de entorno nada puede funcionar; mejor decirlo que
  // dejar una pantalla en blanco.
  if (faltaConfiguracion) {
    return (
      <SafeAreaProvider>
        <MarcoWeb>
          <ConfiguracionScreen />
        </MarcoWeb>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <MarcoWeb>
        <IdiomaProvider>
          <SesionProvider>
            <NavigationContainer>
              <StatusBar style="dark" />
              <RootNavigator />
            </NavigationContainer>
          </SesionProvider>
        </IdiomaProvider>
      </MarcoWeb>
    </SafeAreaProvider>
  );
}
