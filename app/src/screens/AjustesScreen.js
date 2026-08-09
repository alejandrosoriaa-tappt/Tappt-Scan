import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usuario } from '../data/mock';
import { colores, espacio } from '../theme';

const PLANES = {
  gratis: 'Gratis',
  personal: 'Personal',
  negocio: 'Negocio',
};

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
  // El cobro NUNCA va dentro de la app (evita la comisión de las tiendas):
  // se manda el link de MercadoPago por WhatsApp.
  const pedirUpgrade = () =>
    Alert.alert(
      'Mejorar plan',
      'Te mandamos el link de pago por WhatsApp para completar la compra.'
    );

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Text style={estilos.titulo}>Ajustes</Text>

        <Text style={estilos.tituloSeccion}>Cuenta</Text>
        <View style={estilos.tarjeta}>
          <Fila etiqueta="Correo" valor={usuario.email} />
          <Fila etiqueta="WhatsApp" valor={usuario.whatsapp} estado="#16A34A" />
          <Fila
            etiqueta="Google Drive"
            valor={usuario.driveConectado ? 'Conectado' : 'Sin conectar'}
            estado={usuario.driveConectado ? '#16A34A' : colores.peligro}
          />
        </View>

        <Text style={estilos.tituloSeccion}>Plan</Text>
        <View style={estilos.tarjeta}>
          <Fila etiqueta="Plan actual" valor={PLANES[usuario.plan]} />
          <Fila
            etiqueta="Escaneos este mes"
            valor={`${usuario.escaneosUsados} de ${usuario.escaneosLimite}`}
          />
        </View>

        {usuario.plan === 'gratis' ? (
          <TouchableOpacity style={estilos.botonUpgrade} onPress={pedirUpgrade} activeOpacity={0.8}>
            <Text style={estilos.botonUpgradeTexto}>Mejorar a Personal — $299/año</Text>
          </TouchableOpacity>
        ) : null}

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
  botonUpgrade: {
    backgroundColor: colores.primario,
    borderRadius: 12,
    paddingVertical: espacio.md,
    alignItems: 'center',
    marginTop: espacio.md,
  },
  botonUpgradeTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  nota: {
    fontSize: 12,
    color: colores.textoSuave,
    lineHeight: 18,
    marginTop: espacio.lg,
    textAlign: 'center',
  },
});
