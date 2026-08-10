import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { api } from '../lib/api';
import { leerToken, guardarToken, borrarToken } from '../lib/sesion';
import { useIdioma } from '../i18n';

const SesionContext = createContext(null);

export function SesionProvider({ children }) {
  const [token, setToken] = useState(null);
  const [cuenta, setCuenta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const { idioma } = useIdioma();

  const refrescarCuenta = useCallback(async () => {
    try {
      setCuenta(await api.cuenta());
    } catch (err) {
      // Token vencido o revocado: se cierra la sesión en vez de dejar la
      // app en un limbo donde todo falla.
      if (['token_invalido', 'falta_token', 'usuario_no_encontrado'].includes(err.message)) {
        await borrarToken();
        setToken(null);
        setCuenta(null);
      }
    }
  }, []);

  useEffect(() => {
    leerToken()
      .then((guardado) => setToken(guardado))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (token) refrescarCuenta();
  }, [token, refrescarCuenta]);

  // El bot de WhatsApp debe hablar el mismo idioma que la app.
  useEffect(() => {
    if (!token || !cuenta || cuenta.idioma === idioma) return;

    api
      .preferencias({ idioma })
      .then(() => setCuenta((previa) => ({ ...previa, idioma })))
      .catch((err) => console.warn('[sesion] no se pudo guardar el idioma', err.message));
  }, [token, cuenta, idioma]);

  /**
   * Al volver de WhatsApp se recarga la cuenta.
   *
   * Es lo que hace que pagar se sienta instantáneo: el usuario paga en el
   * navegador, regresa a la app y su plan ya está arriba, sin reiniciar
   * nada ni tocar un botón de "actualizar".
   */
  const estadoApp = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nuevo) => {
      const volvio = estadoApp.current.match(/inactive|background/) && nuevo === 'active';
      estadoApp.current = nuevo;
      if (volvio && token) refrescarCuenta();
    });
    return () => sub.remove();
  }, [token, refrescarCuenta]);

  const entrarConToken = useCallback(async (nuevo) => {
    await guardarToken(nuevo);
    setToken(nuevo);
  }, []);

  const cerrarSesion = useCallback(async () => {
    await borrarToken();
    setToken(null);
    setCuenta(null);
  }, []);

  return (
    <SesionContext.Provider
      value={{ sesion: token, cuenta, cargando, refrescarCuenta, entrarConToken, cerrarSesion }}
    >
      {children}
    </SesionContext.Provider>
  );
}

export const useSesion = () => useContext(SesionContext);
