import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';
import Svg, { Polygon } from 'react-native-svg';
import CamaraDoc from '../components/CamaraDoc';
import { api } from '../lib/api';
import { useIdioma } from '../i18n';
import { alertar } from '../lib/alerta';
import Icono from '../components/Icono';
import { colores, espacio } from '../theme';

const esWeb = Platform.OS === 'web';

const INTERVALO_DETECCION_MS = 1400;

// Los frames de detección van chicos a propósito: el detector no necesita
// resolución, y entre más chico más rápido el ciclo. La captura FINAL va
// aparte, a resolución completa (ver `capturar()`).
const ANCHO_DETECCION = 640;

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
  const [errorCamara, setErrorCamara] = useState(false);

  // Dos rectángulos distintos, y confundirlos era un bug real: `pantalla`
  // es el área que ocupa la vista de la cámara, y `cuadro` es el tamaño
  // real del frame que analiza el detector. El detector devuelve fracciones
  // del CUADRO; para pintarlas hay que convertirlas a píxeles de PANTALLA
  // considerando el recorte de `object-fit: cover`. Antes se pintaban como
  // fracciones de una caja interior con padding, así que el polígono salía
  // corrido y encogido respecto a lo que se veía.
  const [pantalla, setPantalla] = useState({ ancho: 1, alto: 1 });
  const [cuadro, setCuadro] = useState(null);

  const analizarFrame = useCallback(async () => {
    if (analizandoRef.current || !camara.current || !listaRef.current) return;
    analizandoRef.current = true;
    try {
      const foto = await camara.current.capturar({
        calidad: 0.5,
        maxAncho: ANCHO_DETECCION,
        rapido: true,
      });
      if (!foto) return;

      setCuadro({ ancho: foto.ancho, alto: foto.alto });
      const { esquinas, confiable } = await api.detectarBordes(foto.base64);

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
    if (!(esWeb || permiso?.granted) || capturando) return;
    const intervalo = setInterval(analizarFrame, INTERVALO_DETECCION_MS);
    return () => clearInterval(intervalo);
  }, [permiso?.granted, capturando, analizarFrame]);

  // En web no se usa el hook de permisos de expo-camera: `getUserMedia`
  // pide el permiso por su cuenta al montar, y `navigator.permissions` para
  // cámara no es confiable en Safari. Si el usuario lo niega, la cámara
  // avisa por `onError` y se muestra la misma pantalla de permiso.
  if (!esWeb && !permiso) {
    return (
      <View style={estilos.centrado}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (esWeb ? errorCamara : !permiso.granted) {
    return (
      <SafeAreaView style={estilos.centrado}>
        <Text style={estilos.permisoTitulo}>{t('permisoCamara')}</Text>
        <Text style={estilos.permisoTexto}>
          {t('permisoCamaraDetalle')}
        </Text>
        <TouchableOpacity
          style={estilos.botonPermiso}
          // En web no hay a quién "pedirle" de nuevo desde JS: si lo negaron,
          // se reintenta remontando la cámara (y el navegador vuelve a
          // preguntar si el usuario cambió el permiso del sitio).
          onPress={() => (esWeb ? setErrorCamara(false) : pedirPermiso())}
          activeOpacity={0.8}
        >
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
      // Sin `maxAncho`: la captura final va a la resolución completa que dé
      // el dispositivo. Es justo lo que faltaba — los frames de detección
      // son chicos a propósito, pero la foto que se guarda no debe serlo.
      const foto = await camara.current.capturar({ calidad: 0.92 });
      if (!foto) throw new Error('sin_camara');

      navigation.navigate('Recorte', {
        fotoBase64: foto.base64,
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

  /**
   * Convierte una esquina (fracción del cuadro analizado) a píxeles de
   * pantalla.
   *
   * El preview se dibuja con `object-fit: cover`: el cuadro se escala hasta
   * tapar la pantalla y lo que sobra se recorta por los lados o por arriba
   * y abajo. Sin deshacer ese recorte, las fracciones caen en el lugar
   * equivocado — es el bug que hacía que el marco verde apareciera corrido
   * respecto al documento (2026-08-13).
   */
  const aPantalla = (esquina) => {
    const escala = Math.max(pantalla.ancho / cuadro.ancho, pantalla.alto / cuadro.alto);
    const anchoVisible = cuadro.ancho * escala;
    const altoVisible = cuadro.alto * escala;
    return {
      x: (pantalla.ancho - anchoVisible) / 2 + esquina.x * anchoVisible,
      y: (pantalla.alto - altoVisible) / 2 + esquina.y * altoVisible,
    };
  };

  // Polígono relleno sobre el preview (benchmark CamScanner: el encuadre en
  // vivo se "ilumina" con una capa translúcida, no solo una línea).
  const puntos =
    deteccion.esquinas && cuadro && pantalla.ancho > 1
      ? deteccion.esquinas
          .map((e) => aPantalla(e))
          .map((p) => `${p.x},${p.y}`)
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
    <View
      style={estilos.pantalla}
      // El rect de la cámara es la pantalla completa: el overlay se mide
      // contra ESTE, no contra la caja con padding de adentro. Medirlo mal
      // era exactamente el bug del marco corrido.
      onLayout={(e) =>
        setPantalla({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })
      }
    >
      <CamaraDoc
        ref={camara}
        style={StyleSheet.absoluteFill}
        onLista={() => {
          listaRef.current = true;
        }}
        onError={() => setErrorCamara(true)}
      />

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
      ) : null}

      <SafeAreaView style={estilos.capa} edges={['top', 'bottom']} pointerEvents="box-none">
        <TouchableOpacity
          style={estilos.cerrar}
          onPress={() => navigation.goBack()}
          hitSlop={12}
          activeOpacity={0.8}
        >
          <Icono nombre="cerrar" tamano={20} color="#FFFFFF" />
        </TouchableOpacity>

        <View style={estilos.visor} pointerEvents="box-none">
          {puntos ? null : <View style={estilos.marco} />}

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
