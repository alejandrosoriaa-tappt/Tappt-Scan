import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useSesion } from '../context/SesionContext';
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
  const [pidiendo, setPidiendo] = useState(false);

  // El cobro NUNCA va dentro de la app (evita la comisión de las tiendas):
  // el backend genera el link de MercadoPago y lo manda por WhatsApp.
  const pedirUpgrade = async (plan) => {
    setPidiendo(true);
    try {
      const { enviadoPorWhatsapp } = await api.upgrade(plan);
      Alert.alert(
        'Link enviado',
        enviadoPorWhatsapp
          ? 'Te mandamos el link de pago por WhatsApp para completar la compra.'
          : 'Conecta tu WhatsApp para recibir el link de pago.'
      );
    } catch (err) {
      Alert.alert('No pudimos generar el pago', err.message);
    } finally {
      setPidiendo(false);
    }
  };

  if (!cuenta) return <SafeAreaView style={estilos.pantalla} />;

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Text style={estilos.titulo}>Ajustes</Text>

        <Text style={estilos.tituloSeccion}>Cuenta</Text>
        <View style={estilos.tarjeta}>
          <Fila etiqueta="Correo" valor={cuenta.email} />
          <Fila
            etiqueta="WhatsApp"
            valor={cuenta.whatsapp || 'Sin conectar'}
            estado={cuenta.whatsapp ? '#16A34A' : colores.peligro}
          />
          <Fila
            etiqueta="Google Drive"
            valor={cuenta.driveConectado ? 'Conectado' : 'Sin conectar'}
            estado={cuenta.driveConectado ? '#16A34A' : colores.peligro}
          />
        </View>

        <Text style={estilos.tituloSeccion}>Plan</Text>
        <View style={estilos.tarjeta}>
          <Fila etiqueta="Plan actual" valor={PLANES[cuenta.plan]} />
          <Fila
            etiqueta="Escaneos este mes"
            valor={
              cuenta.escaneosLimite == null
                ? `${cuenta.escaneosUsados} · sin límite`
                : `${cuenta.escaneosUsados} de ${cuenta.escaneosLimite}`
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
              <Text style={estilos.botonUpgradeTexto}>Mejorar a Personal — $299/año</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={estilos.botonSecundario}
              onPress={() => pedirUpgrade('negocio')}
              disabled={pidiendo}
              activeOpacity={0.8}
            >
              <Text style={estilos.botonSecundarioTexto}>Negocio — $499/año</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity onPress={cerrarSesion}>
          <Text style={estilos.salir}>Cerrar sesión</Text>
        </TouchableOpacity>

        <Text style={estilos.nota}>
          Tus documentos no se guardan en nuestros servidores — viven en tu Google Drive.
        </Text>
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
