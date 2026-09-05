import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBorradorEscaneo } from '../context/BorradorEscaneoContext';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import { api } from '../lib/api';
import { alertar, alertarConBotones } from '../lib/alerta';
import Icono from '../components/Icono';
import { colores, espacio, sombra } from '../theme';

export default function BorradorEscaneoScreen({ navigation }) {
  const { t } = useIdioma();
  const { refrescarCuenta } = useSesion();
  const borrador = useBorradorEscaneo();
  const [paginaId, setPaginaId] = useState(borrador.paginas[0]?.id || null);
  const [mosaico, setMosaico] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [etapaGuardado, setEtapaGuardado] = useState(0);

  const indice = Math.max(0, borrador.paginas.findIndex((pagina) => pagina.id === paginaId));
  const pagina = borrador.paginas[indice] || null;

  useEffect(() => {
    if (!borrador.paginas.length) {
      navigation.goBack();
      return;
    }
    if (!borrador.paginas.some((item) => item.id === paginaId)) {
      setPaginaId(borrador.paginas[Math.min(indice, borrador.paginas.length - 1)].id);
    }
  }, [borrador.paginas, paginaId]);

  useEffect(() => {
    if (!guardando) {
      setEtapaGuardado(0);
      return undefined;
    }
    const temporizador = setInterval(() => {
      setEtapaGuardado((actual) => Math.min(actual + 1, 2));
    }, 7000);
    return () => clearInterval(temporizador);
  }, [guardando]);

  const editar = (item = pagina) => {
    if (!item) return;
    navigation.navigate('Recorte', {
      fotoBase64: item.imagen,
      fotoAncho: item.ancho,
      fotoAlto: item.alto,
      esquinasIniciales: item.esquinas,
      modoLote: true,
      paginaId: item.id,
      filtroInicial: item.filtro,
    });
  };

  const eliminar = () => {
    if (!pagina) return;
    if (borrador.paginas.length === 1) {
      alertar(t('noSePudo'), t('noPuedesBorrarTodas'));
      return;
    }
    alertarConBotones(t('eliminarPaginas'), t('eliminarPaginasDetalle', { n: 1 }), [
      { text: t('eliminar'), onPress: () => borrador.eliminarPagina(pagina.id) },
      { text: t('cancelar') },
    ]);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const marcoCompleto = [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
      ];
      const documento = await api.escanearLote(borrador.paginas.map((item) => ({
        // La vista aprobada ya tiene perspectiva y filtro. Reutilizarla evita
        // subir la foto original y repetir todo el procesamiento pesado.
        imagen: item.vista || item.imagen,
        procesada: Boolean(item.vista),
        esquinas: item.vista ? marcoCompleto : item.esquinas,
        filtro: item.vista ? 'color' : item.filtro,
        formato: item.formato,
      })));
      refrescarCuenta();
      navigation.reset({
        index: 1,
        routes: [{ name: 'Tabs' }, { name: 'Documento', params: { documento } }],
      });
      borrador.iniciar();
    } catch (err) {
      alertar(t('noSePudo'), err.message === 'tiempo_agotado' ? t('guardadoDemasiadoLento') : err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.encabezado}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={estilos.iconoBoton}>
          <Icono nombre="izquierda" tamano={22} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={estilos.tituloCaja}>
          <Text style={estilos.titulo}>{t('nuevoEscaneo')}</Text>
          <Text style={estilos.subtitulo}>{t('paginasEnLote', { n: borrador.paginas.length })}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Escanear')}>
          <Text style={estilos.agregar}>{t('agregar')}</Text>
        </TouchableOpacity>
      </View>

      {mosaico ? (
        <ScrollView contentContainerStyle={estilos.rejilla}>
          {borrador.paginas.map((item, posicion) => (
            <TouchableOpacity
              key={item.id}
              style={estilos.celda}
              onPress={() => {
                setPaginaId(item.id);
                setMosaico(false);
              }}
              onLongPress={() => editar(item)}
            >
              <Image source={{ uri: item.vista }} style={estilos.miniaturaMosaico} resizeMode="contain" />
              <View style={estilos.numero}><Text style={estilos.numeroTexto}>{posicion + 1}</Text></View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[estilos.celda, estilos.agregarCelda]} onPress={() => navigation.navigate('Escanear')}>
            <Icono nombre="mas" tamano={28} color={colores.primario} />
            <Text style={estilos.agregarCeldaTexto}>{t('agregarPagina')}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          <View style={estilos.documentoCaja}>
            {pagina ? <VistaDocumento pagina={pagina} /> : null}
          </View>

          <View style={estilos.comparador}>
            <TouchableOpacity
              disabled={indice === 0}
              onPress={() => setPaginaId(borrador.paginas[indice - 1].id)}
            >
              <Icono nombre="izquierda" color={indice === 0 ? '#52606C' : '#FFFFFF'} />
            </TouchableOpacity>
            <Text style={estilos.contador}>{indice + 1}/{borrador.paginas.length}</Text>
            <TouchableOpacity
              disabled={indice === borrador.paginas.length - 1}
              onPress={() => setPaginaId(borrador.paginas[indice + 1].id)}
            >
              <Icono nombre="derecha" color={indice === borrador.paginas.length - 1 ? '#52606C' : '#FFFFFF'} />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal contentContainerStyle={estilos.tira} showsHorizontalScrollIndicator={false}>
            {borrador.paginas.map((item, posicion) => (
              <TouchableOpacity key={item.id} onPress={() => setPaginaId(item.id)}>
                <Image
                  source={{ uri: item.vista }}
                  style={[estilos.miniatura, item.id === paginaId && estilos.miniaturaActiva]}
                  resizeMode="cover"
                />
                <Text style={estilos.miniaturaNumero}>{posicion + 1}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={estilos.herramientas}>
            <Boton icono="mosaico" texto={t('mosaico')} onPress={() => setMosaico(true)} />
            <Boton icono="izquierda" texto={t('moverIzquierda')} onPress={() => borrador.moverPagina(pagina.id, -1)} />
            <Boton icono="derecha" texto={t('moverDerecha')} onPress={() => borrador.moverPagina(pagina.id, 1)} />
            <Boton icono="filtro" texto={t('editar')} onPress={() => editar()} />
            <Boton icono="cerrar" texto={t('eliminar')} peligro onPress={eliminar} />
          </View>
        </>
      )}

      <View style={estilos.pie}>
        {mosaico ? (
          <TouchableOpacity style={estilos.botonSecundario} onPress={() => setMosaico(false)}>
            <Text style={estilos.botonSecundarioTexto}>{t('volverEditor')}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={estilos.continuarCaja}>
          <Text style={estilos.continuarAyuda}>{t('firmaDespuesDeGuardar')}</Text>
          <TouchableOpacity style={estilos.botonGuardar} onPress={guardar} disabled={guardando}>
            {guardando ? <ActivityIndicator color="#FFFFFF" /> : <Icono nombre="verificado" tamano={20} color="#FFFFFF" />}
            <Text style={estilos.botonGuardarTexto}>
              {guardando
                ? t(['preparandoPdf', 'clasificandoDocumento', 'guardandoEnDrive'][etapaGuardado])
                : t('guardarYContinuar')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function Boton({ icono, texto, onPress, peligro }) {
  const color = peligro ? colores.peligro : '#DCE5EC';
  return (
    <TouchableOpacity style={estilos.herramienta} onPress={onPress}>
      <Icono nombre={icono} tamano={20} color={color} />
      <Text style={[estilos.herramientaTexto, { color }]} numberOfLines={2}>{texto}</Text>
    </TouchableOpacity>
  );
}

function VistaDocumento({ pagina }) {
  const uri = pagina.vista || pagina.imagen;
  const [anchoVisor, setAnchoVisor] = useState(0);
  const [tamano, setTamano] = useState({ ancho: pagina.ancho || 1, alto: pagina.alto || 1 });

  useEffect(() => {
    let activo = true;
    Image.getSize(
      uri,
      (ancho, alto) => activo && setTamano({ ancho, alto }),
      () => activo && setTamano({ ancho: pagina.ancho || 1, alto: pagina.alto || 1 })
    );
    return () => { activo = false; };
  }, [pagina.id, uri, pagina.ancho, pagina.alto]);

  const proporcion = tamano.alto / Math.max(tamano.ancho, 1);
  if (proporcion <= 2) {
    return <Image source={{ uri }} style={estilos.documento} resizeMode="contain" />;
  }

  return (
    <ScrollView
      style={estilos.documentoScroll}
      contentContainerStyle={estilos.documentoScrollContenido}
      showsVerticalScrollIndicator
      nestedScrollEnabled
      onLayout={(evento) => setAnchoVisor(evento.nativeEvent.layout.width)}
    >
      {anchoVisor > 0 ? (
        <Image
          source={{ uri }}
          style={{ width: anchoVisor, height: anchoVisor * proporcion }}
          resizeMode="contain"
        />
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: '#080D14' },
  encabezado: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: espacio.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#25303B' },
  iconoBoton: { width: 38 },
  tituloCaja: { flex: 1, alignItems: 'center' },
  titulo: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  subtitulo: { color: '#8E9BA6', fontSize: 11, marginTop: 2 },
  agregar: { color: colores.primario, fontSize: 14, fontWeight: '700' },
  documentoCaja: { flex: 1, margin: espacio.md, borderRadius: 10, backgroundColor: '#111923', overflow: 'hidden' },
  documento: { width: '100%', height: '100%' },
  documentoScroll: { flex: 1, width: '100%' },
  documentoScrollContenido: { alignItems: 'center', backgroundColor: '#111923' },
  comparador: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: espacio.lg, paddingVertical: espacio.xs },
  contador: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  tira: { gap: espacio.sm, paddingHorizontal: espacio.md, paddingVertical: espacio.sm },
  miniatura: { width: 50, height: 66, borderRadius: 5, borderWidth: 2, borderColor: 'transparent', backgroundColor: '#FFFFFF' },
  miniaturaActiva: { borderColor: colores.primario },
  miniaturaNumero: { color: '#AAB5BE', fontSize: 10, textAlign: 'center', marginTop: 2 },
  herramientas: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#25303B', paddingVertical: espacio.sm },
  herramienta: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  herramientaTexto: { fontSize: 9, textAlign: 'center' },
  pie: { flexDirection: 'row', alignItems: 'flex-end', gap: espacio.sm, padding: espacio.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#25303B' },
  continuarCaja: { flex: 1, gap: espacio.xs },
  continuarAyuda: { color: '#9BA8B3', fontSize: 11, lineHeight: 15, textAlign: 'center' },
  botonGuardar: { flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: colores.primario, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espacio.sm, ...sombra },
  botonGuardarTexto: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  botonSecundario: { minHeight: 48, paddingHorizontal: espacio.md, borderRadius: 12, borderWidth: 1, borderColor: '#34414D', alignItems: 'center', justifyContent: 'center' },
  botonSecundarioTexto: { color: '#DCE5EC', fontWeight: '700' },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md, padding: espacio.md, flexGrow: 1 },
  celda: { width: '30%', aspectRatio: 0.72, backgroundColor: '#FFFFFF', borderRadius: 8, overflow: 'hidden' },
  miniaturaMosaico: { width: '100%', height: '100%' },
  numero: { position: 'absolute', bottom: 5, alignSelf: 'center', backgroundColor: colores.primario, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  numeroTexto: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  agregarCelda: { backgroundColor: '#111923', borderWidth: 1, borderStyle: 'dashed', borderColor: '#34414D', alignItems: 'center', justifyContent: 'center', gap: espacio.sm },
  agregarCeldaTexto: { color: '#9BA8B3', fontSize: 11, textAlign: 'center' },
});
