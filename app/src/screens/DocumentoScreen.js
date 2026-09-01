import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Platform, Share } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../lib/api';
import { alertar, alertarConBotones } from '../lib/alerta';
import Icono from '../components/Icono';
import HojaAcciones from '../components/HojaAcciones';
import useCargar from '../hooks/useCargar';
import { useIdioma } from '../i18n';
import { colores, porTipo, espacio, radio } from '../theme';

function formatoFecha(iso, idioma) {
  return new Date(iso).toLocaleDateString(idioma === 'en' ? 'en-US' : 'es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// En web, react-native-web no implementa Share — se usa la Web Share API
// del navegador si existe (Safari/Chrome en celular la traen), y si no,
// simplemente se abre el link de Drive, igual que el botón de al lado.
async function compartir(documento, t) {
  if (Platform.OS === 'web') {
    if (navigator.share) {
      try {
        await navigator.share({ title: documento.nombre_archivo, url: documento.drive_link });
      } catch {
        // El usuario canceló el share sheet — no es un error que avisar.
      }
    } else {
      Linking.openURL(documento.drive_link);
    }
    return;
  }
  try {
    await Share.share({ message: documento.nombre_archivo, url: documento.drive_link });
  } catch (err) {
    alertar(t('noSePudo'), err.message);
  }
}

function Campo({ etiqueta, valor }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.campoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.campoValor} numberOfLines={3}>{valor ?? '—'}</Text>
    </View>
  );
}

