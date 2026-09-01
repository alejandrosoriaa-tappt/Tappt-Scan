import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import Icono from '../components/Icono';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import { alertar } from '../lib/alerta';
import { TEXTOS } from '../i18n/textos';
import { colores, espacio, tipo } from '../theme';
import { iapDisponible, comprasIAP } from '../lib/compras';

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
  const { cuenta, cerrarSesion, refrescarCuenta } = useSesion();
  const { t, idioma, setIdioma, idiomas } = useIdioma();
  const [comprando, setComprando] = useState(null); // 'personal' | 'negocio' | null

  /**
   * Dos canales de cobro (docs/DIRECCION-DISENO.md, decisión 2026-08-12):
   *
   * - Adentro de la app nativa (iOS/Android): IAP de la tienda. La guía
   *   3.1.1 de Apple prohíbe un botón que dirija a comprar fuera de su
   *   sistema — por eso aquí NUNCA se abre WhatsApp para comprar un plan
   *   nuevo, solo para gestionar uno que ya está activo.
   * - Web App: sigue siendo Stripe vía WhatsApp — ahí sí es válido, no
   *   hay tienda de por medio.
   */
  const abrirWhatsapp = (mensaje) => {
    const numero = cuenta?.numeroTapptScan || '';
    Linking.openURL(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`);
  };

  const comprarPlan = async (plan) => {
    setComprando(plan);
    try {
      await comprasIAP.comprarPlan(plan);
      await refrescarCuenta();
    } catch (err) {
      if (err.message !== 'E_USER_CANCELLED') alertar(t('noSePudo'), err.message);
    } finally {
      setComprando(null);
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
          {cuenta.planVence ? (
            <Fila
              etiqueta={t('renovacion')}
              valor={new Date(cuenta.planVence).toLocaleDateString()}
            />
          ) : null}
          <Fila
            etiqueta={t('escaneosEsteMes')}
            valor={
              cuenta.escaneosLimite == null
                ? `${cuenta.escaneosUsados} · ${t('sinLimite')}`
                : `${cuenta.escaneosUsados} / ${cuenta.escaneosLimite}`
            }
          />
        </View>

        {iapDisponible && cuenta.plan === 'gratis' ? (
          <View style={estilos.planesIAP}>
            {['personal', 'negocio'].map((plan) => (
              <TouchableOpacity
                key={plan}
                style={estilos.botonPlanIAP}
                onPress={() => comprarPlan(plan)}
                disabled={Boolean(comprando)}
                activeOpacity={0.85}
              >
                {comprando === plan ? (
                  <ActivityIndicator color={colores.primario} />
                ) : (
                  <Text style={estilos.botonPlanIAPTexto}>{t('suscribirseA', { plan: PLANES[plan] })}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <TouchableOpacity
            style={estilos.botonWhatsapp}
            onPress={() => abrirWhatsapp(t(cuenta.plan === 'gratis' ? 'mensajeQuieroMas' : 'mensajeMiSuscripcion'))}
            activeOpacity={0.85}
          >
            <Icono nombre="whatsapp" tamano={19} color={colores.primario} />
            <Text style={estilos.botonWhatsappTexto}>
              {t(cuenta.plan === 'gratis' ? 'hablarDePlanes' : 'gestionarSuscripcion')}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={cerrarSesion}>
          <Text style={estilos.salir}>{t('cerrarSesion')}</Text>
        </TouchableOpacity>

        <Text style={estilos.nota}>{t('promesa')}</Text>
        <Text style={estilos.creditos}>{t('desarrolladoPor')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio.md, paddingBottom: espacio.xl },
  titulo: { ...tipo.titulo, color: colores.texto, marginVertical: espacio.sm },
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
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espacio.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colores.divisor,
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
    borderColor: colores.divisor,
    backgroundColor: colores.superficie,
  },
  chipIdiomaActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipIdiomaTexto: { fontSize: 14, color: colores.textoSuave, fontWeight: '500' },
  chipIdiomaTextoActivo: { color: '#FFFFFF', fontWeight: '700' },
  botonWhatsapp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.sm,
    backgroundColor: colores.primarioSuave,
    borderRadius: 12,
    paddingVertical: espacio.md,
    marginTop: espacio.md,
  },
  botonWhatsappTexto: { color: colores.primario, fontSize: 15, fontWeight: '600' },
  planesIAP: { gap: espacio.sm, marginTop: espacio.md },
  botonPlanIAP: {
    backgroundColor: colores.primario,
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
  },
  botonPlanIAPTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  salir: { color: colores.peligro, fontSize: 14, textAlign: 'center', marginTop: espacio.lg },
  nota: {
    fontSize: 12,
    color: colores.textoSuave,
    lineHeight: 18,
    marginTop: espacio.lg,
    textAlign: 'center',
  },
  creditos: {
    fontSize: 11,
    color: colores.textoTerciario,
    textAlign: 'center',
    marginTop: espacio.sm,
  },
});
