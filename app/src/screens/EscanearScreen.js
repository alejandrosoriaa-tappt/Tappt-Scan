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
import { AJUSTE_PREVIEW, proyectarEsquina } from '../lib/preview';

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

  // Panel de diagnóstico (temporal, solo web): mide la cámara real en el
  // dispositivo en vez de suponer. Se activa tocando el ícono ⓘ. Existe
  // porque lo que se PIDE en las constraints no es lo que se RECIBE.
  const [diag, setDiag] = useState(null);
  const [ultimoFrame, setUltimoFrame] = useState(null);
  const [ultimaCaptura, setUltimaCaptura] = useState(null);

  const analizarFrame = useCallback(async () => {
    if (analizandoRef.current || !camara.current || !listaRef.current) return;
    analizandoRef.current = true;
    try {
      const foto = await camara.current.capturar({
        calidad: 0.5,
        maxAncho: ANCHO_DETECCION,
      });
      if (!foto) return;

      setCuadro({ ancho: foto.ancho, alto: foto.alto });
      setUltimoFrame(foto);
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
        <Text style={estilos.permisoTexto}>{t('permisoCamaraDetalle')}</Text>
        <TouchableOpacity
          style={estilos.botonPermiso}
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
      setUltimaCaptura(foto);

      navigation.navigate('Recorte', {
        fotoBase64: foto.base64,
        // RecorteScreen necesita las dimensiones REALES de la foto para
        // proyectar correctamente las esquinas dentro de resizeMode="contain".
        // Sin esto, un marco normalizado contra la foto se dibuja contra todo
        // el lienzo y queda corrido cuando hay bandas vacías.
        fotoAncho: foto.ancho,
        fotoAlto: foto.alto,
        // Temporal hasta DocQuad: si el detector live venía con confianza
        // alta, se usa como sugerencia inicial. La arquitectura final volverá
        // a detectar siempre sobre la captura full-res antes del recorte.
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
   * pantalla, deshaciendo el encaje del preview.
   *
   * La lógica vive en `lib/preview.js` junto con el modo de ajuste, porque
   * el componente de cámara y esta proyección TIENEN que usar el mismo: si
   * se separan, el polígono sale corrido respecto al documento (ese fue el
   * bug del 2026-08-12).
   */
  const aPantalla = (esquina) => proyectarEsquina(esquina, cuadro, pantalla);

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

  // Relleno muy tenue a propósito (benchmark CamScanner): el quad confirma
  // el recorte, no debe tapar el documento — con 0.25 el papel se veía
  // teñido de verde y ya no se juzgaba si el borde estaba bien puesto.
  const rellenoPorEstado = {
    buscando: 'rgba(255,255,255,0.06)',
    parcial: 'rgba(255,255,255,0.10)',
    listo: 'rgba(124,245,192,0.14)',
  };

  const textoPorEstado = {
    buscando: t('alineaDocumento'),
    parcial: t('sigueAjustando'),
    listo: t('listoParaCapturar'),
  };

  return (
    <View
      style={estilos.pantalla}
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
            strokeWidth={2}
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

        {esWeb ? (
          <TouchableOpacity
            style={estilos.diagBoton}
            onPress={() => setDiag(diag ? null : camara.current?.diagnostico?.() || {})}
            hitSlop={12}
            activeOpacity={0.8}
          >
            <Text style={estilos.diagBotonTexto}>ⓘ</Text>
          </TouchableOpacity>
        ) : null}

        {diag ? (
          <View style={estilos.diagPanel} pointerEvents="none">
            <Text style={estilos.diagLinea}>
              STREAM {diag.videoWidth}×{diag.videoHeight}
            </Text>
            {diag.track ? (
              <Text style={estilos.diagLinea}>
                TRACK {diag.track.width}×{diag.track.height} @{diag.track.frameRate || '?'}fps{'\n'}
                facing: {diag.track.facingMode || '—'} · ajuste: {diag.ajuste || '—'}
              </Text>
            ) : null}
            {/* Sin esto no hay forma de saber si el navegador siquiera ofreció
                una ultra-wide o control de zoom: en iOS suele exponer una sola
                "Back Camera" virtual y ninguna capability de zoom, y entonces
                el único campo visual que se puede ganar es el que se recuperó
                al dejar de recortar con `cover`. */}
            <Text style={estilos.diagLinea}>
              CÁMARA {diag.label || '—'}
              {'\n'}zoom:{' '}
              {diag.capabilities?.zoom
                ? `${diag.capabilities.zoom.min}–${diag.capabilities.zoom.max} · ahora ${
                    diag.track?.zoom ?? '?'
                  }`
                : 'no expuesto'}
            </Text>
            <Text style={estilos.diagLinea}>
              DETECTOR{' '}
              {ultimoFrame
                ? `${ultimoFrame.ancho}×${ultimoFrame.alto} · ${Math.round(ultimoFrame.bytes / 1024)}KB · ${ultimoFrame.ms}ms`
                : '—'}
            </Text>
            <Text style={estilos.diagLinea}>
              CAPTURA{' '}
              {ultimaCaptura
                ? `${ultimaCaptura.ancho}×${ultimaCaptura.alto} · ${(
                    (ultimaCaptura.ancho * ultimaCaptura.alto) /
                    1e6
                  ).toFixed(2)}MP · ${Math.round(ultimaCaptura.bytes / 1024)}KB · ${ultimaCaptura.ms}ms`
                : 'aún no capturas'}
            </Text>
            <Text style={estilos.diagLineaTenue}>{diag.navegador}</Text>
          </View>
        ) : null}

        <View style={estilos.visor} pointerEvents="box-none">
          {/* Ya no hay marco punteado grande: además de ensuciar el visor,
              le decía al usuario "llena esto", que es justo lo contrario de
              lo que queremos (acercarse recorta el documento y le quita
              margen al detector). La única guía visual es el quad. */}
          {/* La pista solo aparece cuando NO hay quad. En cuanto el polígono
              está en pantalla él mismo dice lo que hay que saber, y el texto
              encima solo estorba (en el benchmark no existe). */}
          {puntos ? null : (
            <View style={estilos.pistaCaja} pointerEvents="none">
              <Text style={estilos.marcoTexto}>{textoPorEstado[deteccion.estado]}</Text>
            </View>
          )}
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
  diagBoton: {
    position: 'absolute',
    top: espacio.md,
    right: espacio.md,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagBotonTexto: { color: '#FFFFFF', fontSize: 18 },
  diagPanel: {
    position: 'absolute',
    top: espacio.md + 48,
    left: espacio.md,
    right: espacio.md,
    zIndex: 9,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 10,
    padding: espacio.sm,
    gap: 4,
  },
  diagLinea: { color: '#7CF5C0', fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  diagLineaTenue: { color: 'rgba(255,255,255,0.45)', fontSize: 9 },
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