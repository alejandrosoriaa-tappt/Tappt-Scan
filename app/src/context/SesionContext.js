import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

const SesionContext = createContext(null);

export function SesionProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [cuenta, setCuenta] = useState(null);
  const [cargando, setCargando] = useState(true);

  const refrescarCuenta = useCallback(async () => {
    try {
      setCuenta(await api.cuenta());
    } catch (err) {
      console.warn('[sesion] no se pudo cargar la cuenta', err.message);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSesion(nueva);
      if (!nueva) setCuenta(null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sesion) refrescarCuenta();
  }, [sesion, refrescarCuenta]);

  const cerrarSesion = () => supabase.auth.signOut();

  return (
    <SesionContext.Provider value={{ sesion, cuenta, cargando, refrescarCuenta, cerrarSesion }}>
      {children}
    </SesionContext.Provider>
  );
}

export const useSesion = () => useContext(SesionContext);
