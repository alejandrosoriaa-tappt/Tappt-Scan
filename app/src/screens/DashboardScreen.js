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
import { colores, espacio, radio, tipo, sombra } from '../theme';

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

function Tile({ valor, etiqueta, acento }) {
  return (
    <Tarjeta style={estilos.tile}>
      <Text style={[estilos.tileValor, acento && { color: acento }]}>{valor}</Text>
      <Text style={estilos.tileEtiqueta}>{etiqueta}</Text>
    </Tarjeta>
  );
}

export default function DashboardScreen({ navigation }) {
  const { cuenta, refrescarCuenta } = useSesion();
  const { t } = useIdioma();

  const resumen = useCargar(() => api.resumen(), []);
  const uso = useCargar(() => api.usoDrive().catch(() => null), []);
  const datos = resumen.datos;

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

        <AccionPrincipal
          icono="whatsapp"
          fondo="#DDF7EA"
          trazo="#128C7E"
          titulo={t('accionWhatsapp')}
          detalle={t('accionWhatsappDetalle')}
          onPress={() => Linking.openURL('https://wa.me/')}
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
            />
            <Tile
              valor={datos?.porRevisar ?? 0}
              etiqueta={t('porRevisarTile')}
              acento={datos?.porRevisar ? colores.alerta : undefined}
            />
            <Tile valor={datos?.documentosTotal ?? 0} etiqueta={t('documentosTotal')} />
          </View>
        )}

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
            <IconoChip nombre="nube" fondo="#DDEBFB" trazo="#2F80ED" tamano={40} />
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
  tile: { width: '48%', flexGrow: 1, paddingVertical: espacio.md + 2 },
  tileValor: { ...tipo.metrica, color: colores.texto },
  tileEtiqueta: { ...tipo.menor, color: colores.textoSuave, marginTop: 4, lineHeight: 16 },

  banner: {
    backgroundColor: colores.primarioSuave,
    borderRadius: radio.lg,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  bannerTitulo: { ...tipo.cuerpoFuerte, fontSize: 14, color: '#0B6B4F' },
  bannerTexto: { ...tipo.menor, color: '#0B6B4F', marginTop: 4, lineHeight: 17 },

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
