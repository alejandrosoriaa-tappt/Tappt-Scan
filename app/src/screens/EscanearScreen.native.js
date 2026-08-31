import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBorradorEscaneo } from '../context/BorradorEscaneoContext';
import { useIdioma } from '../i18n';
import { alertar } from '../lib/alerta';
import { escanearDocumentoNativo } from '../lib/escanerNativo';
import { colores, espacio } from '../theme';

/**
 * En development builds y en la app distribuida, esta pantalla delega la
 * captura a los scanners oficiales: VisionKit en iOS y ML Kit en Android.
 * EscanearScreen.js sigue siendo el motor web existente.
 */
export default function EscanearScreenNativa({ navigation }) {
  const { t } = useIdioma();
  const borrador = useBorradorEscaneo();
  const [procesando, setProcesando] = useState(true);
  const lanzado = useRef(false);

  const abrirEscaner = useCallback(async () => {
    if (lanzado.current) return;
    lanzado.current = true;
    setProcesando(true);
    const agregandoAlLote = borrador.paginas.length > 0;

    try {
      const paginas = await escanearDocumentoNativo();
      if (!paginas) {
        navigation.goBack();
        return;
      }
      if (!paginas.length) throw new Error('sin_paginas');

      borrador.agregarPaginas(paginas);
      if (agregandoAlLote) navigation.goBack();
      else navigation.replace('Borrador');
    } catch (error) {
      alertar(t('noSePudo'), error.message);
      lanzado.current = false;
      setProcesando(false);
    }
  }, [borrador, navigation, t]);

  useEffect(() => {
    abrirEscaner();
  }, [abrirEscaner]);

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.centro}>
        {procesando ? <ActivityIndicator size="large" color={colores.primario} /> : null}
        <Text style={estilos.titulo}>
          {procesando ? t('abriendoEscaner') : t('escanerNoDisponible')}
        </Text>
        <Text style={estilos.detalle}>{t('escanerNativoDetalle')}</Text>
        {!procesando ? (
          <TouchableOpacity style={estilos.boton} onPress={abrirEscaner}>
            <Text style={estilos.botonTexto}>{t('intentarDeNuevo')}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={estilos.cancelar} onPress={() => navigation.goBack()}>
          <Text style={estilos.cancelarTexto}>{t('cancelar')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.xl },
  titulo: { color: '#FFFFFF', fontSize: 20, fontWeight: '700', marginTop: espacio.lg, textAlign: 'center' },
  detalle: { color: '#A9B4BE', fontSize: 15, lineHeight: 22, marginTop: espacio.sm, textAlign: 'center' },
  boton: { backgroundColor: colores.primario, borderRadius: 12, marginTop: espacio.lg, paddingHorizontal: espacio.xl, paddingVertical: espacio.md },
  botonTexto: { color: '#FFFFFF', fontWeight: '700' },
  cancelar: { marginTop: espacio.lg, padding: espacio.md },
  cancelarTexto: { color: '#A9B4BE' },
});
