import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { alertar } from '../lib/alerta';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import HojaLimite from '../components/HojaLimite';
import Icono from '../components/Icono';
import { colores, espacio } from '../theme';

// El guardado es UN solo request que en el servidor sube a Drive, endereza
// la perspectiva y clasifica con Claude, en ese orden — pero desde la app
// se ve como una sola llamada sin progreso. Estos pasos son cosméticos
// (avanzan solos por tiempo, no por eventos reales del servidor) para que
// la espera se sienta como el brief pide: procesamiento de IA explícito,
// no un spinner mudo. Los tiempos son aproximados a lo que de verdad tarda
// cada etapa en un documento típico.
const PASOS_PROCESANDO = [
  { icono: 'subir', ms: 900 },
  { icono: 'documento', ms: 1400 },
  { icono: 'rayo', ms: 100000 }, // se queda aquí hasta que el request responda
];

function useProcesando(activo) {
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    if (!activo) {
      setPaso(0);
      return;
    }
    let cancelado = false;
    let indice = 0;
    const avanzar = () => {
      if (cancelado || indice >= PASOS_PROCESANDO.length - 1) return;
      setTimeout(() => {
        if (cancelado) return;
        indice += 1;
        setPaso(indice);
        avanzar();
      }, PASOS_PROCESANDO[indice].ms);
    };
    avanzar();
    return () => {
      cancelado = true;
    };
  }, [activo]);

  return paso;
}

// Mismo orden que `services/imagen.js` FILTROS. La miniatura se genera del
// lado del servidor sobre la foto sin recortar (recortarla en el cliente
// necesitaría la misma homografía que ya hace el backend) — es una
// aproximación de cómo se va a ver, el filtro real se aplica sobre la
// versión ya recortada al guardar.
const FILTROS = [
  { id: 'color', etiqueta: 'original' },
  { id: 'gris', etiqueta: 'escalaGris' },
  { id: 'byn', etiqueta: 'blancoYNegro' },
  { id: 'mejorar', etiqueta: 'mejorar' },
];

const MARCO_COMPLETO = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

const RADIO = 14; // radio táctil del tirador

/**
 * `Image resizeMode="contain"` conserva la proporción de la foto y deja
 * bandas vacías cuando su aspect ratio no coincide con el del lienzo.
 * Las esquinas viven normalizadas contra la FOTO (0..1), no contra esas
 * bandas. Este rect es la posición/tamaño real donde React dibuja la foto.
 */
function calcularRectImagen(lienzo, imagen) {
  if (
    !lienzo?.ancho ||
    !lienzo?.alto ||
    !imagen?.ancho ||
    !imagen?.alto ||
    lienzo.ancho <= 1 ||
    lienzo.alto <= 1
  ) {
    return null;
  }

  const escala = Math.min(lienzo.ancho / imagen.ancho, lienzo.alto / imagen.alto);
  const ancho = imagen.ancho * escala;
  const alto = imagen.alto * escala;

  return {
    x: (lienzo.ancho - ancho) / 2,
    y: (lienzo.alto - alto) / 2,
    ancho,
    alto,
  };
}

function aLienzo(esquina, rectImagen) {
  return {
    x: rectImagen.x + esquina.x * rectImagen.ancho,
    y: rectImagen.y + esquina.y * rectImagen.alto,
  };
}

