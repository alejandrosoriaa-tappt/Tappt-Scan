import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useCargar from '../hooks/useCargar';
import { api } from '../lib/api';
import { useIdioma } from '../i18n';
import Icono from '../components/Icono';
import DocumentoMiniatura from '../components/DocumentoMiniatura';
import { formatoDinero } from '../components/comunes';
import { colores, porTipo, espacio, radio, tipo, sombra } from '../theme';

const PESTANAS = ['recientes', 'favoritos', 'porRevisar'];

// Los documentos se agrupan por cercanía ("Hoy", "Ayer", "Esta semana") en
// vez de por fecha exacta: es como la gente recuerda cuándo escaneó algo.
function grupoDe(fechaIso, t) {
  if (!fechaIso) return t('grupoAntes');

  const hoy = new Date();
  const fecha = new Date(fechaIso);
  const dias = Math.floor((hoy - fecha) / 86400000);

  if (dias <= 0) return t('grupoHoy');
  if (dias === 1) return t('grupoAyer');
  if (dias <= 7) return t('grupoSemana');
  if (dias <= 31) return t('grupoMes');
  return t('grupoAntes');
}

function Fila({ documento, onPress, t }) {
  const meta = porTipo[documento.tipo] || porTipo.otro;
  const monto = formatoDinero(documento.monto, documento.moneda);

  return (
    <TouchableOpacity style={estilos.fila} activeOpacity={0.7} onPress={onPress}>
      <View>
        <DocumentoMiniatura documento={documento} width={52} height={66} />
        <View style={[estilos.tipoInsignia, { backgroundColor: meta.fondo }]}>
          <Icono nombre={meta.icono} tamano={12} color={meta.trazo} grosor={2} />
        </View>
      </View>

      <View style={estilos.filaCentro}>
        <Text style={estilos.filaTitulo} numberOfLines={1}>
          {documento.emisor || t('sinEmisor')}
        </Text>
        <Text style={estilos.filaSub} numberOfLines={1}>
          {t(meta.clave)}
          {documento.fecha ? ` · ${documento.fecha}` : ''}
        </Text>
        {documento.ruta ? (
          <Text style={estilos.filaRuta} numberOfLines={1}>
            {documento.ruta
              .split('/')
              .filter(Boolean)
              .map((segmento) => segmento.replace(/^\d+\s*·\s*/, ''))
              .join(' › ')}
          </Text>
        ) : null}
      </View>

      {monto ? <Text style={estilos.filaMonto}>{monto}</Text> : null}
    </TouchableOpacity>
  );
}

