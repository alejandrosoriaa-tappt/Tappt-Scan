import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useIdioma } from '../i18n';
import { colores, espacio, radio } from '../theme';

// Azul por default: la firma se distingue de una fotocopia en blanco y
// negro y es el color que más se usa en documentos reales.
export const COLORES_FIRMA = [
  { nombre: 'azul', hex: '#2563EB' },
  { nombre: 'negro', hex: '#0F172A' },
  { nombre: 'rojo', hex: '#DC2626' },
  { nombre: 'verde', hex: '#18B875' },
];
export const GROSORES_FIRMA = [1.5, 2.5, 4];

// Lienzo de firma dentro de un WebView: el trazo a dedo se maneja mucho
// mejor con canvas que reconstruyéndolo con vistas nativas. Devuelve un PNG
// con fondo transparente, listo para incrustarse en el PDF.
const HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html,body{margin:0;height:100%;background:#fff;overscroll-behavior:none;touch-action:none}
  canvas{display:block;width:100%;height:100%}
</style></head><body>
<canvas id="c"></canvas>
<script>
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  const escala = window.devicePixelRatio || 1;

  function ajustar() {
    c.width = c.clientWidth * escala;
    c.height = c.clientHeight * escala;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2563EB';
  }
  ajustar();

  let dibujando = false;
  let huboTrazo = false;

  function punto(e) {
    const r = c.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }

  c.addEventListener('touchstart', (e) => {
    e.preventDefault();
    dibujando = true;
    huboTrazo = true;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  });

  c.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!dibujando) return;
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  });

  c.addEventListener('touchend', (e) => {
    e.preventDefault();
    dibujando = false;
  });

  function mensaje(datos) {
    window.ReactNativeWebView.postMessage(JSON.stringify(datos));
  }

  window.limpiar = function () {
    ctx.clearRect(0, 0, c.width, c.height);
    huboTrazo = false;
  };

  window.exportar = function () {
    if (!huboTrazo) return mensaje({ tipo: 'vacio' });
    mensaje({ tipo: 'firma', datos: c.toDataURL('image/png') });
  };

  // Cambiar color/grosor a medio trazo no debe perder lo ya dibujado —
  // solo se aplica al siguiente trazo, igual que en la versión web.
  window.setColor = function (hex) { ctx.strokeStyle = hex; };
  window.setGrosor = function (px) { ctx.lineWidth = px; };
</script></body></html>`;

export default function FirmaPad({ visible, onCerrar, onFirmar }) {
  const { t } = useIdioma();
  const web = useRef(null);
  const [color, setColorState] = useState(COLORES_FIRMA[0].hex);
  const [grosor, setGrosorState] = useState(GROSORES_FIRMA[1]);

  const recibir = (evento) => {
    const mensaje = JSON.parse(evento.nativeEvent.data);
    if (mensaje.tipo === 'firma') {
      onFirmar(mensaje.datos);
      onCerrar();
    }
  };

  const elegirColor = (hex) => {
    setColorState(hex);
    web.current?.injectJavaScript(`window.setColor(${JSON.stringify(hex)});true;`);
  };

  const elegirGrosor = (px) => {
    setGrosorState(px);
    web.current?.injectJavaScript(`window.setGrosor(${px});true;`);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <SafeAreaView style={estilos.pantalla}>
        <View style={estilos.encabezado}>
          <TouchableOpacity onPress={onCerrar}>
            <Text style={estilos.cancelar}>{t('cancelar')}</Text>
          </TouchableOpacity>
          <Text style={estilos.titulo}>{t('firmaAqui')}</Text>
          <TouchableOpacity onPress={() => web.current?.injectJavaScript('window.exportar();true;')}>
            <Text style={estilos.listo}>{t('listo')}</Text>
          </TouchableOpacity>
        </View>

        <View style={estilos.lienzo}>
          <WebView
            ref={web}
            source={{ html: HTML }}
            onMessage={recibir}
            scrollEnabled={false}
            style={estilos.web}
          />
        </View>

        <View style={estilos.controles}>
          <View style={estilos.swatches}>
            {COLORES_FIRMA.map((c) => (
              <TouchableOpacity
                key={c.hex}
                onPress={() => elegirColor(c.hex)}
                style={[
                  estilos.swatch,
                  { backgroundColor: c.hex },
                  color === c.hex && estilos.swatchActivo,
                ]}
              />
            ))}
          </View>

          <View style={estilos.grosores}>
            {GROSORES_FIRMA.map((g, i) => (
              <TouchableOpacity
                key={g}
                onPress={() => elegirGrosor(g)}
                style={[estilos.grosorBoton, grosor === g && estilos.grosorBotonActivo]}
              >
                <View
                  style={{
                    width: 6 + i * 4,
                    height: 6 + i * 4,
                    borderRadius: 99,
                    backgroundColor: grosor === g ? color : colores.textoTerciario,
                  }}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => web.current?.injectJavaScript('window.limpiar();true;')}
          style={estilos.limpiar}
        >
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
    overflow: 'hidden',
  },
  web: { flex: 1, backgroundColor: '#FFFFFF' },
  controles: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: espacio.md,
    paddingTop: espacio.md,
  },
  swatches: { flexDirection: 'row', gap: espacio.sm },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActivo: { borderColor: colores.texto },
  grosores: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    backgroundColor: colores.superficie,
    borderRadius: radio.chip,
    paddingHorizontal: espacio.sm,
    paddingVertical: espacio.xs,
  },
  grosorBoton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  grosorBotonActivo: { backgroundColor: colores.superficieElevada, borderRadius: 14 },
  limpiar: { padding: espacio.md, alignItems: 'center' },
  limpiarTexto: { color: colores.textoSuave, fontSize: 14 },
});
