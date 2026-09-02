import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { api } from '../lib/api';
import Icono from './Icono';
import { colores } from '../theme';

// Evita volver a descargar la portada cada vez que una fila sale y entra de
// pantalla. La caché solo vive durante la sesión y nunca sale del teléfono.
const cache = new Map();

export default function DocumentoMiniatura({ documento, width = 52, height = 68, style }) {
  const guardada = cache.get(documento.id);
  const [miniatura, setMiniatura] = useState(guardada || null);
  const [cargando, setCargando] = useState(!guardada);

  useEffect(() => {
    let activa = true;
    const existente = cache.get(documento.id);
    if (existente) {
      setMiniatura(existente);
      setCargando(false);
      return () => { activa = false; };
    }

    setMiniatura(null);
    setCargando(true);
    api.miniatura(documento.id)
      .then((respuesta) => {
        const valor = {
          uri: `data:${respuesta.mimeType};base64,${respuesta.imagen}`,
          paginas: respuesta.paginas || documento.paginas || 1,
        };
        cache.set(documento.id, valor);
        if (activa) setMiniatura(valor);
      })
      .catch(() => {})
      .finally(() => {
        if (activa) setCargando(false);
      });

    return () => { activa = false; };
  }, [documento.id]);

  return (
    <View style={[estilos.marco, { width, height }, style]}>
      {miniatura ? (
        <Image source={{ uri: miniatura.uri }} style={estilos.imagen} resizeMode="cover" />
      ) : cargando ? (
        <ActivityIndicator size="small" color={colores.primario} />
      ) : (
        <Icono nombre="documento" tamano={Math.min(width, height) * 0.42} color={colores.textoTerciario} />
      )}
      {(miniatura?.paginas || documento.paginas || 1) > 1 ? (
        <View style={estilos.paginas}>
          <Text style={estilos.paginasTexto}>{miniatura?.paginas || documento.paginas}</Text>
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  marco: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colores.superficieElevada,
    borderWidth: 1,
    borderColor: colores.divisor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagen: { width: '100%', height: '100%' },
  paginas: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(15,23,32,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginasTexto: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
});
