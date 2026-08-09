import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import { TEXTOS } from '../i18n/textos';
import { colores, espacio } from '../theme';

const PLANES = { gratis: 'Gratis', personal: 'Personal', negocio: 'Negocio' };

function Fila({ etiqueta, valor, estado }) {
  return (
    <View style={estilos.fila}>
      <Text style={estilos.filaEtiqueta}>{etiqueta}</Text>
      <View style={estilos.filaDerecha}>
        <Text style={estilos.filaValor}>{valor}</Text>
        {estado ? <View style={[estilos.punto, { backgroundColor: estado }]} /> : null}
      </View>
    </View>
  );
}

export default function AjustesScreen() {
  const { cuenta, cerrarSesion } = useSesion();
  const { t, idioma, setIdioma, idiomas } = useIdioma();
  const [pidiendo, setPidiendo] = useState(false);

  // El cobro NUNCA va dentro de la app (evita la comisión de las tiendas):
  // el backend genera el link de Stripe y lo manda por WhatsApp.
  const pedirUpgrade = async (plan) => {
    setPidiendo(true);
    try {
      const { enviadoPorWhatsapp } = await api.upgrade(plan);
      Alert.alert(
        t('linkEnviado'),
        enviadoPorWhatsapp ? t('linkEnviadoDetalle') : t('conectaWhatsappParaPago')
      );
    } catch (err) {
      Alert.alert(t('noPudimosEntrar'), err.message);
    } finally {
      setPidiendo(false);
    }
  };

  if (!cuenta) return <SafeAreaView style={estilos.pantalla} />;

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Text style={estilos.titulo}>{t('ajustes')}</Text>

        <Text style={estilos.tituloSeccion}>{t('cuenta')}</Text>
        <View style={estilos.tarjeta}>
          <Fila etiqueta={t('correo')} valor={cuenta.email} />
          <Fila
            etiqueta={t('whatsapp')}
            valor={cuenta.whatsapp || t('sinConectar')}
            estado={cuenta.whatsapp ? '#16A34A' : colores.peligro}
          />
          <Fila
            etiqueta={t('googleDrive')}
            valor={cuenta.driveConectado ? t('conectado', { valor: '' }).trim() : t('sinConectar')}
            estado={cuenta.driveConectado ? '#16A34A' : colores.peligro}
          />
        </View>

        <Text style={estilos.tituloSeccion}>{t('idioma')}</Text>
        <View style={estilos.filaIdiomas}>
          {idiomas.map((codigo) => (
            <TouchableOpacity
              key={codigo}
              style={[estilos.chipIdioma, idioma === codigo && estilos.chipIdiomaActivo]}
              onPress={() => setIdioma(codigo)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  estilos.chipIdiomaTexto,
                  idioma === codigo && estilos.chipIdiomaTextoActivo,
                ]}
              >
                {TEXTOS[codigo].nombreIdioma}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={estilos.tituloSeccion}>{t('plan')}</Text>
        <View style={estilos.tarjeta}>
          <Fila etiqueta={t('planActual')} valor={PLANES[cuenta.plan]} />
          <Fila
            etiqueta={t('escaneosEsteMes')}
            valor={
              cuenta.escaneosLimite == null
                ? `${cuenta.escaneosUsados} · ${t('sinLimite')}`
                : `${cuenta.escaneosUsados} / ${cuenta.escaneosLimite}`
            }
          />
        </View>

        {cuenta.plan === 'gratis' ? (
          <View style={estilos.acciones}>
            <TouchableOpacity
              style={estilos.botonUpgrade}
              onPress={() => pedirUpgrade('personal')}
              disabled={pidiendo}
              activeOpacity={0.8}
            >
              <Text style={estilos.botonUpgradeTexto}>{t('mejorarPersonal')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={estilos.botonSecundario}
              onPress={() => pedirUpgrade('negocio')}
              disabled={pidiendo}
              activeOpacity={0.8}
            >
              <Text style={estilos.botonSecundarioTexto}>Negocio</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity onPress={cerrarSesion}>
          <Text style={estilos.salir}>{t('cerrarSesion')}</Text>
        </TouchableOpacity>

        <Text style={estilos.nota}>{t('promesa')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.md, paddingBottom: espacio.xl },
  titulo: { fontSize: 26, fontWeight: '700', color: colores.texto },
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
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacio.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.borde,
  },
  filaEtiqueta: { fontSize: 14, color: colores.textoSuave },
  filaDerecha: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm },
  filaValor: { fontSize: 14, fontWeight: '500', color: colores.texto },
  punto: { width: 8, height: 8, borderRadius: 4 },
  filaIdiomas: { flexDirection: 'row', gap: espacio.sm },
  chipIdioma: {
    paddingVertical: espacio.sm,
    paddingHorizontal: espacio.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  chipIdiomaActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipIdiomaTexto: { fontSize: 14, color: colores.textoSuave, fontWeight: '500' },
  chipIdiomaTextoActivo: { color: '#FFFFFF', fontWeight: '700' },
  acciones: { gap: espacio.sm, marginTop: espacio.md },
  botonUpgrade: {
    backgroundColor: colores.primario,
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonUpgradeTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  botonSecundario: {
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonSecundarioTexto: { color: colores.texto, fontSize: 15, fontWeight: '600' },
  salir: { color: colores.peligro, fontSize: 14, textAlign: 'center', marginTop: espacio.lg },
  nota: {
    fontSize: 12,
    color: colores.textoSuave,
    lineHeight: 18,
    marginTop: espacio.lg,
    textAlign: 'center',
  },
});
