import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Sin las variables, `createClient` lanza al importar el módulo y la app
// muere antes del primer render: pantalla en blanco y un error críptico en
// la consola. Se detecta aquí para poder mostrar una pantalla que explique
// qué falta.
export const faltaConfiguracion = !url || !anonKey;

if (faltaConfiguracion) {
  console.warn(
    '[config] Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Revisa app/.env.example.'
  );
}

export const supabase = createClient(
  url || 'https://sin-configurar.supabase.co',
  anonKey || 'sin-configurar',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: !faltaConfiguracion,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
