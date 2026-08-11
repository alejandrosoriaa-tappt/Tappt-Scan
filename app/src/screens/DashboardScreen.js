import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useCargar from '../hooks/useCargar';
import { api } from '../lib/api';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import Icono, { IconoChip } from '../components/Icono';
import { Tarjeta, Barra, formatoDinero, formatoBytes } from '../components/comunes';
import { colores, porTipo, espacio, radio, tipo, sombra } from '../theme';

/**
 * La Home no es un explorador de archivos: es el centro del asistente.
 *
 * Por eso lo primero no es la lista de documentos sino las dos formas de
 * mandarle uno. La frase rectora manda: "tú mandas el documento, TapptScan
 * hace lo demás".
 */
function AccionPrincipal({ icono, fondo, trazo, titulo, detalle, onPress, destacada }) {
  return (
    <TouchableOpacity
      style={[estilos.accion, destacada && estilos.accionDestacada]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <IconoChip nombre={icono} fondo={fondo} trazo={trazo} tamano={46} />
      <View style={estilos.accionTexto}>
        <Text style={estilos.accionTitulo}>{titulo}</Text>
        <Text style={estilos.accionDetalle}>{detalle}</Text>
      </View>
      <Icono nombre="derecha" tamano={18} color="#C4CDD5" />
    </TouchableOpacity>
  );
}

// Sin onPress se queda como una vista normal (no todo el grid es tocable,
// solo la tarjeta de gastos lleva a Gastos con su gráfica) — por eso el
// tamaño del grid (width 48%) vive en el elemento de afuera siempre, y la
// Tarjeta de adentro solo pone el fondo/borde, para no aplicarlo dos veces.
function Tile({ valor, etiqueta, acento, onPress }) {
  return (
    <TouchableOpacity
      style={estilos.tile}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.75 : 1}
    >
      <Tarjeta style={estilos.tileInterior}>
        <Text style={[estilos.tileValor, acento && { color: acento }]}>{valor}</Text>
        <Text style={estilos.tileEtiqueta}>{etiqueta}</Text>
      </Tarjeta>
    </TouchableOpacity>
  );
}

// Vista compacta para "Recientes" — misma idea que la fila de
// DocumentosScreen, pero más chica: aquí solo se quiere reconocer el
// documento de un vistazo, no leer todos sus datos.
function Reciente({ documento, onPress }) {
  const { t } = useIdioma();
  const meta = porTipo[documento.tipo] || porTipo.otro;

  return (
    <TouchableOpacity style={estilos.reciente} activeOpacity={0.75} onPress={onPress}>
      <IconoChip nombre={meta.icono} fondo={meta.fondo} trazo={meta.trazo} tamano={40} />
      <View style={estilos.recienteCentro}>
        <Text style={estilos.recienteTitulo} numberOfLines={1}>
          {documento.nombre_archivo || documento.emisor || t('sinEmisor')}
        </Text>
        <View style={estilos.recienteEtiquetas}>
          <View style={[estilos.chipTipo, { backgroundColor: meta.fondo }]}>
            <Text style={[estilos.chipTipoTexto, { color: meta.trazo }]}>{t(meta.clave)}</Text>
          </View>
          {documento.ruta ? (
            <Text style={estilos.recienteRuta} numberOfLines={1}>
              {documento.ruta}
            </Text>
          ) : null}
        </View>
      </View>
      <Icono nombre="verificado" tamano={16} color={colores.primario} />
    </TouchableOpacity>
  );
}

