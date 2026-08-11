import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icono from './Icono';
import { useIdioma } from '../i18n';
import { colores, espacio, radio, tipo } from '../theme';

/**
 * Menú "Más" genérico (brief, sección 8: acciones secundarias). Una lista
 * de `{ id, icono, texto, destructiva }` — cada pantalla decide sus
 * propias acciones, este componente solo pone el mismo look en todas:
 * hoja oscura, iconos outline, destructivas en rojo, el resto en el
 * color de texto normal (el verde se reserva para CTAs primarios, no
 * para cada fila de un menú).
 */
export default function HojaAcciones({ visible, titulo, acciones, onCerrar, onElegir }) {
  const { t } = useIdioma();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar}>
      <TouchableOpacity style={estilos.fondo} activeOpacity={1} onPress={onCerrar}>
        <SafeAreaView edges={['bottom']} style={estilos.hojaContenedor}>
          <TouchableOpacity activeOpacity={1}>
            <View style={estilos.hoja}>
              <View style={estilos.asa} />
              {titulo ? <Text style={estilos.titulo}>{titulo}</Text> : null}

              {acciones.map((accion, i) => (
                <TouchableOpacity
                  key={accion.id}
                  style={[estilos.fila, i === acciones.length - 1 && estilos.filaUltima]}
                  onPress={() => onElegir(accion.id)}
                  activeOpacity={0.7}
                >
                  <Icono
                    nombre={accion.icono}
                    tamano={19}
                    color={accion.destructiva ? colores.peligro : colores.texto}
                  />
                  <Text style={[estilos.filaTexto, accion.destructiva && estilos.filaTextoDestructiva]}>
                    {accion.texto}
                  </Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity onPress={onCerrar} style={estilos.cancelar}>
                <Text style={estilos.cancelarTexto}>{t('cancelar')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </SafeAreaView>
      </TouchableOpacity>
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
  titulo: {
    ...tipo.secundario,
    fontWeight: '700',
    color: colores.textoSuave,
    textAlign: 'center',
    marginTop: espacio.md,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.md,
    paddingVertical: espacio.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.divisor,
    marginTop: espacio.sm,
  },
  filaUltima: { borderBottomWidth: 0 },
  filaTexto: { ...tipo.cuerpo, color: colores.texto },
  filaTextoDestructiva: { color: colores.peligro },
  cancelar: { alignItems: 'center', paddingVertical: espacio.md, marginTop: espacio.xs },
  cancelarTexto: { ...tipo.cuerpo, color: colores.textoSuave },
});
