import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icono from './Icono';
import { api } from '../lib/api';
import { alertar, alertarConBotones } from '../lib/alerta';
import { useIdioma } from '../i18n';
import { colores, espacio, radio } from '../theme';

const COLUMNAS = 3;

async function compartirLink(nombre, driveLink) {
  if (Platform.OS === 'web') {
    if (navigator.share) {
      try {
        await navigator.share({ title: nombre, url: driveLink });
      } catch {
        // Canceló el share sheet — no es un error.
      }
    } else {
      Linking.openURL(driveLink);
    }
    return;
  }
  try {
    await Share.share({ message: nombre, url: driveLink });
  } catch {
    // Canceló — no es un error.
  }
}

/**
 * Vista mosaico de un documento de varias páginas (benchmark CamScanner,
 * ver docs/DIRECCION-DISENO.md). Deja hacer zoom página por página, y en
 * modo selección: compartir solo algunas páginas como PDF aparte, o
 * eliminar páginas del documento (queda como versión nueva — el original
 * nunca se toca). Pensado para el caso real de quitar la última hoja de
 * contacto de una ficha técnica antes de reenviarla a un cliente.
 */
export default function VistaMosaico({
  visible,
  documentoId,
  totalPaginas,
  onCerrar,
  onPaginasEliminadas,
}) {
  const { t } = useIdioma();
  const [miniaturas, setMiniaturas] = useState({});
  const [seleccion, setSeleccion] = useState(new Set());
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [zoomIndice, setZoomIndice] = useState(null);
  const [procesando, setProcesando] = useState(false);

  const indices = useMemo(
    () => Array.from({ length: totalPaginas }, (_, i) => i),
    [totalPaginas]
  );

  // Documentos de este tipo (fichas técnicas, contratos) suelen ser pocas
  // páginas — se cargan todas de una vez para que el mosaico se sienta
  // completo desde que abre, en vez de ir apareciendo una por una.
  useEffect(() => {
    if (!visible) return;
    let cancelado = false;

    indices.forEach((i) => {
      if (miniaturas[i]) return;
      api
        .pagina(documentoId, i)
        .then((datos) => !cancelado && setMiniaturas((previas) => ({ ...previas, [i]: datos })))
        .catch(() => {});
    });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, documentoId, totalPaginas]);

  useEffect(() => {
    if (!visible) {
      setSeleccion(new Set());
      setModoSeleccion(false);
      setZoomIndice(null);
    }
  }, [visible]);

  const alternar = (i) => {
    setSeleccion((previa) => {
      const nueva = new Set(previa);
      if (nueva.has(i)) nueva.delete(i);
      else nueva.add(i);
      return nueva;
    });
  };

  const tocarMiniatura = (i) => {
    if (modoSeleccion) alternar(i);
    else setZoomIndice(i);
  };

  const compartirSeleccion = async () => {
    setProcesando(true);
    try {
      const paginas = Array.from(seleccion).sort((a, b) => a - b);
      const { nombre, driveLink } = await api.compartirPaginas(documentoId, paginas);
      await compartirLink(nombre, driveLink);
    } catch (err) {
      alertar(t('noSePudo'), err.message);
    } finally {
      setProcesando(false);
    }
  };

  const eliminarSeleccion = () => {
    const paginas = Array.from(seleccion).sort((a, b) => a - b);
    if (paginas.length === totalPaginas) {
      alertar(t('noSePudo'), t('noPuedesBorrarTodas'));
      return;
    }

    alertarConBotones(
      t('eliminarPaginas'),
      t('eliminarPaginasDetalle', { n: paginas.length }),
      [
        {
          text: t('eliminar'),
          onPress: async () => {
            setProcesando(true);
            try {
              const resultado = await api.eliminarPaginas(documentoId, paginas);
              setSeleccion(new Set());
              setModoSeleccion(false);
              onPaginasEliminadas?.(resultado);
            } catch (err) {
              alertar(t('noSePudo'), err.message);
            } finally {
              setProcesando(false);
            }
          },
        },
        { text: t('cancelar') },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <SafeAreaView style={estilos.pantalla}>
        <View style={estilos.encabezado}>
          <TouchableOpacity onPress={onCerrar} hitSlop={12}>
            <Text style={estilos.cancelar}>{t('cerrar')}</Text>
          </TouchableOpacity>
          <Text style={estilos.titulo}>{t('vistaMosaico')}</Text>
          <TouchableOpacity
            onPress={() => {
              setModoSeleccion((previo) => !previo);
              setSeleccion(new Set());
            }}
            hitSlop={12}
          >
            <Text style={estilos.seleccionar}>
              {modoSeleccion ? t('listo') : t('seleccionar')}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={estilos.rejilla}>
          {indices.map((i) => {
            const miniatura = miniaturas[i];
            const marcada = seleccion.has(i);
            return (
              <TouchableOpacity
                key={i}
                style={estilos.celda}
                onPress={() => tocarMiniatura(i)}
                onLongPress={() => {
                  setModoSeleccion(true);
                  alternar(i);
                }}
              >
                <View style={[estilos.miniaturaMarco, marcada && estilos.miniaturaMarcada]}>
                  {miniatura ? (
                    <Image
                      source={{ uri: `data:${miniatura.mimeType};base64,${miniatura.imagen}` }}
                      style={estilos.miniatura}
                      resizeMode="contain"
                    />
                  ) : (
                    <ActivityIndicator color={colores.textoSuave} />
                  )}

                  {modoSeleccion ? (
                    <View style={[estilos.check, marcada && estilos.checkMarcado]}>
                      {marcada ? <Icono nombre="verificado" tamano={14} color="#FFFFFF" /> : null}
                    </View>
                  ) : null}
                </View>
                <Text style={estilos.numeroPagina}>{i + 1}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {modoSeleccion && seleccion.size > 0 ? (
          <View style={estilos.barraAcciones}>
            <TouchableOpacity
              style={estilos.botonAccion}
              onPress={compartirSeleccion}
              disabled={procesando}
            >
              <Icono nombre="subir" tamano={18} color={colores.texto} />
              <Text style={estilos.botonAccionTexto}>
                {t('compartirSeleccion', { n: seleccion.size })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[estilos.botonAccion, estilos.botonAccionDestructivo]}
              onPress={eliminarSeleccion}
              disabled={procesando}
            >
              <Icono nombre="cerrar" tamano={18} color={colores.peligro} />
              <Text style={[estilos.botonAccionTexto, estilos.botonAccionTextoDestructivo]}>
                {t('eliminarSeleccion', { n: seleccion.size })}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {procesando ? (
          <View style={estilos.capaProcesando}>
            <ActivityIndicator color={colores.primario} />
          </View>
        ) : null}

        <Modal
          visible={zoomIndice !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setZoomIndice(null)}
        >
          <View style={estilos.fondoZoom}>
            <TouchableOpacity
              style={estilos.cerrarZoom}
              onPress={() => setZoomIndice(null)}
              hitSlop={12}
            >
              <Icono nombre="cerrar" tamano={22} color="#FFFFFF" />
            </TouchableOpacity>

            {zoomIndice !== null && miniaturas[zoomIndice] ? (
              <Image
                source={{
                  uri: `data:${miniaturas[zoomIndice].mimeType};base64,${miniaturas[zoomIndice].imagen}`,
                }}
                style={estilos.imagenZoom}
                resizeMode="contain"
              />
            ) : (
              <ActivityIndicator color="#FFFFFF" />
            )}

            {zoomIndice !== null ? (
              <View style={estilos.navegacionZoom}>
                <TouchableOpacity
                  onPress={() => setZoomIndice((i) => Math.max(0, i - 1))}
                  disabled={zoomIndice === 0}
                  hitSlop={12}
                >
                  <Text style={[estilos.flechaZoom, zoomIndice === 0 && estilos.flechaZoomInactiva]}>
                    ‹
                  </Text>
                </TouchableOpacity>
                <Text style={estilos.numeroZoom}>{t('pagina', { n: zoomIndice + 1, total: totalPaginas })}</Text>
                <TouchableOpacity
                  onPress={() => setZoomIndice((i) => Math.min(totalPaginas - 1, i + 1))}
                  disabled={zoomIndice === totalPaginas - 1}
                  hitSlop={12}
                >
                  <Text
                    style={[
                      estilos.flechaZoom,
                      zoomIndice === totalPaginas - 1 && estilos.flechaZoomInactiva,
                    ]}
                  >
                    ›
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </Modal>
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.divisor,
  },
  cancelar: { color: colores.textoSuave, fontSize: 15 },
  titulo: { fontSize: 16, fontWeight: '600', color: colores.texto },
  seleccionar: { color: colores.primario, fontSize: 15, fontWeight: '700' },
  rejilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: espacio.md,
    gap: espacio.md,
  },
  celda: { width: `${100 / COLUMNAS - 4}%`, alignItems: 'center' },
  miniaturaMarco: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colores.divisor,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  miniaturaMarcada: { borderColor: colores.primario, borderWidth: 2 },
  miniatura: { width: '100%', height: '100%' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colores.textoTerciario,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMarcado: { backgroundColor: colores.primario, borderColor: colores.primario },
  numeroPagina: { fontSize: 12, color: colores.textoSuave, marginTop: espacio.xs },
  barraAcciones: {
    flexDirection: 'row',
    gap: espacio.sm,
    padding: espacio.md,
    borderTopWidth: 1,
    borderTopColor: colores.divisor,
    backgroundColor: colores.superficie,
  },
  botonAccion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.xs,
    borderWidth: 1,
    borderColor: colores.divisor,
    borderRadius: 12,
    paddingVertical: espacio.md,
  },
  botonAccionDestructivo: { borderColor: colores.peligro },
  botonAccionTexto: { color: colores.texto, fontSize: 14, fontWeight: '600' },
  botonAccionTextoDestructivo: { color: colores.peligro },
  capaProcesando: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fondoZoom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cerrarZoom: { position: 'absolute', top: 50, right: 20, zIndex: 1 },
  imagenZoom: { width: '90%', height: '75%' },
  navegacionZoom: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.lg,
  },
  flechaZoom: { fontSize: 30, color: '#FFFFFF', paddingHorizontal: espacio.md },
  flechaZoomInactiva: { color: 'rgba(255,255,255,0.3)' },
  numeroZoom: { color: '#FFFFFF', fontSize: 14 },
});
