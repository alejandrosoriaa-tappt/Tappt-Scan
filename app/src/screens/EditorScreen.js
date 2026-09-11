import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  Linking,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import FirmaPad, { COLORES_FIRMA } from '../components/FirmaPad';
import HojaFirmas from '../components/HojaFirmas';
import VistaMosaico from '../components/VistaMosaico';
import Icono from '../components/Icono';
import useCargar from '../hooks/useCargar';
import { api } from '../lib/api';
import { alertar, alertarConBotones } from '../lib/alerta';
import { useIdioma } from '../i18n';
import { colores, espacio, radio } from '../theme';

const EMOJIS = ['✅', '❌', '⭐', '🔴', '➡️', '📌', '✍️', '⚠️'];

// Herramientas: qué se coloca al tocar el documento.
// Los sellos de EMOJIS se estampan en el PDF; estos son la interfaz.
const HERRAMIENTAS = [
  { id: 'texto', icono: 'documento' },
  // Firma queda deliberadamente fuera de la interfaz mientras evaluamos
  // un flujo profesional. El código se conserva para retomarlo después.
  { id: 'emoji', icono: 'estrella' },
  { id: 'imagen', icono: 'camara' },
  { id: 'tapar', icono: 'recibo' },
];

// Permite corregir la posición de una anotación ya colocada. Conserva las
// coordenadas normalizadas (0..1) que espera el backend al generar el PDF.
function AnotacionMovible({ anotacion, indice, lienzo, onMover, onSeleccionar, seleccionada, style, children }) {
  const anotacionRef = useRef(anotacion);
  const lienzoRef = useRef(lienzo);
  const inicio = useRef({ x: 0, y: 0 });
  anotacionRef.current = anotacion;
  lienzoRef.current = lienzo;

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        onSeleccionar(indice);
        inicio.current = { x: anotacionRef.current.x, y: anotacionRef.current.y };
      },
      onPanResponderMove: (_evento, gesto) => {
        const actual = lienzoRef.current;
        if (!actual.ancho || !actual.alto) return;
        onMover(indice, {
          x: Math.min(0.96, Math.max(0, inicio.current.x + gesto.dx / actual.ancho)),
          y: Math.min(0.96, Math.max(0, inicio.current.y + gesto.dy / actual.alto)),
        });
      },
    })
  ).current;

  return (
    <View
      {...responder.panHandlers}
      style={[
        estilos.anotacionMovible,
        { left: anotacion.x * lienzo.ancho, top: anotacion.y * lienzo.alto },
        seleccionada && estilos.anotacionSeleccionada,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const limitar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

function contenerFirma(anotacion, lienzo) {
  const ancho = anotacion.ancho || 0.35;
  const alto = (ancho * lienzo.ancho / 2) / lienzo.alto;
  const radianes = (anotacion.rotacion || 0) * Math.PI / 180;
  const cajaAncho = (
    Math.abs(Math.cos(radianes)) * ancho * lienzo.ancho
    + Math.abs(Math.sin(radianes)) * alto * lienzo.alto
  ) / lienzo.ancho;
  const cajaAlto = (
    Math.abs(Math.sin(radianes)) * ancho * lienzo.ancho
    + Math.abs(Math.cos(radianes)) * alto * lienzo.alto
  ) / lienzo.alto;
  const margenX = 22 / lienzo.ancho;
  const margenY = 22 / lienzo.alto;
  const centroX = limitar(
    anotacion.x + ancho / 2,
    cajaAncho / 2 + margenX,
    1 - cajaAncho / 2 - margenX
  );
  const centroY = limitar(
    anotacion.y + alto / 2,
    cajaAlto / 2 + margenY,
    1 - cajaAlto / 2 - margenY
  );
  return { ...anotacion, x: centroX - ancho / 2, y: centroY - alto / 2 };
}

// La firma se manipula directamente, como un objeto sobre el papel. El cuerpo
// la mueve, la esquina inferior derecha cambia su tamaño y el tirador superior
// derecho la rota. Así la persona no tiene que traducir botones +/− a una
// transformación espacial que puede hacer con el dedo.
function FirmaManipulable({ anotacion, indice, lienzo, onCambiar, onSeleccionar, onEliminar, seleccionada, children }) {
  const anotacionRef = useRef(anotacion);
  const lienzoRef = useRef(lienzo);
  const inicioMover = useRef({ x: 0, y: 0 });
  const inicioEscala = useRef({ ancho: 0.35, x: 0, y: 0, distancia: 1, listo: false });
  const centroRotacion = useRef({ x: 0, y: 0, angulo: 0, rotacion: 0, listo: false });
  const contenedorRef = useRef(null);
  anotacionRef.current = anotacion;
  lienzoRef.current = lienzo;

  const mover = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_e, gesto) => Math.abs(gesto.dx) + Math.abs(gesto.dy) > 3,
    onPanResponderGrant: () => {
      onSeleccionar(indice);
      inicioMover.current = { x: anotacionRef.current.x, y: anotacionRef.current.y };
    },
    onPanResponderMove: (_e, gesto) => {
      const actual = lienzoRef.current;
      if (!actual.ancho || !actual.alto) return;
      onCambiar(indice, contenerFirma({ ...anotacionRef.current,
        x: inicioMover.current.x + gesto.dx / actual.ancho,
        y: inicioMover.current.y + gesto.dy / actual.alto,
      }, actual));
    },
  })).current;

  const escalar = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evento) => {
      onSeleccionar(indice);
      inicioEscala.current.listo = false;
      contenedorRef.current?.measureInWindow((x, y, ancho, alto) => {
        const centroX = x + ancho / 2;
        const centroY = y + alto / 2;
        inicioEscala.current = {
          ancho: anotacionRef.current.ancho || 0.35,
          x: centroX,
          y: centroY,
          distancia: Math.max(12, Math.hypot(
            evento.nativeEvent.pageX - centroX,
            evento.nativeEvent.pageY - centroY
          )),
          listo: true,
        };
      });
    },
    onPanResponderMove: (evento) => {
      const actual = lienzoRef.current;
      const inicio = inicioEscala.current;
      if (!actual.ancho || !inicio.listo) return;
      const distancia = Math.hypot(
        evento.nativeEvent.pageX - inicio.x,
        evento.nativeEvent.pageY - inicio.y
      );
      const ancho = limitar(inicio.ancho * distancia / inicio.distancia, 0.1, 0.8);
      onCambiar(indice, contenerFirma({ ...anotacionRef.current,
        ancho,
      }, actual));
    },
  })).current;

  const rotar = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evento) => {
      onSeleccionar(indice);
      centroRotacion.current.listo = false;
      contenedorRef.current?.measureInWindow((x, y, ancho, alto) => {
        const cx = x + ancho / 2;
        const cy = y + alto / 2;
        centroRotacion.current = {
          x: cx,
          y: cy,
          angulo: Math.atan2(evento.nativeEvent.pageY - cy, evento.nativeEvent.pageX - cx),
          rotacion: anotacionRef.current.rotacion || 0,
          listo: true,
        };
      });
    },
    onPanResponderMove: (evento) => {
      const centro = centroRotacion.current;
      if (!centro.listo) return;
      const actual = Math.atan2(evento.nativeEvent.pageY - centro.y, evento.nativeEvent.pageX - centro.x);
      const grados = (actual - centro.angulo) * 180 / Math.PI;
      const rotacion = centro.rotacion + grados;
      onCambiar(indice, contenerFirma({ ...anotacionRef.current, rotacion }, lienzoRef.current));
    },
  })).current;

  return (
    <View
      ref={contenedorRef}
      {...mover.panHandlers}
      style={[
        estilos.firmaManipulable,
        {
          left: anotacion.x * lienzo.ancho,
          top: anotacion.y * lienzo.alto,
          width: (anotacion.ancho || 0.35) * lienzo.ancho,
          transform: [{ rotate: `${anotacion.rotacion || 0}deg` }],
        },
        seleccionada && estilos.firmaSeleccionada,
      ]}
    >
      {children}
      {seleccionada ? (
        <>
          <TouchableOpacity
            accessibilityLabel="Eliminar firma"
            style={[estilos.tiradorFirma, estilos.tiradorEliminar]}
            onPress={() => onEliminar(indice)}
          >
            <Text style={estilos.tiradorEliminarTexto}>×</Text>
          </TouchableOpacity>
          <View
            accessibilityLabel="Rotar firma"
            style={[estilos.tiradorFirma, estilos.tiradorRotar]}
            {...rotar.panHandlers}
          >
            <Text style={estilos.tiradorRotarTexto}>↻</Text>
          </View>
          <View
            accessibilityLabel="Cambiar tamaño de firma"
            style={[estilos.tiradorFirma, estilos.tiradorEscala]}
            {...escalar.panHandlers}
          >
            <Text style={estilos.tiradorEscalaTexto}>↘</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

export default function EditorScreen({ route, navigation }) {
  const { documento, paginaInicial } = route.params;

  const { t } = useIdioma();
  const [herramienta, setHerramienta] = useState('texto');
  const [anotaciones, setAnotaciones] = useState([]);
  const [lienzo, setLienzo] = useState({ ancho: 1, alto: 1 });
  const [guardando, setGuardando] = useState(false);
  const [seleccionada, setSeleccionada] = useState(null);
  const permitirSalidaRef = useRef(false);
  const montadoRef = useRef(true);

  useEffect(() => () => {
    montadoRef.current = false;
  }, []);

  // Las páginas se piden al backend una por una: si el original es PDF las
  // rasteriza, si es imagen la manda tal cual.
  const [pagina, setPagina] = useState(paginaInicial?.pagina ?? 0);
  const [vista, setVista] = useState(paginaInicial || null);
  const [cargandoPagina, setCargandoPagina] = useState(false);

  useEffect(() => {
    if (vista && vista.pagina === pagina) return;

    let cancelado = false;
    setCargandoPagina(true);
    api
      .pagina(documento.id, pagina)
      .then((datos) => !cancelado && setVista(datos))
      .catch((err) => !cancelado && alertar(t('noSePudo'), err.message))
      .finally(() => !cancelado && setCargandoPagina(false));

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagina]);

  const totalPaginas = vista?.paginas || documento.paginas || 1;

  useEffect(() => navigation.addListener('beforeRemove', (evento) => {
    if (permitirSalidaRef.current) return;
    if (guardando) {
      evento.preventDefault();
      alertar(t('guardadoEnCurso'), t('guardadoEnCursoDetalle'));
      return;
    }
    if (!anotaciones.length) return;
    evento.preventDefault();
    alertarConBotones(t('cambiosSinGuardar'), t('cambiosSinGuardarDetalle'), [
      {
        text: t('descartarCambios'),
        style: 'destructive',
        onPress: () => {
          permitirSalidaRef.current = true;
          navigation.dispatch(evento.data.action);
        },
      },
      { text: t('seguirEditando'), style: 'cancel' },
    ]);
  }), [anotaciones.length, guardando, navigation, t]);

  const [firmaAbierta, setFirmaAbierta] = useState(false);
  const [firmasAbierta, setFirmasAbierta] = useState(false);
  const [colorImportarAbierto, setColorImportarAbierto] = useState(false);
  const [procesandoFirma, setProcesandoFirma] = useState(false);
  const [emojisAbiertos, setEmojisAbiertos] = useState(false);
  const [textoAbierto, setTextoAbierto] = useState(false);
  const [textoNuevo, setTextoNuevo] = useState('');
  const [posicionPendiente, setPosicionPendiente] = useState(null);
  const [mosaicoAbierto, setMosaicoAbierto] = useState(false);

  const firmas = useCargar(() => api.firmas().catch(() => []), []);

  // El backend espera fracciones 0-1 con origen arriba-izquierda.
  const aFraccion = (evento) => ({
    x: evento.nativeEvent.locationX / lienzo.ancho,
    y: evento.nativeEvent.locationY / lienzo.alto,
  });

  const agregar = (anotacion) => setAnotaciones((previas) => {
    setSeleccionada(previas.length);
    return [...previas, anotacion];
  });
  const moverAnotacion = (indice, posicion) => {
    setAnotaciones((previas) =>
      previas.map((anotacion, i) => (i === indice ? { ...anotacion, ...posicion } : anotacion))
    );
  };
  const cambiarAnotacion = (indice, cambios) => {
    setAnotaciones((previas) =>
      previas.map((anotacion, i) => (i === indice ? { ...anotacion, ...cambios } : anotacion))
    );
  };

  const eliminarAnotacion = (indice) => {
    setAnotaciones((previas) => previas.filter((_, i) => i !== indice));
    setSeleccionada(null);
  };

  const ajustarSeleccionada = (cambios) => {
    if (seleccionada === null) return;
    setAnotaciones((previas) =>
      previas.map((anotacion, indice) =>
        indice === seleccionada ? { ...anotacion, ...cambios(anotacion) } : anotacion
      )
    );
  };

  const cambiarTamano = (factor) => ajustarSeleccionada((anotacion) => ({
    ancho: Math.min(0.8, Math.max(0.08, (anotacion.ancho || 0.25) * factor)),
    ...(anotacion.tipo === 'tapar'
      ? { alto: Math.min(0.3, Math.max(0.02, (anotacion.alto || 0.04) * factor)) }
      : {}),
  }));

  const rotarSeleccionada = () => ajustarSeleccionada((anotacion) => ({
    rotacion: ((anotacion.rotacion || 0) + 90) % 360,
  }));

  const eliminarSeleccionada = () => {
    if (seleccionada === null) return;
    setAnotaciones((previas) => previas.filter((_, indice) => indice !== seleccionada));
    setSeleccionada(null);
  };

  const tocarLienzo = async (evento) => {
    // Cada anotación recuerda en qué página se puso: el backend las aplica
    // sobre la página correspondiente del PDF.
    const posicion = { ...aFraccion(evento), pagina };
    setPosicionPendiente(posicion);

    if (herramienta === 'texto') {
      setTextoNuevo('');
      setTextoAbierto(true);
    } else if (herramienta === 'firma') {
      // La biblioteca decide: elegir una guardada, dibujar nueva o
      // importar de una foto. Directo al lienzo solo si nunca hay nada
      // que elegir la próxima vez que abran esta hoja.
      setFirmasAbierta(true);
    } else if (herramienta === 'emoji') {
      setEmojisAbiertos(true);
    } else if (herramienta === 'tapar') {
      agregar({ tipo: 'tapar', ...posicion, ancho: 0.3, alto: 0.04, color: '#000000' });
    } else if (herramienta === 'imagen') {
      const resultado = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
      if (!resultado.canceled) {
        const activo = resultado.assets[0];
        agregar({
          tipo: 'imagen',
          ...posicion,
          ancho: 0.25,
          datos: `data:image/jpeg;base64,${activo.base64}`,
        });
      }
    }
  };

  // Usada tanto por "Dibujar" (después de FirmaPad) como por "Importar" de
  // la biblioteca — cualquier firma nueva se guarda sola para la próxima.
  const crearFirmaEnPosicion = (datos, posicion) => {
    const ancho = 0.35;
    const altoNormalizado = (ancho * lienzo.ancho / 2) / lienzo.alto;
    return {
      tipo: 'firma',
      ...posicion,
      x: limitar(posicion.x - ancho / 2, 0, 1 - ancho),
      y: limitar(posicion.y - altoNormalizado / 2, 0, 1 - altoNormalizado),
      ancho,
      datos,
    };
  };

  const guardarYColocarFirma = (datos, posicion, color) => {
    agregar(crearFirmaEnPosicion(datos, posicion));
    api.guardarFirma(datos, color).then(() => firmas.recargar()).catch(() => {});
  };

  // La foto se elige primero; el color se pregunta después (con el azul
  // como default visual — es el primero de la lista) porque antes de ver
  // la firma extraída no tiene caso preguntar el color.
  const [fotoFirmaPendiente, setFotoFirmaPendiente] = useState(null);

  const importarFirmaDeFoto = async () => {
    const resultado = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.9 });
    if (resultado.canceled) return;

    setFotoFirmaPendiente(resultado.assets[0]);
    setColorImportarAbierto(true);
  };

  const extraerFirmaConColor = async (colorHex) => {
    const posicion = posicionPendiente;
    const activo = fotoFirmaPendiente;
    setColorImportarAbierto(false);
    setFotoFirmaPendiente(null);
    if (!activo) return;

    setProcesandoFirma(true);
    try {
      // El servidor recorta al trazo, quita el fondo (sin importar de qué
      // color sea el papel) y lo tiñe del color elegido — el mismo
      // resultado que dibujarla a mano, pero partiendo de una firma que
      // ya existe en papel.
      const { firma } = await api.firmaDesdeFoto(`data:image/jpeg;base64,${activo.base64}`, colorHex);
      guardarYColocarFirma(firma, posicion, colorHex);
    } catch (err) {
      alertar(
        t('noSePudo'),
        err.message === 'firma_no_detectada' ? t('firmaNoDetectada') : err.message
      );
    } finally {
      setProcesandoFirma(false);
    }
  };

  const deshacer = () => setAnotaciones((previas) => previas.slice(0, -1));

  const guardar = async () => {
    if (!anotaciones.length) {
      alertar(t('sinCambios'), t('sinCambiosDetalle'));
      return;
    }

    setGuardando(true);
    try {
      const { nombre, driveLink, omitidas } = await api.editar(documento.id, anotaciones);

      if (!montadoRef.current) return;
      permitirSalidaRef.current = true;

      const aviso = omitidas?.length
        ? `\n\n${t('avisoOmitidas', { n: omitidas.length })}`
        : '';

      alertarConBotones(t('guardado'), `${nombre}${aviso}`, [
        { text: t('abrirEnDrive'), onPress: () => Linking.openURL(driveLink) },
        {
          text: t('listo'),
          onPress: () => {
            permitirSalidaRef.current = true;
            navigation.goBack();
          },
        },
      ]);
    } catch (err) {
      if (montadoRef.current) alertar(t('noSePudo'), err.message);
    } finally {
      if (montadoRef.current) setGuardando(false);
    }
  };

  return (
    <SafeAreaView style={estilos.pantalla} edges={['bottom']}>
      <ScrollView contentContainerStyle={estilos.scroll}>
        <TouchableWithoutFeedback onPress={tocarLienzo}>
          <View
            style={estilos.lienzo}
            onLayout={(e) =>
              setLienzo({ ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height })
            }
          >
            {vista ? (
              <Image
                source={{ uri: `data:${vista.mimeType};base64,${vista.imagen}` }}
                style={estilos.imagen}
                resizeMode="contain"
              />
            ) : null}

            {cargandoPagina || procesandoFirma ? (
              <View style={estilos.capaCargando}>
                <ActivityIndicator color={colores.primario} />
                {procesandoFirma ? (
                  <Text style={estilos.capaCargandoTexto}>{t('extrayendoFirma')}</Text>
                ) : null}
              </View>
            ) : null}

            {anotaciones.map((anotacion, indice) => {
              if ((anotacion.pagina || 0) !== pagina) return null;

              const posicion = {
                left: anotacion.x * lienzo.ancho,
                top: anotacion.y * lienzo.alto,
              };

              if (anotacion.tipo === 'tapar') {
                return (
                  <AnotacionMovible
                    key={indice}
                    anotacion={anotacion}
                    indice={indice}
                    lienzo={lienzo}
                    onMover={moverAnotacion}
                    onSeleccionar={setSeleccionada}
                    seleccionada={seleccionada === indice}
                    style={{
                      width: anotacion.ancho * lienzo.ancho,
                      height: anotacion.alto * lienzo.alto,
                      backgroundColor: anotacion.color || '#000000',
                    }}
                  />
                );
              }

              if (anotacion.tipo === 'texto') {
                return (
                  <AnotacionMovible
                    key={indice}
                    anotacion={anotacion}
                    indice={indice}
                    lienzo={lienzo}
                    onMover={moverAnotacion}
                    onSeleccionar={setSeleccionada}
                    seleccionada={seleccionada === indice}
                  >
                    <Text style={estilos.textoPuesto}>{anotacion.texto}</Text>
                  </AnotacionMovible>
                );
              }

              if (anotacion.tipo === 'firma') {
                return (
                  <FirmaManipulable
                    key={indice}
                    anotacion={anotacion}
                    indice={indice}
                    lienzo={lienzo}
                    onCambiar={cambiarAnotacion}
                    onSeleccionar={setSeleccionada}
                    onEliminar={eliminarAnotacion}
                    seleccionada={seleccionada === indice}
                  >
                    <Image
                      source={{ uri: anotacion.datos }}
                      style={estilos.imagenPuesta}
                      resizeMode="contain"
                    />
                  </FirmaManipulable>
                );
              }

              return (
                <AnotacionMovible
                  key={indice}
                  anotacion={anotacion}
                  indice={indice}
                  lienzo={lienzo}
                  onMover={moverAnotacion}
                  onSeleccionar={setSeleccionada}
                  seleccionada={seleccionada === indice}
                  style={{
                    width: anotacion.ancho * lienzo.ancho,
                    transform: [{ rotate: `${anotacion.rotacion || 0}deg` }],
                  }}
                >
                  <Image
                    source={{ uri: anotacion.datos }}
                    style={estilos.imagenPuesta}
                    resizeMode="contain"
                  />
                </AnotacionMovible>
              );
            })}
          </View>
        </TouchableWithoutFeedback>

        {seleccionada !== null && anotaciones[seleccionada] && anotaciones[seleccionada].tipo !== 'firma' ? (
          <View style={estilos.controlesAnotacion}>
            <Text style={estilos.controlTitulo}>{t(anotaciones[seleccionada].tipo)}</Text>
            <TouchableOpacity style={estilos.controlBoton} onPress={() => cambiarTamano(0.82)}>
              <Text style={estilos.controlTexto}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity style={estilos.controlBoton} onPress={() => cambiarTamano(1.22)}>
              <Text style={estilos.controlTexto}>＋</Text>
            </TouchableOpacity>
            {anotaciones[seleccionada].tipo === 'firma' || anotaciones[seleccionada].tipo === 'imagen' ? (
              <TouchableOpacity style={estilos.controlBoton} onPress={rotarSeleccionada}>
                <Text style={estilos.controlTexto}>↻</Text>
              </TouchableOpacity>
            ) : null}
            {anotaciones[seleccionada].tipo === 'tapar' ? (
              <>
                {['#000000', '#FFFFFF', '#EF4444'].map((color) => (
                  <TouchableOpacity
                    key={color}
                    accessibilityLabel={`Color ${color}`}
                    style={[estilos.controlColor, { backgroundColor: color }]}
                    onPress={() => ajustarSeleccionada(() => ({ color }))}
                  />
                ))}
              </>
            ) : null}
            {anotaciones[seleccionada].tipo === 'tapar' ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('listo')}
                style={estilos.controlListo}
                onPress={() => {
                  setSeleccionada(null);
                  setHerramienta(null);
                }}
              >
                <Text style={estilos.controlListoTexto}>{t('listo')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={[estilos.controlBoton, estilos.controlEliminar]} onPress={eliminarSeleccionada}>
              <Text style={estilos.controlEliminarTexto}>×</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {totalPaginas > 1 ? (
          <View style={estilos.paginador}>
            <TouchableOpacity
              onPress={() => setPagina((p) => Math.max(0, p - 1))}
              disabled={pagina === 0}
            >
              <Text style={[estilos.flecha, pagina === 0 && estilos.flechaInactiva]}>‹</Text>
            </TouchableOpacity>
            <Text style={estilos.paginaTexto}>
              {t('pagina', { n: pagina + 1, total: totalPaginas })}
            </Text>
            <TouchableOpacity
              onPress={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
              disabled={pagina >= totalPaginas - 1}
            >
              <Text style={[estilos.flecha, pagina >= totalPaginas - 1 && estilos.flechaInactiva]}>
                ›
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMosaicoAbierto(true)} style={estilos.botonMosaico}>
              <Icono nombre="mosaico" tamano={16} color={colores.primario} />
              <Text style={estilos.botonMosaicoTexto}>{t('vistaMosaico')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={estilos.pista}>
          {t('eligeHerramienta')}
        </Text>
      </ScrollView>

      <View style={estilos.barra}>
        {HERRAMIENTAS.map((h) => (
          <TouchableOpacity
            key={h.id}
            style={[estilos.herramienta, herramienta === h.id && estilos.herramientaActiva]}
            onPress={() => setHerramienta(h.id)}
          >
            <Icono
              nombre={h.icono}
              tamano={19}
              color={herramienta === h.id ? colores.primario : colores.textoSuave}
            />
            <Text style={[estilos.herramientaEtiqueta, herramienta === h.id && estilos.herramientaTextoActivo]}>
              {t(h.id)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={estilos.acciones}>
        <TouchableOpacity style={estilos.botonSecundario} onPress={deshacer} disabled={!anotaciones.length}>
          <Text style={estilos.botonSecundarioTexto}>{t('deshacer')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={estilos.botonPrimario} onPress={guardar} disabled={guardando}>
          {guardando ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={estilos.botonPrimarioTexto}>{t('guardarPdf')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <VistaMosaico
        visible={mosaicoAbierto}
        documentoId={documento.id}
        totalPaginas={totalPaginas}
        onCerrar={() => setMosaicoAbierto(false)}
        onPaginasEliminadas={({ nombre, driveLink }) => {
          setMosaicoAbierto(false);
          alertarConBotones(t('guardado'), nombre, [
            { text: t('abrirEnDrive'), onPress: () => Linking.openURL(driveLink) },
            { text: t('listo'), onPress: () => navigation.goBack() },
          ]);
        }}
      />

      <FirmaPad
        visible={firmaAbierta}
        onCerrar={() => setFirmaAbierta(false)}
        onFirmar={(datos) => guardarYColocarFirma(datos, posicionPendiente, null)}
      />

      <HojaFirmas
        visible={firmasAbierta}
        firmas={firmas.datos}
        cargando={firmas.cargando}
        onCerrar={() => setFirmasAbierta(false)}
        onElegir={(firma) => {
          agregar(crearFirmaEnPosicion(firma.datos, posicionPendiente));
          setFirmasAbierta(false);
        }}
        onDibujar={() => {
          setFirmasAbierta(false);
          setFirmaAbierta(true);
        }}
        onImportar={() => {
          setFirmasAbierta(false);
          importarFirmaDeFoto();
        }}
        onBorrar={async (id) => {
          await api.borrarFirma(id);
          firmas.recargar();
        }}
      />

      <Modal visible={colorImportarAbierto} transparent animationType="fade">
        <TouchableOpacity
          style={estilos.fondoModal}
          activeOpacity={1}
          onPress={() => {
            setColorImportarAbierto(false);
            setFotoFirmaPendiente(null);
          }}
        >
          <View style={estilos.hojaColor}>
            <Text style={estilos.tituloModal}>{t('eligeColorFirma')}</Text>
            <View style={estilos.filaColores}>
              {COLORES_FIRMA.map((c) => (
                <TouchableOpacity
                  key={c.hex}
                  style={[estilos.swatchColor, { backgroundColor: c.hex }]}
                  onPress={() => extraerFirmaConColor(c.hex)}
                />
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={emojisAbiertos} transparent animationType="fade">
        <TouchableOpacity
          style={estilos.fondoModal}
          activeOpacity={1}
          onPress={() => setEmojisAbiertos(false)}
        >
          <View style={estilos.hojaEmojis}>
            <Text style={estilos.tituloModal}>{t('eligeSigno')}</Text>
            <View style={estilos.rejilla}>
              {EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={estilos.celdaEmoji}
                  onPress={() => {
                    agregar({ tipo: 'texto', ...posicionPendiente, texto: emoji, tamano: 0.04 });
                    setEmojisAbiertos(false);
                  }}
                >
                  <Text style={estilos.emoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={estilos.notaModal}>
              {t('notaEmojis')}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={textoAbierto} transparent animationType="fade">
        <View style={estilos.fondoModal}>
          <View style={estilos.hojaTexto}>
            <Text style={estilos.tituloModal}>{t('escribeTexto')}</Text>
            <TextInput
              style={estilos.input}
              value={textoNuevo}
              onChangeText={setTextoNuevo}
              placeholder={t('tuTexto')}
              placeholderTextColor={colores.textoSuave}
              autoFocus
            />
            <View style={estilos.accionesModal}>
              <TouchableOpacity onPress={() => setTextoAbierto(false)}>
                <Text style={estilos.cancelar}>{t('cancelar')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (textoNuevo.trim()) {
                    agregar({ tipo: 'texto', ...posicionPendiente, texto: textoNuevo.trim() });
                  }
                  setTextoAbierto(false);
                }}
              >
                <Text style={estilos.aceptar}>{t('colocar')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  scroll: { padding: espacio.md },
  lienzo: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.divisor,
    overflow: 'hidden',
  },
  imagen: { width: '100%', height: '100%' },
  anotacionMovible: { position: 'absolute', zIndex: 3 },
  firmaManipulable: {
    position: 'absolute',
    zIndex: 4,
    minHeight: 38,
  },
  textoPuesto: { fontSize: 16, color: '#0F172A', fontWeight: '500' },
  anotacionSeleccionada: {
    borderWidth: 2,
    borderColor: colores.primario,
    borderStyle: 'dashed',
  },
  firmaSeleccionada: {
    borderWidth: 3,
    borderColor: colores.primario,
    borderStyle: 'solid',
  },
  imagenPuesta: { width: '100%', aspectRatio: 2 },
  tiradorFirma: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    elevation: 6,
    shadowColor: '#000000',
    shadowOpacity: 0.32,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  tiradorEliminar: { left: -21, top: -21, backgroundColor: colores.peligro },
  tiradorRotar: { right: -21, top: -21, backgroundColor: colores.primario },
  tiradorEscala: { right: -21, bottom: -21, backgroundColor: colores.primario },
  tiradorEliminarTexto: { color: '#FFFFFF', fontSize: 30, lineHeight: 31, fontWeight: '800' },
  tiradorRotarTexto: { color: '#FFFFFF', fontSize: 24, lineHeight: 26, fontWeight: '800' },
  tiradorEscalaTexto: { color: '#FFFFFF', fontSize: 21, lineHeight: 23, fontWeight: '800' },
  controlesAnotacion: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: espacio.sm,
    paddingHorizontal: espacio.sm,
    borderRadius: radio.lg,
    backgroundColor: colores.superficie,
  },
  controlTitulo: { color: colores.texto, fontSize: 12, fontWeight: '700', marginRight: 2 },
  controlBoton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primarioSuave,
  },
  controlTexto: { color: colores.primario, fontSize: 22, fontWeight: '700' },
  controlColor: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colores.divisor },
  controlListo: {
    minWidth: 64,
    height: 36,
    paddingHorizontal: espacio.sm,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colores.primario,
  },
  controlListoTexto: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  controlEliminar: { backgroundColor: '#3A2024' },
  controlEliminarTexto: { color: colores.peligro, fontSize: 24, lineHeight: 26 },
  pista: {
    fontSize: 12,
    color: colores.textoSuave,
    textAlign: 'center',
    marginTop: espacio.sm,
  },
  capaCargando: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  capaCargandoTexto: { color: '#0F172A', fontSize: 13, fontWeight: '600', marginTop: espacio.sm },
  paginador: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.lg,
    marginTop: espacio.md,
  },
  flecha: { fontSize: 28, color: colores.primario, paddingHorizontal: espacio.md },
  flechaInactiva: { color: colores.divisor },
  paginaTexto: { fontSize: 14, color: colores.texto, fontWeight: '500' },
  botonMosaico: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: espacio.md,
    paddingHorizontal: espacio.sm,
    paddingVertical: 4,
    borderRadius: radio.chip,
    backgroundColor: colores.primarioSuave,
  },
  botonMosaicoTexto: { fontSize: 12, fontWeight: '600', color: colores.primario },
  barra: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: espacio.sm,
    borderTopWidth: 1,
    borderTopColor: colores.divisor,
    backgroundColor: colores.superficie,
  },
  herramienta: { alignItems: 'center', paddingHorizontal: espacio.sm, paddingVertical: espacio.xs },
  herramientaActiva: { backgroundColor: colores.primarioSuave, borderRadius: 8 },
  herramientaIcono: { fontSize: 18, color: colores.textoSuave },
  herramientaEtiqueta: { fontSize: 11, color: colores.textoSuave, marginTop: 2 },
  herramientaTextoActivo: { color: colores.primario, fontWeight: '600' },
  acciones: {
    flexDirection: 'row',
    gap: espacio.sm,
    padding: espacio.md,
    backgroundColor: colores.superficie,
  },
  botonSecundario: {
    flex: 1,
    borderWidth: 1,
    borderColor: colores.divisor,
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonSecundarioTexto: { color: colores.texto, fontSize: 15, fontWeight: '600' },
  botonPrimario: {
    flex: 2,
    backgroundColor: colores.primario,
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonPrimarioTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: espacio.lg,
  },
  hojaEmojis: { backgroundColor: colores.superficie, borderRadius: 16, padding: espacio.md },
  hojaColor: { backgroundColor: colores.superficie, borderRadius: 16, padding: espacio.md },
  filaColores: { flexDirection: 'row', gap: espacio.md, justifyContent: 'center', marginTop: espacio.sm },
  swatchColor: { width: 40, height: 40, borderRadius: 20 },
  hojaTexto: { backgroundColor: colores.superficie, borderRadius: 16, padding: espacio.md },
  tituloModal: { fontSize: 16, fontWeight: '700', color: colores.texto, marginBottom: espacio.md },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm },
  celdaEmoji: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colores.fondo,
  },
  emoji: { fontSize: 26 },
  notaModal: { fontSize: 11, color: colores.textoSuave, marginTop: espacio.md, lineHeight: 16 },
  input: {
    borderWidth: 1,
    borderColor: colores.divisor,
    borderRadius: 10,
    padding: espacio.md,
    fontSize: 16,
    color: colores.texto,
  },
  accionesModal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: espacio.lg,
    marginTop: espacio.md,
  },
  cancelar: { color: colores.textoSuave, fontSize: 15 },
  aceptar: { color: colores.primario, fontSize: 15, fontWeight: '700' },
});
