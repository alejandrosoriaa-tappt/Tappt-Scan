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

// Un tirador por esquina. Vive aparte para que su PanResponder se cree una
// sola vez y no en cada render del padre.
function Tirador({ indice, esquina, lienzo, onMover }) {
  const inicio = useRef({ x: 0, y: 0 });

  // El PanResponder se crea una sola vez, así que lee el estado actual a
  // través de refs en lugar de capturar los valores del primer render.
  const esquinaRef = useRef(esquina);
  const lienzoRef = useRef(lienzo);
  esquinaRef.current = esquina;
  lienzoRef.current = lienzo;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        inicio.current = { ...esquinaRef.current };
      },
      onPanResponderMove: (_evento, gesto) => {
        const { ancho, alto } = lienzoRef.current;
        if (!ancho || !alto) return;

        onMover(indice, {
          x: Math.min(1, Math.max(0, inicio.current.x + gesto.dx / ancho)),
          y: Math.min(1, Math.max(0, inicio.current.y + gesto.dy / alto)),
        });
      },
    })
  ).current;

  return (
    <View
      {...responder.panHandlers}
      style={[
        estilos.tirador,
        { left: esquina.x * lienzo.ancho - RADIO, top: esquina.y * lienzo.alto - RADIO },
      ]}
    >
      <View style={estilos.tiradorInterior} />
    </View>
  );
}

export default function RecorteScreen({ route, navigation }) {
  const { fotoBase64, esquinasIniciales } = route.params;
  const { refrescarCuenta } = useSesion();
  const { t } = useIdioma();

  const [esquinas, setEsquinas] = useState(esquinasIniciales || MARCO_COMPLETO);
  const [lienzo, setLienzo] = useState({ ancho: 1, alto: 1 });
  const [detectando, setDetectando] = useState(!esquinasIniciales);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [limite, setLimite] = useState(false);
  const [filtro, setFiltro] = useState('color');
  const [miniaturas, setMiniaturas] = useState({});
  const pasoProcesando = useProcesando(guardando);
  const textosProcesando = useMemo(
    () => [t('procesandoSubiendo'), t('procesandoEnderezando'), t('procesandoClasificando')],
    [t]
  );

  // Si la cámara en vivo ya venía con una detección de confianza alta
  // (EscanearScreen), se usa esa y no hace falta pedirle otra vez al
  // servidor — solo se detecta aquí cuando llega sin ella (foto importada,
  // o PDF reenviado que primero pasó por otra pantalla).
  useEffect(() => {
    if (esquinasIniciales) return;
    let cancelado = false;

    api
      .detectarBordes(fotoBase64)
      .then((resultado) => {
        if (cancelado) return;
        // Si el detector no confía en lo que encontró, NO se usa esa región
        // como recorte inicial — puede ser una zona chica y equivocada (una
        // luz de fondo, un reflejo), y aplicarla igual encoge la foto real
        // a esa región chica, dejando el documento borroso al guardar
        // (probado: 335×410px en vez de los ~1300×1900px que captura la
        // cámara). Sin confianza, se arranca del cuadro completo — el
        // usuario dibuja su propio recorte si quiere uno.
        setEsquinas(resultado.confiable ? resultado.esquinas : MARCO_COMPLETO);
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

  const moverEsquina = (indice, posicion) =>
    setEsquinas((previas) => previas.map((e, i) => (i === indice ? posicion : e)));

  const confirmar = async () => {
    setGuardando(true);
    try {
      const documento = await api.escanear(fotoBase64, 'image/jpeg', esquinas, filtro);
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
  const lados = esquinas.map((esquina, i) => {
    const siguiente = esquinas[(i + 1) % 4];
    const x1 = esquina.x * lienzo.ancho;
    const y1 = esquina.y * lienzo.alto;
    const x2 = siguiente.x * lienzo.ancho;
    const y2 = siguiente.y * lienzo.alto;
    const largo = Math.hypot(x2 - x1, y2 - y1);
    const angulo = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;

    return { key: i, left: x1, top: y1, width: largo, angulo };
  });

  return (
    <SafeAreaView style={estilos.pantalla} edges={['bottom']}>
      <View
        style={estilos.lienzo}
        onLayout={(e) =>
          setLienzo({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })
        }
      >
        <Image
          source={{ uri: `data:image/jpeg;base64,${fotoBase64}` }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
        />

        {lados.map((lado) => (
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

        {esquinas.map((esquina, indice) => (
          <Tirador
            key={indice}
            indice={indice}
            esquina={esquina}
            lienzo={lienzo}
            onMover={moverEsquina}
          />
        ))}

        {detectando ? (
          <View style={estilos.capaCargando}>
            <ActivityIndicator color="#FFFFFF" />
            <Text style={estilos.cargandoTexto}>{t('buscandoDocumento')}</Text>
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
            onPress={() => setFiltro(id)}
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
          onPress={() => setEsquinas(MARCO_COMPLETO)}
        >
          <Text style={estilos.botonSecundarioTexto}>{t('todaLaFoto')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={estilos.botonPrimario}
          onPress={confirmar}
          disabled={guardando || detectando}
        >
          <Text style={estilos.botonPrimarioTexto}>{t('enderezarGuardar')}</Text>
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
