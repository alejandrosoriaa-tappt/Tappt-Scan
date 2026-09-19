import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icono, { IconoChip } from './Icono';
import { useIdioma } from '../i18n';
import { colores, espacio, radio, tipo } from '../theme';

/**
 * Lo que ve el usuario cuando choca con el límite del plan gratis.
 *
 * Aparece justo cuando ya tomó la foto y quiere guardarla: es el momento de
 * mayor intención, así que un cuadro de error sería tirar la conversión.
 *
 * No menciona precios. Lleva a Ajustes, donde Android presenta únicamente
 * las opciones de compra administradas por Google Play.
 *
 * La foto NO se pierde: la hoja se cierra y la pantalla de recorte sigue
 * detrás con el documento listo para reintentar.
 */
export default function HojaLimite({ visible, onCerrar, onVerPlanes }) {
  const { t } = useIdioma();
  const abrirPlanes = () => {
    onCerrar();
    onVerPlanes?.();
  };

  const ventajas = [
    ['documento', t('ventajaIlimitado')],
    ['etiqueta', t('ventajaFirmas')],
    ['dinero', t('ventajaGastos')],
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <View style={estilos.fondo}>
        <SafeAreaView edges={['bottom']} style={estilos.hojaContenedor}>
          <View style={estilos.hoja}>
            <View style={estilos.asa} />

            <View style={estilos.encabezado}>
              <IconoChip
                nombre="reloj"
                fondo="rgba(245,158,11,0.18)"
                trazo={colores.alerta}
                tamano={52}
              />
              <Text style={estilos.titulo}>{t('limiteTitulo')}</Text>
              <Text style={estilos.detalle}>
                {t('limiteDetalle', { limite: cuenta?.escaneosLimite ?? 15 })}
              </Text>
            </View>

            <View style={estilos.ventajas}>
              {ventajas.map(([icono, texto]) => (
                <View key={icono} style={estilos.ventaja}>
                  <Icono nombre={icono} tamano={17} color={colores.primario} />
                  <Text style={estilos.ventajaTexto}>{texto}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={estilos.boton} onPress={abrirPlanes} activeOpacity={0.85}>
              <Icono nombre="estrella" tamano={20} color={colores.blanco} />
              <Text style={estilos.botonTexto}>{t('verPlanes')}</Text>
            </TouchableOpacity>

            <Text style={estilos.nota}>{t('limiteNota')}</Text>

            <TouchableOpacity onPress={onCerrar} style={estilos.ahoraNo}>
              <Text style={estilos.ahoraNoTexto}>{t('ahoraNo')}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: 'rgba(13,27,42,0.4)', justifyContent: 'flex-end' },
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

  encabezado: { alignItems: 'center', marginTop: espacio.lg },
  titulo: { ...tipo.tituloChico, color: colores.texto, marginTop: espacio.md, textAlign: 'center' },
  detalle: {
    ...tipo.cuerpo,
    color: colores.textoSuave,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: espacio.xs,
  },

  ventajas: { gap: espacio.md, marginTop: espacio.lg },
  ventaja: { flexDirection: 'row', alignItems: 'center' },
  ventajaTexto: { flex: 1, ...tipo.secundario, color: colores.texto, marginLeft: espacio.md },

  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.sm,
    backgroundColor: colores.primario,
    borderRadius: radio.lg,
    paddingVertical: espacio.md + 2,
    marginTop: espacio.lg,
  },
  botonTexto: { color: colores.blanco, fontSize: 16, fontWeight: '600' },

  nota: {
    ...tipo.menor,
    color: colores.textoSuave,
    textAlign: 'center',
    marginTop: espacio.md,
    lineHeight: 17,
  },
  ahoraNo: { alignItems: 'center', paddingVertical: espacio.md },
  ahoraNoTexto: { ...tipo.cuerpo, color: colores.textoSuave },
});