export default function DocumentosScreen({ navigation }) {
  const { t } = useIdioma();
  const [pestana, setPestana] = useState('recientes');
  const [busqueda, setBusqueda] = useState('');

  const documentos = useCargar(() => api.documentos(), []);

  const secciones = useMemo(() => {
    let lista = documentos.datos || [];

    if (pestana === 'porRevisar') {
      lista = lista.filter((d) => !d.seccion || !d.subcarpeta);
    } else if (pestana === 'favoritos') {
      lista = lista.filter((d) => d.favorito);
    }

    const texto = busqueda.trim().toLowerCase();
    if (texto) {
      lista = lista.filter((d) =>
        [d.emisor, d.nombre_archivo, d.concepto, d.ruta]
          .filter(Boolean)
          .some((campo) => campo.toLowerCase().includes(texto))
      );
    }

    const mapa = new Map();
    for (const doc of lista) {
      const grupo = grupoDe(doc.created_at || doc.fecha, t);
      if (!mapa.has(grupo)) mapa.set(grupo, []);
      mapa.get(grupo).push(doc);
    }

    return [...mapa.entries()].map(([title, data]) => ({ title, data }));
  }, [documentos.datos, pestana, busqueda, t]);

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <View style={estilos.encabezado}>
        <Text style={estilos.titulo}>{t('documentos')}</Text>

        <View style={estilos.buscador}>
          <Icono nombre="buscar" tamano={17} color={colores.textoSuave} />
          <TextInput
            style={estilos.input}
            placeholder={t('buscar')}
            placeholderTextColor="#94A3AE"
            value={busqueda}
            onChangeText={setBusqueda}
          />
          {busqueda ? (
            <TouchableOpacity
              style={estilos.limpiarBusqueda}
              onPress={() => setBusqueda('')}
              accessibilityRole="button"
              accessibilityLabel={t('limpiarBusqueda')}
            >
              <Icono nombre="cerrar" tamano={15} color={colores.textoTerciario} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={estilos.pestanas}>
          {PESTANAS.map((clave) => (
            <TouchableOpacity
              key={clave}
              onPress={() => setPestana(clave)}
              style={[estilos.pestana, pestana === clave && estilos.pestanaActiva]}
              accessibilityRole="tab"
              accessibilityState={{ selected: pestana === clave }}
            >
              <Text
                style={[estilos.pestanaTexto, pestana === clave && estilos.pestanaTextoActivo]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                maxFontSizeMultiplier={1.15}
              >
                {t(clave)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <SectionList
        sections={secciones}
        keyExtractor={(item) => item.id}
        contentContainerStyle={estilos.lista}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        refreshing={documentos.cargando}
        onRefresh={documentos.recargar}
        renderSectionHeader={({ section }) => (
          <Text style={estilos.grupo}>{section.title}</Text>
        )}
        ListEmptyComponent={
          documentos.cargando ? (
            <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />
          ) : (
            <Text style={estilos.vacio}>{t('sinDocumentos')}</Text>
          )
        }
        renderItem={({ item }) => (
          <Fila
            documento={item}
            t={t}
            onPress={() => navigation.navigate('Documento', { documento: item })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  encabezado: { paddingHorizontal: espacio.md, paddingBottom: espacio.sm },
  titulo: { ...tipo.titulo, color: colores.texto, marginVertical: espacio.sm },

  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.divisor,
    borderRadius: radio.md,
    paddingHorizontal: espacio.md,
    ...sombra,
  },
  limpiarBusqueda: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -espacio.sm,
  },

  input: {
    flex: 1,
    marginLeft: espacio.sm,
    paddingVertical: espacio.sm + 3,
    ...tipo.cuerpo,
    color: colores.texto,
  },

  pestanas: { flexDirection: 'row', gap: espacio.sm, marginTop: espacio.md },
  pestana: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: espacio.xs + 2,
    paddingHorizontal: espacio.sm,
    borderRadius: 20,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.divisor,
  },
  pestanaActiva: { backgroundColor: colores.primario, borderColor: colores.primario },
  pestanaTexto: { ...tipo.secundario, fontWeight: '600', color: colores.textoSuave, textAlign: 'center' },
  pestanaTextoActivo: { color: colores.blanco },

  lista: { padding: espacio.md, paddingTop: espacio.sm, paddingBottom: 96 },
  grupo: {
    fontSize: 12,
    fontWeight: '700',
    color: colores.textoSuave,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: espacio.md,
    marginBottom: espacio.sm,
  },
  vacio: {
    fontSize: 14,
    color: colores.textoSuave,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: espacio.xl,
  },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espacio.md,
    marginBottom: espacio.sm,
    ...sombra,
  },
  filaCentro: { flex: 1, marginLeft: espacio.md },
  filaTitulo: { ...tipo.cuerpoFuerte, color: colores.texto },
  filaSub: { ...tipo.menor, color: colores.textoSuave, marginTop: 2 },
  filaRuta: { fontSize: 11, color: '#94A3AE', marginTop: 2 },
  filaMonto: { ...tipo.cuerpoFuerte, fontSize: 14, color: colores.texto, marginLeft: espacio.sm },
  tipoInsignia: {
    position: 'absolute',
    left: -5,
    bottom: -5,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colores.superficie,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
