import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { colores, tipo, espacio } from '../theme';

/**
 * Pantalla de entrada — brief prompt 1: sobria, oscura, centrada en marca,
 * sin ruido visual. Se usa mientras se resuelve la sesión (¿hay token?
 * ¿está vigente?) antes de decidir Login/Onboarding/app.
 *
 * El pulso discreto en el logo es la única animación — nada que compita
 * con la marca mientras carga.
 */
export default function Splash() {
  const pulso = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 0.55, duration: 900, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    animacion.start();
    return () => animacion.stop();
  }, [pulso]);

  return (
    <View style={estilos.pantalla}>
      <Animated.View style={{ opacity: pulso }}>
        <Text style={estilos.logo}>
          Tappt<Text style={estilos.logoAcento}>Scan</Text>
        </Text>
      </Animated.View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colores.fondo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8, color: colores.texto },
  logoAcento: { color: colores.primario },
});