// Un tirador por esquina. Vive aparte para que su PanResponder se cree una
// sola vez y no en cada render del padre.
function Tirador({ indice, esquina, rectImagen, onMover }) {
  const inicio = useRef({ x: 0, y: 0 });

  // El PanResponder se crea una sola vez, así que lee el estado actual a
  // través de refs en lugar de capturar los valores del primer render.
  const esquinaRef = useRef(esquina);
  const rectRef = useRef(rectImagen);
  esquinaRef.current = esquina;
  rectRef.current = rectImagen;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        inicio.current = { ...esquinaRef.current };
      },
      onPanResponderMove: (_evento, gesto) => {
        const rect = rectRef.current;
        if (!rect?.ancho || !rect?.alto) return;

        // dx/dy están en píxeles de pantalla. Al dividir por el tamaño REAL
        // de la foto mostrada (no por todo el lienzo) el movimiento conserva
        // la misma coordenada normalizada que después consume el backend.
        onMover(indice, {
          x: Math.min(1, Math.max(0, inicio.current.x + gesto.dx / rect.ancho)),
          y: Math.min(1, Math.max(0, inicio.current.y + gesto.dy / rect.alto)),
        });
      },
    })
  ).current;

  if (!rectImagen) return null;
  const posicion = aLienzo(esquina, rectImagen);

  return (
    <View
      {...responder.panHandlers}
      style={[
        estilos.tirador,
        { left: posicion.x - RADIO, top: posicion.y - RADIO },
      ]}
    >
      <View style={estilos.tiradorInterior} />
    </View>
  );
}

