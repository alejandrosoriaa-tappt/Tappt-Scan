          esquinas: confiable && esquinas && area(esquinas) <= 0.97 ? esquinas : null,
import { View, Text, Image, TouchableOpacity, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';
import CamaraDoc from '../components/CamaraDoc';
import { api } from '../lib/api';
import { useIdioma } from '../i18n';
import { alertar } from '../lib/alerta';
import Icono from '../components/Icono';
import ContornoQuad from '../components/ContornoQuad';
import { colores, espacio } from '../theme';
import { AJUSTE_PREVIEW, proyectarEsquina } from '../lib/preview';
import { useBorradorEscaneo } from '../context/BorradorEscaneoContext';
const { actualizarEstabilizador, estadoInicial } = require('../lib/estabilizadorQuad');

const esWeb = Platform.OS === 'web';

const INTERVALO_DETECCION_MS = 800;

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
  const borrador = useBorradorEscaneo();
  const [capturando, setCapturando] = useState(false);
  const camara = useRef(null);

  // Detección en vivo: mientras el usuario encuadra, se manda una foto de
  // baja calidad al mismo detector que ya usa Recorte, cada ~0.8s. La capa
  // temporal exige consenso antes de reflejar el resultado. Tres estados:
  // 'buscando' (nada aún o detección de baja confianza), 'parcial'
  // (esquinas detectadas pero el propio detector las marca poco fiables)
  // y 'listo' (4 esquinas con confianza alta — igual que usaría Recorte
  // para no pedir ajuste manual).
  const [deteccion, setDeteccion] = useState(estadoInicial);
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
  const [ultimaDeteccion, setUltimaDeteccion] = useState(null);

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
      const inicioHttp = Date.now();
      const respuesta = await api.detectarBordes(foto.base64);
      const { esquinas, confiable } = respuesta;

      // Lo que responde el detector, tal cual, para el panel ⓘ. Sin esto el
      // panel solo medía el frame local y había que adivinar por qué no
      // aparecía el polígono; ahora dice quién contestó y por qué descartó.
      setUltimaDeteccion({
        fuente: respuesta.fuente,
        dibujada: respuesta.fuenteDibujada || null,
        confiable: Boolean(confiable),
        razon: respuesta.razon || respuesta.razonDocQuad || null,
        acuerdo: respuesta.acuerdoIoU,
        area: esquinas ? area(esquinas) : null,
        areaOpenCv: respuesta.diagnostico?.opencv?.area ?? null,
        razonOpenCv: respuesta.diagnostico?.opencv?.razon ?? null,
        marcoCompleto: respuesta.diagnostico?.opencv?.marcoCompleto ?? null,
        minZ: respuesta.diagnostico?.docquad?.minConfidenceZ ?? null,
        httpMs: Date.now() - inicioHttp,
      });

      // Cada respuesta aislada puede señalar otra página, el teclado o un
      // reflejo. No se dibuja hasta verla repetida y, una vez bloqueada, un
      // salto incompatible no reemplaza al documento que ya seguíamos.
      setDeteccion((anterior) =>
        actualizarEstabilizador(anterior, {
          esquinas: esquinas && area(esquinas) <= 0.97 ? esquinas : null,
          confiable,
        })
      );
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
        // Se pasa el mejor quad disponible —confiable o parcial— como punto
        // de partida, nunca null salvo que el detector no haya visto nada
        // ('buscando'). Recorte SIEMPRE vuelve a detectar sobre la captura
        // full-res antes de aceptar nada (ver ese useEffect), así que esto
        // es solo la sugerencia mientras responde esa redetección — no un
        // recorte aplicado. Antes se tiraba cualquier quad no confiable
        // (madera-libreta, granito-tapete, etc. con IoU 0.9+ terminaban
        // igual que si el detector no hubiera visto nada); ahora el usuario
        // ajusta en vez de dibujar las 4 esquinas desde cero.
        esquinasIniciales: deteccion.estado !== 'buscando' ? deteccion.esquinas : null,
        modoLote: true,
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
      ? deteccion.esquinas.map((e) => aPantalla(e))
      : null;

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
        <ContornoQuad
          puntos={puntos}
          color={colores.primario}
          relleno="rgba(24,184,117,0.18)"
          grosor={2}
        />
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
            {/* La respuesta REAL del detector. `DETECTOR` de arriba mide el
                frame local; esto mide lo que contestó el servidor. */}
            <Text style={estilos.diagLinea}>
              DETECCIÓN{' '}
              {ultimaDeteccion
                ? `${ultimaDeteccion.fuente} · ${
                    ultimaDeteccion.confiable ? 'confiable' : 'parcial/nada'
                  } · ${ultimaDeteccion.httpMs}ms\n` +
                  `dibuja=${ultimaDeteccion.dibujada || '—'} ` +
                  `area=${
                    ultimaDeteccion.area != null ? ultimaDeteccion.area.toFixed(3) : '—'
                  } acuerdo=${
                    ultimaDeteccion.acuerdo != null ? ultimaDeteccion.acuerdo.toFixed(2) : '—'
                  } minZ=${
                    ultimaDeteccion.minZ != null ? ultimaDeteccion.minZ.toFixed(2) : '—'
                  }\n` +
                  `razon=${ultimaDeteccion.razon || '—'}\n` +
                  `opencv: area=${
                    ultimaDeteccion.areaOpenCv != null
                      ? ultimaDeteccion.areaOpenCv.toFixed(3)
                      : '—'
                  } ${ultimaDeteccion.razonOpenCv || 'ok'}${
                    ultimaDeteccion.marcoCompleto ? ' · marcoCompleto' : ''
                  }\n` +
                  `tracking: ${deteccion.fase} · coincidencias=${deteccion.coincidencias} · fallos=${deteccion.fallos}`
                : 'aún no responde'}
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
            style={estilos.loteLateral}
            onPress={() => borrador.paginas.length && navigation.navigate('BorradorEscaneo')}
            disabled={!borrador.paginas.length}
          >
            {borrador.paginas.length ? (
              <View>
                <Image source={{ uri: borrador.paginas[borrador.paginas.length - 1].vista }} style={estilos.loteMiniatura} />
                <View style={estilos.loteContador}>
                  <Text style={estilos.loteContadorTexto}>{borrador.paginas.length}</Text>
                </View>
              </View>
            ) : (
              <Icono nombre="mosaico" tamano={24} color="rgba(255,255,255,0.45)" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={estilos.obturador}
            activeOpacity={0.8}
            onPress={capturar}
            disabled={capturando}
          >
            <View style={[estilos.obturadorInterior, capturando && estilos.obturadorActivo]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[estilos.hecho, !borrador.paginas.length && estilos.hechoInactivo]}
            onPress={() => navigation.navigate('BorradorEscaneo')}
            disabled={!borrador.paginas.length}
          >
            <Text style={estilos.hechoTexto}>{t('hecho')}</Text>
          </TouchableOpacity>
        </View>
        <Text style={estilos.ayuda}>
          {capturando ? t('tomandoFoto') : t('modoLoteAyuda')}
        </Text>
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
  controles: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espacio.xl },
  loteLateral: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  loteMiniatura: { width: 48, height: 58, borderRadius: 6, borderWidth: 2, borderColor: colores.primario },
  loteContador: { position: 'absolute', right: -8, top: -8, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  loteContadorTexto: { color: '#FFFFFF', fontWeight: '800', fontSize: 11 },
  hecho: { width: 72, height: 42, borderRadius: 8, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center' },
  hechoInactivo: { opacity: 0.25 },
  hechoTexto: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
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
    marginTop: espacio.sm,
    marginBottom: espacio.md,
    paddingHorizontal: espacio.lg,
  },
});
