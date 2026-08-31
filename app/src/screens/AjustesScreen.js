import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import Icono from '../components/Icono';
import { useSesion } from '../context/SesionContext';
import { api } from '../lib/api';
import { useIdioma } from '../i18n';
import { alertar, alertarConBotones } from '../lib/alerta';
import { TEXTOS } from '../i18n/textos';
import { colores, espacio } from '../theme';
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
  const [eliminando, setEliminando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);

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

  /**
   * Restaurar compras — Apple lo exige (guía 3.1.1) en toda app con
   * suscripciones. No cobra nada: le pregunta a la tienda qué compró ya
   * esta cuenta y revalida contra el backend.
   *
   * Se muestra SIEMPRE que haya IAP, no solo en plan gratis: el caso que
   * resuelve es justo el del usuario que ya pagó y la app no lo sabe
   * (reinstaló, cambió de teléfono, o entró con otra sesión).
   */
  const restaurarCompras = async () => {
    setRestaurando(true);
    try {
      const resultado = await comprasIAP.restaurarCompras();
      if (resultado) {
        await refrescarCuenta();
        alertar(t('restaurarListo'), t('restaurarListoDetalle'));
      } else {
        alertar(t('restaurarNada'), t('restaurarNadaDetalle'));
      }
    } catch (err) {
      alertar(t('noSePudo'), err.message);
    } finally {
      setRestaurando(false);
    }
  };

  /**
   * Borrado de cuenta — la App Store lo exige (guía 5.1.1(v)) para
   * cualquier app que deje crear una cuenta, y aquí la cuenta nace sola con
   * el primer mensaje de WhatsApp.
   *
   * Se avisa que los documentos NO se borran (viven en su Drive, son suyos)
   * y, si la suscripción vino de la tienda, que esa la tiene que cancelar
   * él desde los ajustes del sistema: ni Apple ni Google dejan cancelarla
   * desde el servidor.
   */
  const eliminarCuenta = () => {
    const deTienda = iapDisponible && cuenta.plan !== 'gratis';
    const detalle = deTienda
      ? `${t('eliminarCuentaDetalle')}\n\n${t('eliminarCuentaTienda')}`
      : t('eliminarCuentaDetalle');

    alertarConBotones(t('eliminarCuentaTitulo'), detalle, [
      {
        text: t('eliminarCuentaConfirmar'),
        style: 'destructive',
        onPress: async () => {
          setEliminando(true);
          try {
            await api.eliminarCuenta();
            alertar(t('eliminarCuentaLista'));
            // Sin cuenta no hay a dónde volver: cerrar sesión deja la app
            // en Login, que es el único estado válido a partir de aquí.
            await cerrarSesion();
          } catch (err) {
            alertar(t('noSePudo'), err.message);
            setEliminando(false);
          }
        },
      },
      { text: t('eliminarCuentaCancelar'), style: 'cancel' },
    ]);
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

        {iapDisponible ? (
          <TouchableOpacity
            style={estilos.botonRestaurar}
            onPress={restaurarCompras}
            disabled={restaurando}
            activeOpacity={0.85}
          >
            {restaurando ? (
              <ActivityIndicator color={colores.textoSuave} />
            ) : (
              <Text style={estilos.botonRestaurarTexto}>{t('restaurarCompras')}</Text>
            )}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity onPress={cerrarSesion}>
          <Text style={estilos.salir}>{t('cerrarSesion')}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={eliminarCuenta} disabled={eliminando}>
          {eliminando ? (
            <ActivityIndicator style={estilos.eliminar} color={colores.peligro} />
          ) : (
            <Text style={[estilos.salir, estilos.eliminar]}>{t('eliminarCuenta')}</Text>
          )}
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
  botonRestaurar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.divisor,
    paddingVertical: espacio.md,
    marginTop: espacio.sm,
  },
  botonRestaurarTexto: { color: colores.textoSuave, fontSize: 14, fontWeight: '600' },
  salir: { color: colores.peligro, fontSize: 14, textAlign: 'center', marginTop: espacio.lg },
  // Deliberadamente discreto y separado de "cerrar sesión": tiene que ser
  // fácil de encontrar (Apple lo revisa) y difícil de tocar por accidente.
  eliminar: { fontSize: 13, marginTop: espacio.md, opacity: 0.7 },
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
