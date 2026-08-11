import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Image, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icono from './Icono';
import { api } from '../lib/api';
import { alertar } from '../lib/alerta';
import { useIdioma } from '../i18n';
import { colores, espacio, radio, tipo } from '../theme';

/**
 * Biblioteca de firmas — lo primero que se ve al tocar la herramienta de
 * firma. Si ya hay firmas guardadas, elegir una es un toque; si no, lleva
 * derecho a dibujar o importar. Toda firma nueva se guarda sola, sin
 * preguntar — es lo que se espera de una "biblioteca" (brief, prompt 6).
 */
export default function HojaFirmas({ visible, firmas, cargando, onCerrar, onElegir, onDibujar, onImportar, onBorrar }) {
  const { t } = useIdioma();
  const [gestionando, setGestionando] = useState(false);
  const [borrando, setBorrando] = useState(null);

  const borrar = async (id) => {
    setBorrando(id);
    try {
      await onBorrar(id);
    } catch (err) {
      alertar(t('noSePudo'), err.message);
    } finally {
      setBorrando(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={estilos.fondo}>
        <SafeAreaView edges={['bottom']} style={estilos.hojaContenedor}>
          <View style={estilos.hoja}>
            <View style={estilos.asa} />

            <View style={estilos.encabezado}>
              <Text style={estilos.titulo}>{t('tusFirmas')}</Text>
              {firmas?.length ? (
                <TouchableOpacity onPress={() => setGestionando((v) => !v)}>
                  <Text style={estilos.gestionar}>
                    {gestionando ? t('listo') : t('gestionarFirmas')}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {cargando ? (
              <ActivityIndicator color={colores.primario} style={{ marginVertical: espacio.lg }} />
            ) : firmas?.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={estilos.lista}>
                {firmas.map((firma) => (
                  <TouchableOpacity
                    key={firma.id}
                    style={estilos.miniatura}
                    activeOpacity={0.8}
                    onPress={() => (gestionando ? null : onElegir(firma))}
                    disabled={gestionando}
                  >
                    <Image source={{ uri: firma.datos }} style={estilos.miniaturaImagen} resizeMode="contain" />
                    {gestionando ? (
                      <TouchableOpacity
                        style={estilos.borrarBoton}
                        onPress={() => borrar(firma.id)}
                        disabled={borrando === firma.id}
                      >
                        {borrando === firma.id ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Icono nombre="cerrar" tamano={12} color="#FFFFFF" />
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <Text style={estilos.vacio}>{t('sinFirmasGuardadas')}</Text>
            )}

            <View style={estilos.acciones}>
              <TouchableOpacity style={estilos.accion} onPress={onDibujar} activeOpacity={0.85}>
                <Icono nombre="etiqueta" tamano={18} color={colores.primario} />
                <Text style={estilos.accionTexto}>{t('dibujarFirma')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={estilos.accion} onPress={onImportar} activeOpacity={0.85}>
                <Icono nombre="subir" tamano={18} color={colores.primario} />
                <Text style={estilos.accionTexto}>{t('importarFirma')}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity onPress={onCerrar} style={estilos.cancelar}>
              <Text style={estilos.cancelarTexto}>{t('cancelar')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  hojaContenedor: {
    backgroundColor: colores.superficie,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  hoja: { paddingHorizontal: espacio.lg, paddingBottom: espacio.md },
  asa: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colores.divisor,
    alignSelf: 'center',
    marginTop: espacio.sm,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espacio.lg,
  },
  titulo: { ...tipo.tituloChico, color: colores.texto },
  gestionar: { ...tipo.secundario, fontWeight: '600', color: colores.primario },

  lista: { marginTop: espacio.md },
  miniatura: {
    width: 96,
    height: 72,
    backgroundColor: '#E9EDF2',
    borderRadius: radio.md,
    marginRight: espacio.sm,
    overflow: 'visible',
  },
  miniaturaImagen: { width: '100%', height: '100%' },
  borrarBoton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colores.peligro,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vacio: {
    ...tipo.secundario,
    color: colores.textoSuave,
    textAlign: 'center',
    marginVertical: espacio.lg,
  },

  acciones: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.lg },
  accion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.xs,
    backgroundColor: colores.primarioSuave,
    borderRadius: radio.lg,
    paddingVertical: espacio.md,
  },
  accionTexto: { ...tipo.secundario, fontWeight: '700', color: colores.primarioClaro },

  cancelar: { alignItems: 'center', paddingVertical: espacio.md },
  cancelarTexto: { ...tipo.cuerpo, color: colores.textoSuave },
});
