import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useCargar from '../hooks/useCargar';
import { api } from '../lib/api';
import { useIdioma } from '../i18n';
import { colores, espacio } from '../theme';

/**
 * Explorador del Drive real del usuario.
 *
 * Las carpetas ya no son fijas: el clasificador las va creando
 * (`Casa/Servicios/CFE/2026`), así que se navega el árbol tal como está en
 * Drive en lugar de asumir una estructura.
 */
export default function DriveScreen({ navigation }) {
  const { t } = useIdioma();

  // Migas de pan: cada nivel guarda su id y su nombre para poder volver.
  const [ruta, setRuta] = useState([{ id: null, nombre: 'TapptScan' }]);
  const actual = ruta[ruta.length - 1];

  const carpeta = useCargar(() => api.carpetas(actual.id), [actual.id]);

  const entrar = (item) => setRuta((previa) => [...previa, { id: item.id, nombre: item.nombre }]);
  const subir = () => setRuta((previa) => previa.slice(0, -1));

  const abrir = (item) => {
    if (item.esCarpeta) return entrar(item);

    // Si el archivo es nuestro, se abre el detalle; si no, va a Drive.
    if (item.documento) navigation.navigate('Documento', { documento: item.documento });
    else if (item.link) Linking.openURL(item.link);
  };

  const contenido = carpeta.datos?.contenido || [];

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <View style={estilos.encabezado}>
        {ruta.length > 1 ? (
          <TouchableOpacity onPress={subir}>
            <Text style={estilos.volver}>‹ {ruta[ruta.length - 2].nombre}</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={estilos.titulo}>{actual.nombre}</Text>
        <Text style={estilos.subtitulo}>
          {ruta.length > 1 ? ruta.map((r) => r.nombre).join(' / ') : t('enTuDrive')}
        </Text>
      </View>

      <FlatList
        data={contenido}
        keyExtractor={(item) => item.id}
        contentContainerStyle={estilos.lista}
        refreshing={carpeta.cargando}
        onRefresh={carpeta.recargar}
        ListEmptyComponent={
          carpeta.cargando ? (
            <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />
          ) : (
            <Text style={estilos.vacio}>{carpeta.error || t('carpetaVacia')}</Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={estilos.fila} activeOpacity={0.7} onPress={() => abrir(item)}>
            <Text style={estilos.icono}>{item.esCarpeta ? '📁' : '📄'}</Text>

            <View style={estilos.centro}>
              <Text style={estilos.nombre} numberOfLines={1}>
                {item.nombre}
              </Text>
              {item.documento?.monto != null ? (
                <Text style={estilos.detalle}>
                  ${Number(item.documento.monto).toLocaleString('es-MX')}{' '}
                  {item.documento.moneda || ''}
                </Text>
              ) : null}
            </View>

            {item.esCarpeta ? <Text style={estilos.flecha}>›</Text> : null}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  encabezado: { paddingHorizontal: espacio.md, paddingTop: espacio.sm, paddingBottom: espacio.xs },
  volver: { color: colores.primario, fontSize: 15, marginBottom: espacio.xs },
  titulo: { fontSize: 24, fontWeight: '700', color: colores.texto },
  subtitulo: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  lista: { padding: espacio.md },
  vacio: { color: colores.textoSuave, fontSize: 14, textAlign: 'center', marginTop: espacio.xl },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espacio.md,
    marginBottom: espacio.sm,
  },
  icono: { fontSize: 20, marginRight: espacio.md },
  centro: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: '500', color: colores.texto },
  detalle: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  flecha: { fontSize: 20, color: colores.textoSuave },
});
