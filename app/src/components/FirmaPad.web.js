import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIdioma } from '../i18n';
import { colores, espacio } from '../theme';

/**
 * Versión web del lienzo de firma.
 *
 * En móvil se usa un WebView con un canvas dentro; aquí ya estamos en el
 * navegador, así que se usa el canvas directo. React Native Web renderiza
 * `View` como un `div`, de modo que el ref da el nodo del DOM y podemos
 * montarle el canvas encima.
 *
 * Se escucha con Pointer Events, que unifican mouse, dedo y lápiz — así
 * funciona igual en una laptop que en un iPad.
 */
export default function FirmaPad({ visible, onCerrar, onFirmar }) {
  const { t } = useIdioma();
  const contenedor = useRef(null);
  const canvas = useRef(null);
  const huboTrazo = useRef(false);

  useEffect(() => {
    if (!visible || !contenedor.current) return;

    const nodo = contenedor.current;
    const lienzo = document.createElement('canvas');
    const escala = window.devicePixelRatio || 1;

    lienzo.style.width = '100%';
    lienzo.style.height = '100%';
    lienzo.style.display = 'block';
    lienzo.style.touchAction = 'none';
    lienzo.style.cursor = 'crosshair';
    nodo.appendChild(lienzo);

    const ctx = lienzo.getContext('2d');

    const ajustar = () => {
      const { width, height } = nodo.getBoundingClientRect();
      lienzo.width = Math.max(1, width * escala);
      lienzo.height = Math.max(1, height * escala);
      ctx.setTransform(escala, 0, 0, escala, 0, 0);
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0F172A';
    };
    ajustar();

    let dibujando = false;
    const punto = (e) => {
      const r = lienzo.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const abajo = (e) => {
      dibujando = true;
      huboTrazo.current = true;
      lienzo.setPointerCapture(e.pointerId);
      const p = punto(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const mover = (e) => {
      if (!dibujando) return;
      const p = punto(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const arriba = () => {
      dibujando = false;
    };

    lienzo.addEventListener('pointerdown', abajo);
    lienzo.addEventListener('pointermove', mover);
    lienzo.addEventListener('pointerup', arriba);
    lienzo.addEventListener('pointercancel', arriba);
    window.addEventListener('resize', ajustar);

    canvas.current = lienzo;

    return () => {
      window.removeEventListener('resize', ajustar);
      lienzo.remove();
      canvas.current = null;
      huboTrazo.current = false;
    };
  }, [visible]);

  const limpiar = () => {
    const lienzo = canvas.current;
    if (!lienzo) return;
    lienzo.getContext('2d').clearRect(0, 0, lienzo.width, lienzo.height);
    huboTrazo.current = false;
  };

  const exportar = () => {
    if (!canvas.current || !huboTrazo.current) return;
    onFirmar(canvas.current.toDataURL('image/png'));
    onCerrar();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar} transparent={false}>
      <SafeAreaView style={estilos.pantalla}>
        <View style={estilos.encabezado}>
          <TouchableOpacity onPress={onCerrar}>
            <Text style={estilos.cancelar}>{t('cancelar')}</Text>
          </TouchableOpacity>
          <Text style={estilos.titulo}>{t('firmaAqui')}</Text>
          <TouchableOpacity onPress={exportar}>
            <Text style={estilos.listo}>{t('listo')}</Text>
          </TouchableOpacity>
        </View>

        <View ref={contenedor} style={estilos.lienzo} />

        <TouchableOpacity onPress={limpiar} style={estilos.limpiar}>
          <Text style={estilos.limpiarTexto}>{t('borrarFirma')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: espacio.md,
  },
  cancelar: { color: colores.textoSuave, fontSize: 15 },
  titulo: { fontSize: 16, fontWeight: '600', color: colores.texto },
  listo: { color: colores.primario, fontSize: 15, fontWeight: '700' },
  lienzo: {
    flex: 1,
    marginHorizontal: espacio.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.divisor,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  limpiar: { padding: espacio.md, alignItems: 'center' },
  limpiarTexto: { color: colores.textoSuave, fontSize: 14 },
});
