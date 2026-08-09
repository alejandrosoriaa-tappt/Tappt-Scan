import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colores, espacio } from '../theme';
import Icono from '../components/Icono';

const VARIABLES = [['EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL]];

/**
 * Pantalla de último recurso cuando faltan variables de entorno.
 *
 * Sin esto la app queda en blanco y solo la consola dice por qué — que es
 * exactamente lo que no va a mirar quien está probando la beta. Está en
 * español fijo a propósito: es para quien despliega, no para el usuario.
 */
export default function ConfiguracionScreen() {
  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.contenido}>
        <View style={estilos.icono}>
          <Icono nombre="ajustes" tamano={34} color={colores.textoSuave} />
        </View>
        <Text style={estilos.titulo}>Falta configurar la app</Text>
        <Text style={estilos.texto}>
          No están definidas las variables de entorno. Revisa
          <Text style={estilos.codigo}> app/.env.example</Text> y vuelve a
          arrancar.
        </Text>

        <View style={estilos.lista}>
          {VARIABLES.map(([nombre, valor]) => (
            <View key={nombre} style={estilos.fila}>
              <View style={estilos.estado}>
                <Icono
                  nombre={valor ? 'verificado' : 'cerrar'}
                  tamano={15}
                  color={valor ? colores.primario : colores.peligro}
                />
              </View>
              <Text style={[estilos.variable, !valor && estilos.variableFalta]}>{nombre}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  contenido: { flex: 1, justifyContent: 'center', padding: espacio.lg },
  icono: { alignItems: 'center' },
  titulo: {
    fontSize: 20,
    fontWeight: '700',
    color: colores.texto,
    textAlign: 'center',
    marginTop: espacio.md,
  },
  texto: {
    fontSize: 14,
    color: colores.textoSuave,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: espacio.sm,
  },
  codigo: { fontWeight: '700', color: colores.texto },
  lista: {
    marginTop: espacio.lg,
    backgroundColor: colores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colores.divisor,
    padding: espacio.md,
  },
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: espacio.xs },
  estado: { width: 22 },
  variable: { fontSize: 12, color: colores.texto, flex: 1 },
  variableFalta: { color: colores.peligro, fontWeight: '600' },
});
