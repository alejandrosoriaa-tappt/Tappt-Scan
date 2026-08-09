import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icono, { IconoChip } from './Icono';
import { useIdioma } from '../i18n';
import { colores, espacio, radio, tipo } from '../theme';

/**
 * Lo que se abre al tocar el botón central: la acción universal de captura.
 *
 * Cuatro caminos, ordenados por lo que queremos que la gente use. WhatsApp
 * va primero a propósito — es la vía rápida y la que define el producto.
 */
export default function HojaCaptura({ visible, onCerrar, onEscanear, onImportarArchivo, onImportarFoto }) {
  const { t } = useIdioma();

  const opciones = [
    {
      clave: 'whatsapp',
      icono: 'whatsapp',
      fondo: '#DDF7EA',
      trazo: '#128C7E',
      titulo: t('capturaWhatsapp'),
      detalle: t('capturaWhatsappDetalle'),
      accion: () => Linking.openURL('https://wa.me/'),
    },
    {
      clave: 'camara',
      icono: 'camara',
      fondo: colores.primarioSuave,
      trazo: colores.primario,
      titulo: t('capturaCamara'),
      detalle: t('capturaCamaraDetalle'),
      accion: onEscanear,
    },
    {
      clave: 'archivo',
      icono: 'documento',
      fondo: '#DDEBFB',
      trazo: '#2F80ED',
      titulo: t('capturaArchivo'),
      detalle: t('capturaArchivoDetalle'),
      accion: onImportarArchivo,
    },
    {
      clave: 'foto',
      icono: 'subir',
      fondo: '#FFEEDD',
      trazo: '#F08C2E',
      titulo: t('capturaFoto'),
      detalle: t('capturaFotoDetalle'),
      accion: onImportarFoto,
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <TouchableOpacity style={estilos.fondo} activeOpacity={1} onPress={onCerrar}>
        <SafeAreaView edges={['bottom']} style={estilos.hojaContenedor}>
          <TouchableOpacity activeOpacity={1} style={estilos.hoja}>
            <View style={estilos.asa} />

            <View style={estilos.encabezado}>
              <Text style={estilos.titulo}>{t('agregarDocumento')}</Text>
              <TouchableOpacity onPress={onCerrar} hitSlop={12}>
                <Icono nombre="cerrar" tamano={20} color={colores.textoSuave} />
              </TouchableOpacity>
            </View>

            {opciones.map((opcion) => (
              <TouchableOpacity
                key={opcion.clave}
                style={estilos.opcion}
                activeOpacity={0.7}
                onPress={() => {
                  onCerrar();
                  opcion.accion?.();
                }}
              >
                <IconoChip
                  nombre={opcion.icono}
                  fondo={opcion.fondo}
                  trazo={opcion.trazo}
                  tamano={44}
                />
                <View style={estilos.opcionTexto}>
                  <Text style={estilos.opcionTitulo}>{opcion.titulo}</Text>
                  <Text style={estilos.opcionDetalle}>{opcion.detalle}</Text>
                </View>
                <Icono nombre="derecha" tamano={18} color="#C4CDD5" />
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </SafeAreaView>
      </TouchableOpacity>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(13,27,42,0.35)', justifyContent: 'flex-end' },
  hojaContenedor: { backgroundColor: colores.superficie, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  hoja: { paddingHorizontal: espacio.md, paddingBottom: espacio.md },
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
    paddingVertical: espacio.md,
  },
  titulo: { ...tipo.seccion, color: colores.texto },
  opcion: { flexDirection: 'row', alignItems: 'center', paddingVertical: espacio.sm + 4 },
  opcionTexto: { flex: 1, marginLeft: espacio.md },
  opcionTitulo: { ...tipo.cuerpoFuerte, color: colores.texto },
  opcionDetalle: { ...tipo.menor, color: colores.textoSuave, marginTop: 2, lineHeight: 16 },
});
