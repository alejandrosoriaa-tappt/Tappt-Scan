import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useCargar from '../hooks/useCargar';
import { api } from '../lib/api';
import { useIdioma } from '../i18n';
import Icono, { IconoChip } from '../components/Icono';
import { Tarjeta, Barra, formatoBytes } from '../components/comunes';
import { colores, porSeccion, espacio, radio, tipo, sombra } from '../theme';

const GENERICA = { icono: 'carpeta', fondo: '#EEF2F5', trazo: '#667587' };

/**
 * Explorador del Drive del usuario.
 *
 * En la raíz se muestran las secciones en rejilla 2×N, porque son ocho fijas
 * y se reconocen por color. Al entrar, la lista pasa a vertical: ahí el
 * contenido es variable y lo que importa es leer nombres largos.
 */
export default function CarpetasScreen({ navigation }) {
  const { t } = useIdioma();
  const [ruta, setRuta] = useState([{ id: null, nombre: 'TapptScan' }]);
  const actual = ruta[ruta.length - 1];
  const enRaiz = ruta.length === 1;

  const carpeta = useCargar(() => api.carpetas(actual.id), [actual.id]);
  const uso = useCargar(() => api.usoDrive().catch(() => null), []);

  const abrir = (item) => {
    if (item.esCarpeta) {
      setRuta((previa) => [...previa, { id: item.id, nombre: item.nombre }]);
    } else if (item.documento) {
      navigation.navigate('Documento', { documento: item.documento });
    } else if (item.link) {
      Linking.openURL(item.link);
    }
  };

  const contenido = carpeta.datos?.contenido || [];

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <ScrollView contentContainerStyle={estilos.scroll} showsVerticalScrollIndicator={false}>
        {enRaiz ? (
          <>
            <Text style={estilos.titulo}>{t('carpetas')}</Text>

            {/* La conexión con Drive se muestra arriba, no escondida en
                ajustes: es la promesa del producto. */}
            <Tarjeta style={estilos.drive}>
              <IconoChip nombre="nube" fondo="#DDEBFB" trazo="#2F80ED" tamano={40} />
              <View style={estilos.driveTexto}>
                <Text style={estilos.driveTitulo}>{t('enTuDrive')}</Text>
                <View style={estilos.driveEstado}>
                  <View style={estilos.punto} />
                  <Text style={estilos.driveDetalle}>{t('sincronizado')}</Text>
                </View>
              </View>
            </Tarjeta>

            <Text style={estilos.seccion}>{t('carpetasPrincipales')}</Text>
          </>
        ) : (
          <View style={estilos.encabezadoInterno}>
            <TouchableOpacity
              style={estilos.volver}
              onPress={() => setRuta((previa) => previa.slice(0, -1))}
            >
              <Icono nombre="izquierda" tamano={18} color={colores.primario} />
              <Text style={estilos.volverTexto}>{ruta[ruta.length - 2].nombre}</Text>
            </TouchableOpacity>
            <Text style={estilos.titulo}>{actual.nombre}</Text>
          </View>
        )}

        {carpeta.cargando && !carpeta.datos ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />
        ) : contenido.length === 0 ? (
          <Text style={estilos.vacio}>{carpeta.error || t('carpetaVacia')}</Text>
        ) : enRaiz ? (
          <View style={estilos.rejilla}>
            {contenido.map((item) => {
              const meta = porSeccion[item.nombre] || GENERICA;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={estilos.tarjetaCarpeta}
                  activeOpacity={0.8}
                  onPress={() => abrir(item)}
                >
                  <IconoChip
                    nombre={meta.icono}
                    fondo={meta.fondo}
                    trazo={meta.trazo}
                    tamano={42}
                  />
                  <Text style={estilos.carpetaNombre} numberOfLines={2}>
                    {item.nombre}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          contenido.map((item) => {
            const meta = item.esCarpeta ? GENERICA : { icono: 'documento', fondo: '#EEF2F5', trazo: '#667587' };
            return (
              <TouchableOpacity
                key={item.id}
                style={estilos.fila}
                activeOpacity={0.7}
                onPress={() => abrir(item)}
              >
                <IconoChip nombre={meta.icono} fondo={meta.fondo} trazo={meta.trazo} tamano={40} />
                <Text style={estilos.filaNombre} numberOfLines={1}>
                  {item.nombre}
                </Text>
                {item.esCarpeta ? <Icono nombre="derecha" tamano={17} color="#C4CDD5" /> : null}
              </TouchableOpacity>
            );
          })
        )}

        {enRaiz && uso.datos?.porcentaje != null ? (
          <Tarjeta style={estilos.almacenamiento}>
            <View style={estilos.almFila}>
              <Text style={estilos.almTitulo}>{t('almacenamiento')}</Text>
              <Text style={estilos.almPorcentaje}>{uso.datos.porcentaje}%</Text>
            </View>
            <View style={{ marginTop: espacio.sm }}>
              <Barra porcentaje={uso.datos.porcentaje} />
            </View>
            <Text style={estilos.almDetalle}>
              {t('usoDrive', {
                usado: formatoBytes(uso.datos.usado),
                total: formatoBytes(uso.datos.limite),
              })}
            </Text>
          </Tarjeta>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  scroll: { padding: espacio.md, paddingBottom: 96 },
  titulo: { ...tipo.titulo, color: colores.texto, marginVertical: espacio.sm },

  encabezadoInterno: { marginBottom: espacio.sm },
  volver: { flexDirection: 'row', alignItems: 'center', paddingVertical: espacio.xs },
  volverTexto: { ...tipo.cuerpo, color: colores.primario, marginLeft: 2 },

  drive: { flexDirection: 'row', alignItems: 'center', marginTop: espacio.xs },
  driveTexto: { flex: 1, marginLeft: espacio.md },
  driveTitulo: { ...tipo.cuerpoFuerte, fontSize: 14, color: colores.texto },
  driveEstado: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  punto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colores.primario, marginRight: 6 },
  driveDetalle: { ...tipo.menor, color: colores.textoSuave },

  seccion: { ...tipo.seccion, color: colores.texto, marginTop: espacio.lg, marginBottom: espacio.md },

  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.sm },
  tarjetaCarpeta: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espacio.md,
    ...sombra,
  },
  carpetaNombre: { ...tipo.cuerpoFuerte, fontSize: 14, color: colores.texto, marginTop: espacio.sm },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espacio.md,
    marginBottom: espacio.sm,
    ...sombra,
  },
  filaNombre: { flex: 1, ...tipo.cuerpo, color: colores.texto, marginHorizontal: espacio.md },

  vacio: {
    ...tipo.cuerpo,
    color: colores.textoSuave,
    textAlign: 'center',
    marginTop: espacio.xl,
  },

  almacenamiento: { marginTop: espacio.lg },
  almFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  almTitulo: { ...tipo.cuerpoFuerte, fontSize: 14, color: colores.texto },
  almPorcentaje: { ...tipo.secundario, color: colores.textoSuave },
  almDetalle: { ...tipo.menor, color: colores.textoSuave, marginTop: espacio.sm },
});
