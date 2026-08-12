import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Polygon } from 'react-native-svg';
import { api } from '../lib/api';
import { useIdioma } from '../i18n';
import { alertar } from '../lib/alerta';
import Icono from '../components/Icono';
import { colores, espacio } from '../theme';

// expo-camera 15 en web solo entiende la prop vieja `type` para elegir
// cámara (su capa web nunca se actualizó a la prop `facing` que sí usa
// nativo) — sin esto abre la frontal por default en cualquier navegador.
// Ver node_modules/expo-camera/build/utils/props.js: ConversionTables
// solo mapea "type", `facing` se cuela sin traducir y se pierde.
const propsCamaraTrasera = Platform.OS === 'web' ? { type: 'back' } : {};

// En web, foto.base64 de expo-camera viene con el prefijo "data:...,"
// incluido (a diferencia de nativo, que da base64 puro). Ver el mismo
// fix en la captura final más abajo.
function base64Puro(valor) {
  return valor.startsWith('data:') ? valor.slice(valor.indexOf(',') + 1) : valor;
}

const INTERVALO_DETECCION_MS = 1400;

// Fórmula del cordón (shoelace) en fracción del cuadro — mismo criterio
// que services/imagen.js usa en el servidor para decidir si un
// cuadrilátero es "toda la foto" y por lo tanto no es una detección real.
function area(esquinas) {
  let suma = 0;
  for (let i = 0; i < esquinas.length; i++) {
    const a = esquinas[i];
    const b = esquinas[(i + 1) % esquinas.length];
    suma += a.x * b.y - b.x * a.y;
  }
  return Math.abs(suma) / 2;
}

