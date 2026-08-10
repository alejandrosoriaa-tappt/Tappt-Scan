import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import HojaLimite from '../components/HojaLimite';
import { colores, espacio } from '../theme';

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
  const { fotoBase64 } = route.params;
  const { refrescarCuenta } = useSesion();
  const { t } = useIdioma();

  const [esquinas, setEsquinas] = useState(MARCO_COMPLETO);
  const [lienzo, setLienzo] = useState({ ancho: 1, alto: 1 });
  const [detectando, setDetectando] = useState(true);
  const [aviso, setAviso] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [limite, setLimite] = useState(false);

  // El servidor sugiere el marco; el usuario siempre lo puede corregir.
  useEffect(() => {
    let cancelado = false;

    api
      .detectarBordes(fotoBase64)
      .then((resultado) => {
        if (cancelado) return;
        setEsquinas(resultado.esquinas);
        if (!resultado.confiable) {
          setAviso(t('ajustaAMano'));
        }
      })
      .catch(() => !cancelado && setAviso(t('ajustaAMano')))
      .finally(() => !cancelado && setDetectando(false));

    return () => {
      cancelado = true;
    };
  }, [fotoBase64]);

  const moverEsquina = (indice, posicion) =>
    setEsquinas((previas) => previas.map((e, i) => (i === indice ? posicion : e)));

  const confirmar = async () => {
    setGuardando(true);
    try {
      const documento = await api.escanear(fotoBase64, 'image/jpeg', esquinas);
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
      Alert.alert(t('noSePudo'), mensajes[err.message] || err.message);
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
      </View>

      <Text style={estilos.pista}>
        {aviso || t('arrastraEsquinas')}
      </Text>

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
          {guardando ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={estilos.botonPrimarioTexto}>{t('enderezarGuardar')}</Text>
          )}
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
  pista: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: espacio.lg,
  },
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
