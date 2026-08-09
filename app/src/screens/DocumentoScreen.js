import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking } from 'react-native';
import { api } from '../lib/api';
import { useIdioma } from '../i18n';
import { colores, porTipo, espacio } from '../theme';

function Campo({ etiqueta, valor }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.campoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.campoValor}>{valor ?? '—'}</Text>
    </View>
  );
}

export default function DocumentoScreen({ route, navigation }) {
  const { documento } = route.params;
  const meta = porTipo[documento.tipo] || porTipo.otro;
  const [abriendo, setAbriendo] = useState(false);
  const { t } = useIdioma();

  // El original vive en Drive; el backend nos manda la primera página ya
  // lista para mostrar (rasterizada si es PDF).
  const abrirEditor = async () => {
    setAbriendo(true);
    try {
      const paginaInicial = await api.pagina(documento.id, 0);
      navigation.navigate('Editor', { documento, paginaInicial });
    } catch (err) {
      Alert.alert(t('noSePudo'), err.message);
    } finally {
      setAbriendo(false);
    }
  };

  return (
    <ScrollView style={estilos.pantalla} contentContainerStyle={estilos.contenido}>
      <View style={[estilos.vistaPrevia, { backgroundColor: `${meta.color}14` }]}>
        <Text style={estilos.vistaPreviaIcono}>{meta.icono}</Text>
        <Text style={estilos.nombreArchivo}>{documento.nombre_archivo}</Text>
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
        <TouchableOpacity
          style={[estilos.boton, estilos.botonPrimario]}
          onPress={() => Linking.openURL(documento.drive_link)}
        >
          <Text style={[estilos.botonTexto, estilos.botonTextoPrimario]}>{t('abrirEnDrive')}</Text>
        </TouchableOpacity>
      </View>

      <Text style={estilos.nota}>
        {t('notaPrivacidad')}
      </Text>
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
  vistaPreviaIcono: { fontSize: 48 },
  nombreArchivo: { fontSize: 13, color: colores.textoSuave, marginTop: espacio.sm },
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
    borderColor: colores.borde,
    paddingHorizontal: espacio.md,
  },
  campo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: espacio.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.borde,
  },
  campoEtiqueta: { fontSize: 14, color: colores.textoSuave },
  campoValor: { fontSize: 14, fontWeight: '500', color: colores.texto },
  acciones: { gap: espacio.sm },
  boton: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 12,
    paddingVertical: espacio.md,
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