export default function RecorteScreen({ route, navigation }) {
  const { fotoBase64, fotoAncho, fotoAlto, esquinasIniciales } = route.params;
  const { refrescarCuenta } = useSesion();
  const { t } = useIdioma();

  const [esquinas, setEsquinas] = useState(esquinasIniciales || MARCO_COMPLETO);
  const [lienzo, setLienzo] = useState({ ancho: 1, alto: 1 });
  const [tamanoImagen, setTamanoImagen] = useState(
    fotoAncho && fotoAlto ? { ancho: fotoAncho, alto: fotoAlto } : null
  );
  // La detección live sólo guía. La foto final SIEMPRE se vuelve a analizar
  // a resolución completa antes de aceptar un recorte.
  const [detectando, setDetectando] = useState(true);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [limite, setLimite] = useState(false);
  // "Mejorar" es el acabado de documento: papel mas blanco y texto con
  // contraste. Original sigue disponible para quien prefiera la foto fiel.
  const [filtro, setFiltro] = useState('mejorar');
  const [miniaturas, setMiniaturas] = useState({});
  const [vistaEnderezada, setVistaEnderezada] = useState(null);
  const [previsualizando, setPrevisualizando] = useState(false);
  const pasoProcesando = useProcesando(guardando);
  const textosProcesando = useMemo(
    () => [t('procesandoSubiendo'), t('procesandoEnderezando'), t('procesandoClasificando')],
    [t]
  );

  const rectImagen = useMemo(
    () => calcularRectImagen(lienzo, tamanoImagen),
    [lienzo, tamanoImagen]
  );

  // Regla dura del scanner: las esquinas del preview nunca son definitivas.
  // Siempre re-detectamos sobre la captura full-res; `esquinasIniciales`
  // sólo pueden servir como guía provisional mientras responde DocQuad.
  useEffect(() => {
    let cancelado = false;

    api
      .detectarBordes(fotoBase64)
      .then((resultado) => {
        if (cancelado) return;
        // Antes: sin confianza se tiraba CUALQUIER quad y se arrancaba del
        // cuadro completo — protegía contra un caso real (zona chica y
        // equivocada, ~335×410px sobre una foto de ~1300×1900px, que dejaba
        // el documento borroso si el usuario guardaba sin ajustar). Pero el
        // banco de fixtures mostró que "no confiable" no es "mal candidato":
        // granito-tapete, oscuro-documento, madera-libreta y granito-de-lado
        // marcan parcial con IoU 0.89-0.999 — casi perfectos, tirados igual.
        // Ahora se usa el quad que haya (confiable o no) como punto de
        // partida ARRASTRABLE, nunca un recorte aplicado solo. La red de
        // seguridad contra el caso chico/equivocado ya no es "no mostrar
        // nada": es el aviso de abajo más el botón "Toda la foto", que
        // resetea a MARCO_COMPLETO en un toque si el candidato está mal.
        setEsquinas(resultado.esquinas || MARCO_COMPLETO);
        if (!resultado.confiable) {
          setAviso(t('ajustaAMano'));
        }
      })
      .catch(() => !cancelado && setAviso(t('ajustaAMano')))
      .finally(() => !cancelado && setDetectando(false));

    return () => {
      cancelado = true;
    };
  }, [fotoBase64, esquinasIniciales]);

  // Las 4 miniaturas se piden una sola vez por foto — son solo vista
  // previa (chico, rápido), no bloquean el recorte ni el guardado.
  useEffect(() => {
    let cancelado = false;
    setMiniaturas({});

    FILTROS.forEach(({ id }) => {
      api
        .vistaFiltro(fotoBase64, id)
        .then(({ imagen }) => !cancelado && setMiniaturas((previas) => ({ ...previas, [id]: imagen })))
        .catch(() => {});
    });

    return () => {
      cancelado = true;
    };
  }, [fotoBase64]);

  const moverEsquina = (indice, posicion) => {
    setVistaEnderezada(null);
    setEsquinas((previas) => previas.map((e, i) => (i === indice ? posicion : e)));
  };

  const previsualizar = async () => {
    setPrevisualizando(true);
    try {
      const resultado = await api.vistaRecorte(fotoBase64, esquinas, filtro, 'auto');
      setVistaEnderezada(resultado.imagen);
    } catch (err) {
      alertar(t('noSePudo'), err.message);
    } finally {
      setPrevisualizando(false);
    }
  };

  const confirmar = async () => {
    setGuardando(true);
    try {
      const documento = await api.escanear(fotoBase64, 'image/jpeg', esquinas, filtro, 'auto');
      refrescarCuenta();
      navigation.replace('Documento', { documento });
    } catch (err) {
      // El límite no es un error: es el momento de ofrecer el upgrade. La
      // hoja se cierra y la foto sigue aquí, lista para reintentar.
      if (err.message === 'limite_alcanzado') {
        setLimite(true);
        return;
      }

      const mensajes = {
        drive_sin_conectar: t('driveSinConectar'),
        recorte_demasiado_chico: t('recorteChico'),
      };
      alertar(t('noSePudo'), mensajes[err.message] || err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Polígono del marco dibujado con cuatro barras finas entre esquinas.
  // IMPORTANTE: se proyecta al rect real de la foto dentro de `contain`.
  // Antes se multiplicaba por todo el lienzo y las bandas vacías desplazaban
  // las cuatro esquinas (visible claramente en Safari en iPhone).
  const lados = rectImagen
    ? esquinas.map((esquina, i) => {
        const siguiente = esquinas[(i + 1) % 4];
        const p1 = aLienzo(esquina, rectImagen);
        const p2 = aLienzo(siguiente, rectImagen);
        const largo = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const angulo = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;

        return { key: i, left: p1.x, top: p1.y, width: largo, angulo };
      })
    : [];

  return (
    <SafeAreaView style={estilos.pantalla} edges={['bottom']}>
      <View
        style={estilos.lienzo}
        onLayout={(e) =>
          setLienzo({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })
        }
      >
        <Image
          source={{ uri: vistaEnderezada || `data:image/jpeg;base64,${fotoBase64}` }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          // `fotoAncho/fotoAlto` vienen de la cámara y evitan esperar este
          // evento. `onLoad` queda como fallback para cualquier entrada que
          // llegue a Recorte sin esas dimensiones en el futuro.
          onLoad={(e) => {
            const source = e.nativeEvent?.source;
            if (source?.width > 0 && source?.height > 0) {
              setTamanoImagen({ ancho: source.width, alto: source.height });
            }
          }}
        />

        {!vistaEnderezada && lados.map((lado) => (
          <View
            key={lado.key}
            style={[
              estilos.lado,
              {
                left: lado.left,
                top: lado.top,
                width: lado.width,
                transform: [{ rotate: `${lado.angulo}deg` }],
              },
            ]}
          />
        ))}

        {!vistaEnderezada && esquinas.map((esquina, indice) => (
          <Tirador
            key={indice}
            indice={indice}
            esquina={esquina}
            rectImagen={rectImagen}
            onMover={moverEsquina}
          />
        ))}

        {detectando || previsualizando ? (
          <View style={estilos.capaCargando}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={estilos.cargandoTexto}>
              {previsualizando ? t('procesandoEnderezando') : t('buscandoDocumento')}
            </Text>
          </View>
        ) : null}

        {guardando ? (
          <View style={estilos.capaCargando}>
            <View style={estilos.iconoProcesando}>
              <Icono nombre={PASOS_PROCESANDO[pasoProcesando].icono} tamano={26} color="#FFFFFF" />
            </View>
            <ActivityIndicator color="#FFFFFF" style={{ marginTop: espacio.md }} />
            <Text style={estilos.cargandoTexto}>{textosProcesando[pasoProcesando]}</Text>
          </View>
        ) : null}
      </View>

      <Text style={estilos.pista}>
        {aviso || t('arrastraEsquinas')}
      </Text>

      <View style={estilos.filtros}>
        {FILTROS.map(({ id, etiqueta }) => (
          <TouchableOpacity
            key={id}
            style={estilos.filtroCelda}
            onPress={() => {
              setFiltro(id);
              setVistaEnderezada(null);
            }}
            activeOpacity={0.8}
          >
            <View style={[estilos.filtroMarco, filtro === id && estilos.filtroMarcoActivo]}>
              {miniaturas[id] ? (
                <Image source={{ uri: miniaturas[id] }} style={estilos.filtroImagen} resizeMode="cover" />
              ) : (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
              )}
            </View>
            <Text style={[estilos.filtroTexto, filtro === id && estilos.filtroTextoActivo]}>
              {t(etiqueta)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={estilos.acciones}>
        <TouchableOpacity
          style={estilos.botonSecundario}
          onPress={() => {
            if (vistaEnderezada) {
              setVistaEnderezada(null);
              setTamanoImagen(
                fotoAncho && fotoAlto ? { ancho: fotoAncho, alto: fotoAlto } : null
              );
            }
            else setEsquinas(MARCO_COMPLETO);
          }}
        >
          <Text style={estilos.botonSecundarioTexto}>
            {vistaEnderezada ? t('ajustarRecorte') : t('todaLaFoto')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={estilos.botonPrimario}
          onPress={vistaEnderezada ? confirmar : previsualizar}
          disabled={guardando || detectando || previsualizando}
        >
          <Text style={estilos.botonPrimarioTexto}>
            {vistaEnderezada ? t('guardarPdf') : t('enderezarGuardar')}
          </Text>
        </TouchableOpacity>
      </View>

      <HojaLimite visible={limite} onCerrar={() => setLimite(false)} />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#0B1220' },
  lienzo: { flex: 1, margin: espacio.md },
  lado: {
    position: 'absolute',
    height: 2,
    backgroundColor: colores.primario,
    transformOrigin: 'left center',
  },
  tirador: {
    position: 'absolute',
    width: RADIO * 2,
    height: RADIO * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiradorInterior: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    borderColor: colores.primario,
  },
  capaCargando: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cargandoTexto: { color: '#FFFFFF', fontSize: 13, marginTop: espacio.sm },
  iconoProcesando: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primario,
  },
  pista: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: espacio.lg,
  },
  filtros: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: espacio.md,
    paddingHorizontal: espacio.md,
    paddingTop: espacio.sm,
  },
  filtroCelda: { alignItems: 'center' },
  filtroMarco: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtroMarcoActivo: { borderColor: colores.primario },
  filtroImagen: { width: '100%', height: '100%' },
  filtroTexto: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 4 },
  filtroTextoActivo: { color: colores.primario, fontWeight: '600' },
  acciones: { flexDirection: 'row', gap: espacio.sm, padding: espacio.md },
  botonSecundario: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonSecundarioTexto: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  botonPrimario: {
    flex: 2,
    backgroundColor: colores.primario,
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonPrimarioTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