export default function DashboardScreen({ navigation }) {
  const { cuenta, refrescarCuenta } = useSesion();
  const { t } = useIdioma();

  const resumen = useCargar(() => api.resumen(), []);
  const uso = useCargar(() => api.usoDrive().catch(() => null), []);
  const recientes = useCargar(() => api.documentos(), []);
  const datos = resumen.datos;
  const ultimos = (recientes.datos || []).slice(0, 3);

  const restantes =
    cuenta?.escaneosLimite != null ? cuenta.escaneosLimite - cuenta.escaneosUsados : null;

  return (
    <View style={estilos.pantalla}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: colores.fondo }} />

      <ScrollView
        contentContainerStyle={estilos.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={resumen.cargando}
            onRefresh={() => {
              resumen.recargar();
              uso.recargar();
              refrescarCuenta();
            }}
          />
        }
      >
        <View style={estilos.marca}>
          <Text style={estilos.marcaTexto}>
            Tappt<Text style={estilos.marcaAcento}>Scan</Text>
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Ajustes')} hitSlop={10}>
            <Icono nombre="ajustes" tamano={21} color={colores.textoSuave} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={estilos.buscador}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Documentos')}
        >
          <Icono nombre="buscar" tamano={18} color={colores.textoTerciario} />
          <Text style={estilos.buscadorTexto}>{t('buscarDocumentos')}</Text>
        </TouchableOpacity>

        <AccionPrincipal
          icono="whatsapp"
          fondo="rgba(37,211,102,0.16)"
          trazo="#25D366"
          titulo={t('accionWhatsapp')}
          detalle={t('accionWhatsappDetalle')}
          onPress={() => Linking.openURL(`https://wa.me/${cuenta?.numeroTapptScan || ''}`)}
          destacada
        />

        <AccionPrincipal
          icono="camara"
          fondo={colores.primarioSuave}
          trazo={colores.primario}
          titulo={t('accionCamara')}
          detalle={t('accionCamaraDetalle')}
          onPress={() => navigation.navigate('Escanear')}
        />

        <View style={estilos.filaTitulo}>
          <Text style={estilos.seccion}>{t('resumenRapido')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Documentos')}>
            <Text style={estilos.verTodo}>{t('verTodo')}</Text>
          </TouchableOpacity>
        </View>

        {resumen.cargando && !datos ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.lg }} />
        ) : (
          <View style={estilos.rejilla}>
            <Tile valor={datos?.documentosDelMes ?? 0} etiqueta={t('documentosEsteMes')} />
            <Tile
              valor={formatoDinero(datos?.gastoDelMes ?? 0)}
              etiqueta={t('gastosEsteMes')}
              onPress={() => navigation.navigate('Gastos')}
            />
            <Tile
              valor={datos?.porRevisar ?? 0}
              etiqueta={t('porRevisarTile')}
              acento={datos?.porRevisar ? colores.alerta : undefined}
            />
            <Tile valor={datos?.documentosTotal ?? 0} etiqueta={t('documentosTotal')} />
          </View>
        )}

        {ultimos.length ? (
          <>
            <View style={estilos.filaTitulo}>
              <Text style={estilos.seccion}>{t('recientes')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Documentos')}>
                <Text style={estilos.verTodo}>{t('verTodo')}</Text>
              </TouchableOpacity>
            </View>
            <View style={estilos.listaRecientes}>
              {ultimos.map((documento) => (
                <Reciente
                  key={documento.id}
                  documento={documento}
                  onPress={() => navigation.navigate('Documento', { documento })}
                />
              ))}
            </View>
          </>
        ) : null}

        {cuenta?.plan === 'gratis' && restantes != null ? (
          <TouchableOpacity
            style={estilos.banner}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Ajustes')}
          >
            <Text style={estilos.bannerTitulo}>
              {t('escaneosRestantes', {
                n: Math.max(restantes, 0),
                verbo: restantes === 1 ? t('queda') : t('quedan'),
              })}
            </Text>
            <Text style={estilos.bannerTexto}>{t('upsell')}</Text>
          </TouchableOpacity>
        ) : null}

        {/* La privacidad se recuerda en cada visita: tus documentos viven
            en tu Drive, no en nuestros servidores. */}
        <Tarjeta style={estilos.drive}>
          <View style={estilos.driveFila}>
            <IconoChip nombre="nube" fondo="rgba(59,130,246,0.18)" trazo="#5B9BFA" tamano={40} />
            <View style={estilos.driveTexto}>
              <Text style={estilos.driveTitulo}>{t('guardandoEnDrive')}</Text>
              <View style={estilos.driveEstado}>
                <View style={estilos.punto} />
                <Text style={estilos.driveDetalle}>{t('sincronizado')}</Text>
              </View>
            </View>
          </View>

          {uso.datos?.porcentaje != null ? (
            <View style={estilos.driveUso}>
              <Barra porcentaje={uso.datos.porcentaje} />
              <Text style={estilos.driveEspacio}>
                {t('usoDrive', {
                  usado: formatoBytes(uso.datos.usado),
                  total: formatoBytes(uso.datos.limite),
                })}
              </Text>
            </View>
          ) : null}
        </Tarjeta>
      </ScrollView>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  scroll: { padding: espacio.md, paddingBottom: 96 },

  marca: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: espacio.sm,
    marginBottom: espacio.sm,
  },
  marcaTexto: { ...tipo.tituloChico, color: colores.texto },
  marcaAcento: { color: colores.primario },

  buscador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.divisor,
    borderRadius: radio.xl,
    paddingVertical: espacio.sm + 2,
    paddingHorizontal: espacio.md,
    marginBottom: espacio.md,
  },
  buscadorTexto: { ...tipo.cuerpo, color: colores.textoTerciario },

  accion: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espacio.md,
    marginBottom: espacio.sm,
    ...sombra,
  },
  accionDestacada: { borderWidth: 1, borderColor: colores.primarioSuave },
  accionTexto: { flex: 1, marginLeft: espacio.md },
  accionTitulo: { ...tipo.cuerpoFuerte, color: colores.texto },
  accionDetalle: { ...tipo.menor, color: colores.textoSuave, marginTop: 3, lineHeight: 16 },

  filaTitulo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: espacio.lg,
    marginBottom: espacio.md,
  },
  seccion: { ...tipo.seccion, color: colores.texto },
  verTodo: { ...tipo.secundario, fontWeight: '600', color: colores.primario },

  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm },
  tile: { width: '48%', flexGrow: 1 },
  tileInterior: { paddingVertical: espacio.md + 2 },
  tileValor: { ...tipo.metrica, color: colores.texto },
  tileEtiqueta: { ...tipo.menor, color: colores.textoSuave, marginTop: 4, lineHeight: 16 },

  listaRecientes: { gap: espacio.sm },
  reciente: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espacio.sm + 2,
    gap: espacio.sm,
  },
  recienteCentro: { flex: 1 },
  recienteTitulo: { ...tipo.cuerpoFuerte, fontSize: 14, color: colores.texto },
  recienteEtiquetas: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs, marginTop: 4 },
  chipTipo: { borderRadius: radio.chip, paddingHorizontal: espacio.xs + 2, paddingVertical: 2 },
  chipTipoTexto: { fontSize: 11, fontWeight: '700' },
  recienteRuta: { ...tipo.menor, color: colores.textoTerciario, flexShrink: 1 },

  banner: {
    backgroundColor: colores.primarioSuave,
    borderWidth: 1,
    borderColor: 'rgba(24,184,117,0.35)',
    borderRadius: radio.lg,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  bannerTitulo: { ...tipo.cuerpoFuerte, fontSize: 14, color: colores.primarioClaro },
  bannerTexto: { ...tipo.menor, color: colores.textoSuave, marginTop: 4, lineHeight: 17 },

  drive: { marginTop: espacio.md },
  driveFila: { flexDirection: 'row', alignItems: 'center' },
  driveTexto: { flex: 1, marginLeft: espacio.md },
  driveTitulo: { ...tipo.cuerpoFuerte, fontSize: 14, color: colores.texto },
  driveEstado: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  punto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colores.primario,
    marginRight: 6,
  },
  driveDetalle: { ...tipo.menor, color: colores.textoSuave },
  driveUso: { marginTop: espacio.md },
  driveEspacio: { ...tipo.menor, color: colores.textoSuave, marginTop: espacio.sm },
});