export default function DocumentoScreen({ route, navigation }) {
  const { documento } = route.params;
  const meta = porTipo[documento.tipo] || porTipo.otro;
  const [abriendo, setAbriendo] = useState(false);
  const [favorito, setFavorito] = useState(Boolean(documento.favorito));
  const [masAbierto, setMasAbierto] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const { t, idioma } = useIdioma();
  const versiones = useCargar(() => api.versiones(documento.id).catch(() => []), [documento.id]);

  // Al volver del editor (guardaste una firma/edición) ya hay una versión
  // nueva — se refresca sola en vez de dejar la lista desactualizada.
  useFocusEffect(
    useCallback(() => {
      versiones.recargar();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [documento.id])
  );

  // El original vive en Drive; el backend nos manda la primera página ya
  // lista para mostrar (rasterizada si es PDF).
  const abrirEditor = async () => {
    setAbriendo(true);
    try {
      const paginaInicial = await api.pagina(documento.id, 0);
      navigation.navigate('Editor', { documento, paginaInicial });
    } catch (err) {
      alertar(t('noSePudo'), err.message);
    } finally {
      setAbriendo(false);
    }
  };

  const alternarFavorito = async () => {
    const nuevo = !favorito;
    setFavorito(nuevo); // optimista: la estrella responde al instante
    try {
      await api.favorito(documento.id, nuevo);
    } catch {
      setFavorito(!nuevo);
    }
  };

  const confirmarBorrado = () => {
    setMasAbierto(false);
    // No borra el archivo real de Drive — "TapptScan organiza, no
    // secuestra archivos": el documento sigue siendo del usuario, solo
    // deja de aparecer rastreado aquí.
    alertarConBotones(t('eliminarDocumento'), t('eliminarDocumentoDetalle'), [
      {
        text: t('eliminar'),
        onPress: async () => {
          setBorrando(true);
          try {
            await api.borrarDocumento(documento.id);
            navigation.goBack();
          } catch (err) {
            alertar(t('noSePudo'), err.message);
            setBorrando(false);
          }
        },
      },
      { text: t('cancelar') },
    ]);
  };

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View style={[estilos.vistaPrevia, { backgroundColor: meta.fondo }]}>
        <View style={estilos.accionesEsquina}>
          <TouchableOpacity onPress={alternarFavorito} hitSlop={12}>
            <Icono
              nombre="estrella"
              tamano={22}
              color={favorito ? colores.alerta : colores.textoTerciario}
              grosor={favorito ? 2.4 : 1.8}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMasAbierto(true)} hitSlop={12}>
            <Icono nombre="mas_opciones" tamano={22} color={colores.textoTerciario} />
          </TouchableOpacity>
        </View>
        <View style={estilos.vistaPreviaIcono}>
          <Icono nombre={meta.icono} tamano={40} color={meta.trazo} grosor={1.6} />
        </View>
        <Text style={estilos.nombreArchivo} numberOfLines={2}>{documento.nombre_archivo}</Text>
      </View>

      <View style={estilos.badgeIA}>
        <Icono nombre="verificado" tamano={13} color={colores.primarioClaro} />
        <Text style={estilos.badgeIATexto}>
          {t('clasificadoComo', { tipo: t(meta.clave) })}
        </Text>
      </View>

      <Text style={estilos.tituloSeccion}>{t('datosExtraidos')}</Text>
      <View style={estilos.tarjeta}>
        <Campo etiqueta={t('tipo')} valor={t(meta.clave)} />
        <Campo etiqueta={t('emisor')} valor={documento.emisor} />
        <Campo etiqueta={t('fecha')} valor={documento.fecha} />
        <Campo
          etiqueta={t('monto')}
          valor={
            documento.monto != null
              ? `$${Number(documento.monto).toLocaleString('es-MX', {
                  minimumFractionDigits: 2,
                })} ${documento.moneda || ''}`.trim()
              : null
          }
        />
        <Campo etiqueta={t('carpeta')} valor={documento.ruta} />
        <Campo
          etiqueta={t('formato')}
          valor={
            documento.mime_type === 'application/pdf'
              ? `PDF · ${documento.paginas || 1} ${documento.paginas > 1 ? t('paginasPlural') : t('paginaSingular')}`
              : t('imagen')
          }
        />
      </View>

      <Text style={estilos.tituloSeccion}>{t('acciones')}</Text>
      <View style={estilos.acciones}>
        <TouchableOpacity style={estilos.boton} onPress={abrirEditor} disabled={abriendo}>
          <Text style={estilos.botonTexto}>
            {abriendo ? t('abriendo') : t('editarFirmar')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={estilos.boton} onPress={() => compartir(documento, t)}>
          <Text style={estilos.botonTexto}>{t('compartir')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[estilos.boton, estilos.botonPrimario]}
          onPress={() => Linking.openURL(documento.drive_link)}
        >
          <Text style={[estilos.botonTexto, estilos.botonTextoPrimario]}>{t('abrirEnDrive')}</Text>
        </TouchableOpacity>
      </View>

      {versiones.datos?.length ? (
        <>
          <Text style={estilos.tituloSeccion}>{t('versiones')}</Text>
          <View style={estilos.tarjeta}>
            {versiones.datos.map((version, indice) => (
              <TouchableOpacity
                key={version.id}
                style={estilos.versionFila}
                onPress={() => Linking.openURL(version.drive_link)}
              >
                <Icono nombre="verificado" tamano={16} color={colores.primarioClaro} />
                <View style={estilos.versionTextos}>
                  <Text style={estilos.versionNombre} numberOfLines={1}>
                    {indice === 0 ? t('ultimaVersion') : version.nombre_archivo}
                  </Text>
                  <Text style={estilos.versionFecha}>{formatoFecha(version.created_at, idioma)}</Text>
                </View>
                <Icono nombre="nube" tamano={16} color={colores.textoTerciario} />
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}

      <Text style={estilos.nota}>
        {t('notaPrivacidad')}
      </Text>

      <HojaAcciones
        visible={masAbierto}
        titulo={documento.nombre_archivo}
        acciones={[
          { id: 'compartir', icono: 'subir', texto: t('compartir') },
          { id: 'drive', icono: 'nube', texto: t('abrirEnDrive') },
          { id: 'eliminar', icono: 'cerrar', texto: t('eliminar'), destructiva: true },
        ]}
        onCerrar={() => setMasAbierto(false)}
        onElegir={(id) => {
          if (id === 'compartir') {
            setMasAbierto(false);
            compartir(documento, t);
          } else if (id === 'drive') {
            setMasAbierto(false);
            Linking.openURL(documento.drive_link);
          } else if (id === 'eliminar') {
            confirmarBorrado();
          }
        }}
      />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.md, paddingBottom: espacio.xl },
  vistaPrevia: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: espacio.xl,
  },
  vistaPreviaIcono: { marginBottom: espacio.xs },
  badgeIA: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: colores.primarioSuave,
    borderRadius: radio.chip,
    paddingHorizontal: espacio.sm,
    paddingVertical: 5,
    marginTop: espacio.sm,
  },
  badgeIATexto: { fontSize: 12, fontWeight: '600', color: colores.primarioClaro },
  accionesEsquina: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    gap: espacio.md,
  },
  nombreArchivo: {
    maxWidth: '78%',
    fontSize: 13,
    lineHeight: 18,
    color: colores.textoSuave,
    marginTop: espacio.sm,
    textAlign: 'center',
  },
  tituloSeccion: {
    fontSize: 13,
    fontWeight: '700',
    color: colores.textoSuave,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: espacio.lg,
    marginBottom: espacio.sm,
  },
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.divisor,
    paddingHorizontal: espacio.md,
  },
  campo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espacio.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.divisor,
  },
  campoEtiqueta: { flex: 0.42, fontSize: 14, color: colores.textoSuave, paddingRight: espacio.sm },
  campoValor: { flex: 0.58, fontSize: 14, lineHeight: 19, fontWeight: '500', color: colores.texto, textAlign: 'right' },
  versionFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    paddingVertical: espacio.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.divisor,
  },
  versionTextos: { flex: 1 },
  versionNombre: { fontSize: 14, fontWeight: '500', color: colores.texto },
  versionFecha: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  acciones: { gap: espacio.sm },
  boton: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.divisor,
    borderRadius: 12,
    paddingVertical: espacio.md,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonPrimario: { backgroundColor: colores.primario, borderColor: colores.primario },
  botonTexto: { fontSize: 15, fontWeight: '600', color: colores.texto },
  botonTextoPrimario: { color: '#FFFFFF' },
  nota: {
    fontSize: 12,
    color: colores.textoSuave,
    lineHeight: 18,
    marginTop: espacio.lg,
    textAlign: 'center',
  },
});
