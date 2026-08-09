import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import FirmaPad from '../components/FirmaPad';
import { api } from '../lib/api';
import { colores, espacio } from '../theme';

const EMOJIS = ['✅', '❌', '⭐', '🔴', '➡️', '📌', '✍️', '⚠️'];

// Herramientas: qué se coloca al tocar el documento.
const HERRAMIENTAS = [
  { id: 'texto', etiqueta: 'Texto', icono: 'T' },
  { id: 'firma', etiqueta: 'Firma', icono: '✍️' },
  { id: 'emoji', etiqueta: 'Emoji', icono: '☺' },
  { id: 'imagen', etiqueta: 'Imagen', icono: '🖼' },
  { id: 'tapar', etiqueta: 'Tapar', icono: '▭' },
];

export default function EditorScreen({ route, navigation }) {
  const { documento, imagenBase } = route.params;

  const [herramienta, setHerramienta] = useState('texto');
  const [anotaciones, setAnotaciones] = useState([]);
  const [lienzo, setLienzo] = useState({ ancho: 1, alto: 1 });
  const [guardando, setGuardando] = useState(false);

  const [firmaAbierta, setFirmaAbierta] = useState(false);
  const [emojisAbiertos, setEmojisAbiertos] = useState(false);
  const [textoAbierto, setTextoAbierto] = useState(false);
  const [textoNuevo, setTextoNuevo] = useState('');
  const [posicionPendiente, setPosicionPendiente] = useState(null);

  // El backend espera fracciones 0-1 con origen arriba-izquierda.
  const aFraccion = (evento) => ({
    x: evento.nativeEvent.locationX / lienzo.ancho,
    y: evento.nativeEvent.locationY / lienzo.alto,
  });

  const agregar = (anotacion) => setAnotaciones((previas) => [...previas, anotacion]);

  const tocarLienzo = async (evento) => {
    const posicion = aFraccion(evento);
    setPosicionPendiente(posicion);

    if (herramienta === 'texto') {
      setTextoNuevo('');
      setTextoAbierto(true);
    } else if (herramienta === 'firma') {
      setFirmaAbierta(true);
    } else if (herramienta === 'emoji') {
      setEmojisAbiertos(true);
    } else if (herramienta === 'tapar') {
      agregar({ tipo: 'tapar', ...posicion, ancho: 0.3, alto: 0.04 });
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

  const deshacer = () => setAnotaciones((previas) => previas.slice(0, -1));

  const guardar = async () => {
    if (!anotaciones.length) {
      Alert.alert('Sin cambios', 'Agrega algo al documento antes de guardar.');
      return;
    }

    setGuardando(true);
    try {
      const { nombre, driveLink, omitidas } = await api.editar(
        documento.id,
        imagenBase,
        anotaciones
      );

      const aviso = omitidas?.length
        ? `\n\nOjo: ${omitidas.length} texto(s) no se pudieron dibujar porque la fuente no tiene esos caracteres.`
        : '';

      Alert.alert('Guardado', `Se guardó "${nombre}" en tu Drive.${aviso}`, [
        { text: 'Ver en Drive', onPress: () => Linking.openURL(driveLink) },
        { text: 'Listo', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('No se pudo guardar', err.message);
    } finally {
      setGuardando(false);
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
            <Image
              source={{ uri: `data:image/jpeg;base64,${imagenBase}` }}
              style={estilos.imagen}
              resizeMode="contain"
            />

            {anotaciones.map((anotacion, indice) => {
              const posicion = {
                left: anotacion.x * lienzo.ancho,
                top: anotacion.y * lienzo.alto,
              };

              if (anotacion.tipo === 'tapar') {
                return (
                  <View
                    key={indice}
                    style={[
                      estilos.tapar,
                      posicion,
                      { width: anotacion.ancho * lienzo.ancho, height: anotacion.alto * lienzo.alto },
                    ]}
                  />
                );
              }

              if (anotacion.tipo === 'texto') {
                return (
                  <Text key={indice} style={[estilos.textoPuesto, posicion]}>
                    {anotacion.texto}
                  </Text>
                );
              }

              return (
                <Image
                  key={indice}
                  source={{ uri: anotacion.datos }}
                  style={[
                    estilos.imagenPuesta,
                    posicion,
                    { width: anotacion.ancho * lienzo.ancho },
                  ]}
                  resizeMode="contain"
                />
              );
            })}
          </View>
        </TouchableWithoutFeedback>

        <Text style={estilos.pista}>
          Elige una herramienta y toca el documento donde quieras colocarla.
        </Text>
      </ScrollView>

      <View style={estilos.barra}>
        {HERRAMIENTAS.map((h) => (
          <TouchableOpacity
            key={h.id}
            style={[estilos.herramienta, herramienta === h.id && estilos.herramientaActiva]}
            onPress={() => setHerramienta(h.id)}
          >
            <Text style={[estilos.herramientaIcono, herramienta === h.id && estilos.herramientaTextoActivo]}>
              {h.icono}
            </Text>
            <Text style={[estilos.herramientaEtiqueta, herramienta === h.id && estilos.herramientaTextoActivo]}>
              {h.etiqueta}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={estilos.acciones}>
        <TouchableOpacity style={estilos.botonSecundario} onPress={deshacer} disabled={!anotaciones.length}>
          <Text style={estilos.botonSecundarioTexto}>Deshacer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={estilos.botonPrimario} onPress={guardar} disabled={guardando}>
          {guardando ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={estilos.botonPrimarioTexto}>Guardar PDF</Text>
          )}
        </TouchableOpacity>
      </View>

      <FirmaPad
        visible={firmaAbierta}
        onCerrar={() => setFirmaAbierta(false)}
        onFirmar={(datos) => agregar({ tipo: 'firma', ...posicionPendiente, ancho: 0.35, datos })}
      />

      <Modal visible={emojisAbiertos} transparent animationType="fade">
        <TouchableOpacity
          style={estilos.fondoModal}
          activeOpacity={1}
          onPress={() => setEmojisAbiertos(false)}
        >
          <View style={estilos.hojaEmojis}>
            <Text style={estilos.tituloModal}>Elige un signo</Text>
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
              Los emojis a color se ven en pantalla, pero en el PDF salen en negro salvo que
              se incrusten como imagen.
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal visible={textoAbierto} transparent animationType="fade">
        <View style={estilos.fondoModal}>
          <View style={estilos.hojaTexto}>
            <Text style={estilos.tituloModal}>Escribe el texto</Text>
            <TextInput
              style={estilos.input}
              value={textoNuevo}
              onChangeText={setTextoNuevo}
              placeholder="Tu texto"
              placeholderTextColor={colores.textoSuave}
              autoFocus
            />
            <View style={estilos.accionesModal}>
              <TouchableOpacity onPress={() => setTextoAbierto(false)}>
                <Text style={estilos.cancelar}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (textoNuevo.trim()) {
                    agregar({ tipo: 'texto', ...posicionPendiente, texto: textoNuevo.trim() });
                  }
                  setTextoAbierto(false);
                }}
              >
                <Text style={estilos.aceptar}>Colocar</Text>
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
    borderColor: colores.borde,
    overflow: 'hidden',
  },
  imagen: { width: '100%', height: '100%' },
  tapar: { position: 'absolute', backgroundColor: '#FFFFFF' },
  textoPuesto: { position: 'absolute', fontSize: 16, color: '#0F172A', fontWeight: '500' },
  imagenPuesta: { position: 'absolute', height: undefined, aspectRatio: 2 },
  pista: {
    fontSize: 12,
    color: colores.textoSuave,
    textAlign: 'center',
    marginTop: espacio.sm,
  },
  barra: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: espacio.sm,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
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
    borderColor: colores.borde,
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
    borderColor: colores.borde,
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
