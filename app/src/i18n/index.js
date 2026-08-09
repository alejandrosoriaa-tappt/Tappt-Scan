import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { TEXTOS, IDIOMAS, IDIOMA_POR_DEFECTO } from './textos';

const CLAVE = 'tappt-scan.idioma';
const IdiomaContext = createContext(null);

// Idioma del sistema, si lo hablamos. Un iPhone en francés cae a español
// hasta que exista esa traducción.
function idiomaDelSistema() {
  const codigo = getLocales()?.[0]?.languageCode;
  return IDIOMAS.includes(codigo) ? codigo : IDIOMA_POR_DEFECTO;
}

export function IdiomaProvider({ children }) {
  const [idioma, setIdiomaEstado] = useState(idiomaDelSistema);
  const [cargado, setCargado] = useState(false);

  // La elección explícita del usuario gana sobre el idioma del sistema.
  useEffect(() => {
    AsyncStorage.getItem(CLAVE)
      .then((guardado) => {
        if (guardado && IDIOMAS.includes(guardado)) setIdiomaEstado(guardado);
      })
      .finally(() => setCargado(true));
  }, []);

  const setIdioma = useCallback(async (nuevo) => {
    if (!IDIOMAS.includes(nuevo)) return;
    setIdiomaEstado(nuevo);
    await AsyncStorage.setItem(CLAVE, nuevo);
  }, []);

  const t = useCallback(
    (clave, valores = {}) => {
      const plantilla =
        TEXTOS[idioma]?.[clave] ?? TEXTOS[IDIOMA_POR_DEFECTO][clave] ?? clave;

      return plantilla.replace(/\{(\w+)\}/g, (_todo, nombre) =>
        valores[nombre] !== undefined ? String(valores[nombre]) : ''
      );
    },
    [idioma]
  );

  return (
    <IdiomaContext.Provider value={{ idioma, setIdioma, t, cargado, idiomas: IDIOMAS }}>
      {children}
    </IdiomaContext.Provider>
  );
}

export const useIdioma = () => useContext(IdiomaContext);
export { TEXTOS, IDIOMAS };
