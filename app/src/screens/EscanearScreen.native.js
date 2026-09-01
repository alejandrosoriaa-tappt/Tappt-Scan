import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBorradorEscaneo } from '../context/BorradorEscaneoContext';
import { useIdioma } from '../i18n';
import { alertar } from '../lib/alerta';
import { escanearDocumentoNativo } from '../lib/escanerNativo';
import { colores, espacio, radio, tipo } from '../theme';

/**
 * En development builds y en la app distribuida, esta pantalla delega la
 * captura a los scanners oficiales: VisionKit en iOS y ML Kit en Android.
 * EscanearScreen.js sigue siendo el motor web existente.
 */
export default function EscanearScreenNativa({ navigation }) {
  const { t } = useIdioma();
  const borrador = useBorradorEscaneo();
  const [procesando, setProcesando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const lanzado = useRef(false);

  const abrirEscaner = useCallback(async () => {
    if (lanzado.current) return;
    lanzado.current = true;
    setFallo(false);
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
      else navigation.replace('BorradorEscaneo');
    } catch (error) {
      alertar(t('noSePudo'), error.message);
      lanzado.current = false;
      setProcesando(false);
      setFallo(true);
    }
  }, [borrador, navigation, t]);

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.centro}>
        {procesando ? <ActivityIndicator size="large" color={colores.primario} /> : null}
        <Text style={estilos.titulo}>
          {procesando
            ? t('abriendoEscaner')
            : fallo
              ? t('escanerNoDisponible')
              : t('antesDeEscanear')}
        </Text>
        {procesando ? (
          <Text style={estilos.detalle}>{t('escanerNativoDetalle')}</Text>
        ) : (
          <View style={estilos.instrucciones}>
            <View style={estilos.paso}>
              <Text style={estilos.numero}>1</Text>
              <Text style={estilos.pasoTexto}>{t('instruccionEncuadra')}</Text>
            </View>
            <View style={estilos.paso}>
              <Text style={estilos.numero}>2</Text>
              <Text style={estilos.pasoTexto}>
                {t(Platform.OS === 'ios' ? 'instruccionManualIOS' : 'instruccionManualAndroid')}
              </Text>
            </View>
            <View style={estilos.paso}>
              <Text style={estilos.numero}>3</Text>
              <Text style={estilos.pasoTexto}>{t('instruccionTerminar')}</Text>
            </View>
          </View>
        )}
        {!procesando ? (
          <TouchableOpacity style={estilos.boton} onPress={abrirEscaner}>
            <Text style={estilos.botonTexto}>
              {fallo ? t('intentarDeNuevo') : t('abrirEscaner')}
            </Text>
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
  titulo: { ...tipo.tituloChico, color: colores.texto, marginTop: espacio.lg, textAlign: 'center' },
  detalle: { color: '#A9B4BE', fontSize: 15, lineHeight: 22, marginTop: espacio.sm, textAlign: 'center' },
  instrucciones: {
    width: '100%',
    maxWidth: 420,
    marginTop: espacio.lg,
    gap: espacio.md,
  },
  paso: { flexDirection: 'row', alignItems: 'center' },
  numero: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colores.primarioSuave,
    color: colores.primarioClaro,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 30,
    textAlign: 'center',
  },
  pasoTexto: { flex: 1, ...tipo.cuerpo, color: colores.textoSuave, lineHeight: 21, marginLeft: espacio.md },
  boton: {
    minWidth: 190,
    minHeight: 50,
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    marginTop: espacio.xl,
    paddingHorizontal: espacio.xl,
    paddingVertical: espacio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonTexto: { color: '#FFFFFF', fontWeight: '700' },
  cancelar: { marginTop: espacio.lg, padding: espacio.md },
  cancelarTexto: { color: '#A9B4BE' },
});
