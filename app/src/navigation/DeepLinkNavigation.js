import React, { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { api } from '../lib/api';
import { useSesion } from '../context/SesionContext';
import RootNavigator from './RootNavigator';

const CLAVE_DOCUMENTO = 'tappt-scan.documento-pendiente';
const RUTA_DOCUMENTO = /^tapptscan:\/\/documento\/([a-zA-Z0-9_-]{1,128})$/;

function idDesdeUrl(url) {
  const encontrado = String(url || '').match(RUTA_DOCUMENTO);
  return encontrado ? encontrado[1] : null;
}

export default function DeepLinkNavigation() {
  const navigationRef = useNavigationContainerRef();
  const { sesion, cuenta, cargando } = useSesion();
  const [lista, setLista] = useState(false);
  const [documentoId, setDocumentoId] = useState(null);
  const abriendo = useRef(false);

  useEffect(() => {
    const conservar = async (url) => {
      const id = idDesdeUrl(url);
      if (!id) return;
      await AsyncStorage.setItem(CLAVE_DOCUMENTO, id);
      setDocumentoId(id);
    };
    AsyncStorage.getItem(CLAVE_DOCUMENTO).then(setDocumentoId);
    Linking.getInitialURL().then(conservar);
    const sub = Linking.addEventListener('url', ({ url }) => conservar(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!lista || cargando || !sesion || !cuenta?.driveConectado || !documentoId || abriendo.current) return;
    abriendo.current = true;
    api.documento(documentoId)
      .then(async (documento) => {
        await AsyncStorage.removeItem(CLAVE_DOCUMENTO);
        setDocumentoId(null);
        navigationRef.navigate('Documento', { documento });
      })
      .catch((err) => console.warn('[deep-link] no se pudo abrir el documento', err.message))
      .finally(() => { abriendo.current = false; });
  }, [lista, cargando, sesion, cuenta?.driveConectado, documentoId, navigationRef]);

  return (
    <NavigationContainer ref={navigationRef} onReady={() => setLista(true)}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export { idDesdeUrl };
