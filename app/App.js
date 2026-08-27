import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { aplicarEstilosWeb } from './src/lib/estilosWeb';
import MarcoWeb from './src/components/MarcoWeb';
import { IdiomaProvider } from './src/i18n';
import { SesionProvider } from './src/context/SesionContext';
import { BorradorEscaneoProvider } from './src/context/BorradorEscaneoContext';

import { BASE } from './src/lib/api';

// Sin la URL del backend no hay nada que hacer. En la web app `BASE` cae al
// propio origen (el backend sirve el bundle), así que esta pantalla solo
// aparece en nativo, que sí necesita la variable explícita.
const faltaConfiguracion = !BASE;
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
            <BorradorEscaneoProvider>
              <NavigationContainer>
                <StatusBar style="light" />
                <RootNavigator />
              </NavigationContainer>
            </BorradorEscaneoProvider>
          </SesionProvider>
        </IdiomaProvider>
      </MarcoWeb>
    </SafeAreaProvider>
  );
}