// Cámara de respaldo: el camino principal sigue siendo WhatsApp, pero la app
// debe poder escanear por sí sola (requisito de tiendas, guía 4.2 de Apple).
export default function EscanearScreen({ navigation }) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const { t } = useIdioma();
  const [capturando, setCapturando] = useState(false);
  const camara = useRef(null);

  // Detección en vivo: mientras el usuario encuadra, se manda una foto de
  // baja calidad al mismo detector que ya usa Recorte, cada ~1.4s, y el
  // overlay refleja el resultado. Tres estados, de menos a más confianza:
  // 'buscando' (nada aún o detección de baja confianza), 'parcial'
  // (esquinas detectadas pero el propio detector las marca poco fiables)
  // y 'listo' (4 esquinas con confianza alta — igual que usaría Recorte
  // para no pedir ajuste manual).
  const [deteccion, setDeteccion] = useState({ estado: 'buscando', esquinas: null });
  const analizandoRef = useRef(false);
  const listaRef = useRef(false); // la cámara ya montó su primer frame
  const [lienzo, setLienzo] = useState({ ancho: 1, alto: 1 });

  const analizarFrame = useCallback(async () => {
    if (analizandoRef.current || !camara.current || !listaRef.current) return;
    analizandoRef.current = true;
    try {
      // Calidad baja a propósito: esto no es la foto final, solo alimenta
      // al detector — cuanto más chica, más rápido el ciclo.
      const foto = await camara.current.takePictureAsync({ quality: 0.15, base64: true, skipProcessing: true });
      const { esquinas, confiable } = await api.detectarBordes(base64Puro(foto.base64));

      setDeteccion({
        esquinas,
        estado: !esquinas || area(esquinas) > 0.97 ? 'buscando' : confiable ? 'listo' : 'parcial',
      });
    } catch {
      // Un fallo de un solo frame no debe tumbar el overlay — se queda en
      // el último estado conocido y se reintenta en el próximo ciclo.
    } finally {
      analizandoRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!permiso?.granted || capturando) return;
    const intervalo = setInterval(analizarFrame, INTERVALO_DETECCION_MS);
    return () => clearInterval(intervalo);
  }, [permiso?.granted, capturando, analizarFrame]);

  if (!permiso) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!permiso.granted) {
    return (
      <SafeAreaView style={estilos.centrado}>
        <Text style={estilos.permisoTitulo}>{t('permisoCamara')}</Text>
        <Text style={estilos.permisoTexto}>
          {t('permisoCamaraDetalle')}
        </Text>
        <TouchableOpacity style={estilos.botonPermiso} onPress={pedirPermiso} activeOpacity={0.8}>
          <Text style={estilos.botonPermisoTexto}>{t('permitirCamara')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: espacio.md }}>
          <Text style={estilos.permisoTexto}>{t('cancelar')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const capturar = async () => {
    if (!camara.current || capturando) return;

    setCapturando(true);
    try {
      // La foto no se sube aquí: primero pasa por el recorte, que es quien
      // la manda ya enderezada.
      const foto = await camara.current.takePictureAsync({ quality: 0.8, base64: true });

      // Ver base64Puro() arriba: en web, expo-camera regresa el base64 con
      // el prefijo de data URL ya incluido; en nativo viene puro.
      navigation.navigate('Recorte', {
        fotoBase64: base64Puro(foto.base64),
        // Si ya había una detección de confianza alta de los frames en
        // vivo, se la pasamos a Recorte para que abra directo con las
        // esquinas correctas en vez de tener que detectar otra vez.
        esquinasIniciales: deteccion.estado === 'listo' ? deteccion.esquinas : null,
      });
    } catch (err) {
      alertar(t('noSePudo'), err.message);
    } finally {
      setCapturando(false);
    }
  };

  // Puntos del polígono detectado, en píxeles del lienzo — mismo criterio
  // que usa RecorteScreen para su marco ajustable, pero aquí se rellena en
  // vez de solo dibujar el contorno (benchmark CamScanner: el encuadre en
  // vivo se "ilumina" con una capa translúcida, no solo una línea).
  const puntos =
    deteccion.esquinas && lienzo.ancho > 1
      ? deteccion.esquinas
          .map((e) => `${e.x * lienzo.ancho},${e.y * lienzo.alto}`)
          .join(' ')
      : null;

  const colorPorEstado = {
    buscando: 'rgba(255,255,255,0.5)',
    parcial: 'rgba(255,255,255,0.85)',
    listo: colores.primario,
  };

  const rellenoPorEstado = {
    buscando: 'rgba(255,255,255,0.08)',
    parcial: 'rgba(255,255,255,0.16)',
    listo: 'rgba(24,184,117,0.25)', // colores.primario en rgba — SVG no acepta variables ni conAlfa()
  };

  const textoPorEstado = {
    buscando: t('alineaDocumento'),
    parcial: t('sigueAjustando'),
    listo: t('listoParaCapturar'),
  };

  return (
    <View style={estilos.pantalla}>
      <CameraView
        ref={camara}
        style={StyleSheet.absoluteFill}
        facing="back"
        {...propsCamaraTrasera}
        onCameraReady={() => {
          listaRef.current = true;
        }}
      />

      <SafeAreaView style={estilos.capa} edges={['top', 'bottom']}>
        <TouchableOpacity
          style={estilos.cerrar}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          activeOpacity={0.8}
        >
          <Icono nombre="cerrar" tamano={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View
          style={estilos.visor}
          onLayout={(e) =>
            setLienzo({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })
          }
        >
          {puntos ? (
            <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
              <Polygon
                points={puntos}
                fill={rellenoPorEstado[deteccion.estado]}
                stroke={colorPorEstado[deteccion.estado]}
                strokeWidth={3}
                strokeLinejoin="round"
              />
            </Svg>
          ) : (
            <View style={estilos.marco} />
          )}

          <View style={estilos.pistaCaja} pointerEvents="none">
            <Text style={estilos.marcoTexto}>{textoPorEstado[deteccion.estado]}</Text>
          </View>
        </View>

        <View style={estilos.controles}>
          <TouchableOpacity
            style={estilos.obturador}
            activeOpacity={0.8}
            onPress={capturar}
            disabled={capturando}
          >
            <View style={[estilos.obturadorInterior, capturando && estilos.obturadorActivo]} />
          </TouchableOpacity>
          <Text style={estilos.ayuda}>
            {capturando ? t('tomandoFoto') : t('tambienWhatsapp')}
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#0B1220' },
  capa: { flex: 1 },
  cerrar: {
    position: 'absolute',
    top: espacio.md,
    left: espacio.md,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centrado: {
    flex: 1,
    backgroundColor: '#0B1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: espacio.lg,
  },
  permisoTitulo: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  permisoTexto: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: espacio.sm,
  },
  botonPermiso: {
    backgroundColor: colores.primario,
    borderRadius: 12,
    paddingVertical: espacio.md,
    paddingHorizontal: espacio.xl,
    marginTop: espacio.lg,
  },
  botonPermisoTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  visor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.lg },
  marco: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcoTexto: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  pistaCaja: {
    position: 'absolute',
    bottom: espacio.md,
    left: espacio.lg,
    right: espacio.lg,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingVertical: espacio.xs + 2,
  },
  controles: { alignItems: 'center', paddingBottom: espacio.lg, paddingHorizontal: espacio.lg },
  obturador: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  obturadorInterior: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
  obturadorActivo: { backgroundColor: 'rgba(255,255,255,0.5)' },
  ayuda: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: espacio.md,
  },
});
