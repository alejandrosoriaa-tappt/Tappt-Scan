import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useCargar from '../hooks/useCargar';
import { api } from '../lib/api';
import { useSesion } from '../context/SesionContext';
import { useIdioma } from '../i18n';
import Icono, { IconoChip } from '../components/Icono';
import { Tarjeta, Barra, formatoDinero } from '../components/comunes';
import { colores, porCategoriaGasto, espacio, radio, tipo, sombra } from '../theme';
import { MESES } from '../i18n/meses';

const ALTO_GRAFICA = 120;

// Gráfica de barras por día. Es deliberadamente simple: sin ejes ni
// etiquetas por barra, porque lo que importa aquí es la forma del mes —
// dónde se concentró el gasto— no leer valores exactos.
function Grafica({ serie }) {
  const maximo = Math.max(...serie, 1);

  return (
    <View style={estilos.grafica}>
      {serie.map((valor, i) => (
        <View
          key={i}
          style={[
            estilos.barra,
            {
              height: Math.max(2, (valor / maximo) * ALTO_GRAFICA),
              backgroundColor: valor > 0 ? colores.primario : 'rgba(255,255,255,0.14)',
            },
          ]}
        />
      ))}
    </View>
  );
}

function mesAnterior(mes) {
  const [anio, m] = mes.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, m - 2, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mesSiguiente(mes) {
  const [anio, m] = mes.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, m, 1));
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mesActual() {
  const hoy = new Date();
  return `${hoy.getUTCFullYear()}-${String(hoy.getUTCMonth() + 1).padStart(2, '0')}`;
}

export default function GastosScreen({ navigation }) {
  const { t, idioma } = useIdioma();
  const { cuenta } = useSesion();
  const [mes, setMes] = useState(mesActual());

  const gastos = useCargar(() => api.gastos(mes), [mes]);
  const datos = gastos.datos;

  const esNegocio = cuenta?.plan === 'negocio';
  const nombreMes = () => {
    const [anio, m] = mes.split('-').map(Number);
    return `${(MESES[idioma] || MESES.es)[m - 1]} ${anio}`;
  };

  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <ScrollView contentContainerStyle={estilos.scroll} showsVerticalScrollIndicator={false}>
        <Text style={estilos.titulo}>{t('gastos')}</Text>

        <View style={estilos.selectorMes}>
          <TouchableOpacity onPress={() => setMes(mesAnterior(mes))} style={estilos.flechaBoton}>
            <Icono nombre="izquierda" tamano={18} color={colores.texto} />
          </TouchableOpacity>
          <Text style={estilos.mes}>{nombreMes()}</Text>
          <TouchableOpacity
            onPress={() => setMes(mesSiguiente(mes))}
            style={estilos.flechaBoton}
            disabled={mes >= mesActual()}
          >
            <Icono
              nombre="derecha"
              tamano={18}
              color={mes >= mesActual() ? colores.divisor : colores.texto}
            />
          </TouchableOpacity>
        </View>

        {gastos.cargando && !datos ? (
          <ActivityIndicator color={colores.primario} style={{ marginTop: espacio.xl }} />
        ) : (
          <>
            <View style={estilos.tarjetaTotal}>
              <Text style={estilos.totalEtiqueta}>{t('totalGastado')}</Text>
              <Text style={estilos.totalValor}>{formatoDinero(datos?.total ?? 0)}</Text>

              {datos?.variacion != null ? (
                <Text
                  style={[
                    estilos.variacion,
                    { color: datos.variacion <= 0 ? colores.primario : '#FCA5A5' },
                  ]}
                >
                  {datos.variacion <= 0 ? '↓' : '↑'} {Math.abs(datos.variacion)}%{' '}
                  {t(datos.variacion <= 0 ? 'menosQueMesPasado' : 'masQueMesPasado')}
                </Text>
              ) : null}

              {datos?.serie?.length ? <Grafica serie={datos.serie} /> : null}
            </View>

            <Text style={estilos.subtitulo}>{t('porCategoria')}</Text>

            {datos?.porCategoria?.length ? (
              <Tarjeta>
                {datos.porCategoria.map((categoria, i) => {
                  const meta = porCategoriaGasto[categoria.clave] || porCategoriaGasto.otros;
                  return (
                    <View
                      key={categoria.clave}
                      style={[estilos.categoria, i > 0 && estilos.categoriaBorde]}
                    >
                      <IconoChip
                        nombre={meta.icono}
                        fondo={meta.fondo}
                        trazo={meta.trazo}
                        tamano={38}
                      />
                      <View style={estilos.categoriaCentro}>
                        <View style={estilos.categoriaFila}>
                          <Text style={estilos.categoriaNombre}>
                            {t(`gasto_${categoria.clave}`)}
                          </Text>
                          <Text style={estilos.categoriaMonto}>
                            {formatoDinero(categoria.monto)}
                          </Text>
                          <Text style={estilos.categoriaPorcentaje}>{categoria.porcentaje}%</Text>
                        </View>
                        <View style={{ marginTop: espacio.xs + 2 }}>
                          <Barra porcentaje={categoria.porcentaje} color={meta.trazo} alto={5} />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Tarjeta>
            ) : (
              <Tarjeta>
                <Text style={estilos.vacio}>{t('sinGastos')}</Text>
              </Tarjeta>
            )}

            {!esNegocio ? (
              <TouchableOpacity
                style={estilos.promo}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('Ajustes')}
              >
                <Text style={estilos.promoTitulo}>{t('promoNegocioTitulo')}</Text>
                <Text style={estilos.promoTexto}>{t('promoNegocioTexto')}</Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  scroll: { padding: espacio.md, paddingBottom: 96 },
  titulo: { ...tipo.titulo, color: colores.texto, marginVertical: espacio.sm },

  selectorMes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    paddingHorizontal: espacio.sm,
    paddingVertical: espacio.xs,
    marginBottom: espacio.md,
    ...sombra,
  },
  flechaBoton: { paddingHorizontal: espacio.md, paddingVertical: espacio.xs },
  mes: { ...tipo.cuerpoFuerte, color: colores.texto },

  tarjetaTotal: {
    backgroundColor: colores.oscuro,
    borderRadius: radio.xl,
    padding: espacio.lg,
  },
  totalEtiqueta: { ...tipo.secundario, color: 'rgba(255,255,255,0.65)' },
  totalValor: { ...tipo.metricaGrande, color: colores.blanco, marginTop: espacio.xs },
  variacion: { ...tipo.menor, marginTop: espacio.xs },
  grafica: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: ALTO_GRAFICA,
    gap: 3,
    marginTop: espacio.lg,
  },
  barra: { flex: 1, borderRadius: 3, minWidth: 3 },

  subtitulo: {
    ...tipo.seccion,
    color: colores.texto,
    marginTop: espacio.lg,
    marginBottom: espacio.sm,
  },

  categoria: { flexDirection: 'row', alignItems: 'center', paddingVertical: espacio.sm + 2 },
  categoriaBorde: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.divisor },
  categoriaCentro: { flex: 1, marginLeft: espacio.md },
  categoriaFila: { flexDirection: 'row', alignItems: 'center' },
  categoriaNombre: { flex: 1, ...tipo.cuerpoFuerte, fontSize: 14, color: colores.texto },
  categoriaMonto: { ...tipo.cuerpoFuerte, fontSize: 14, color: colores.texto },
  categoriaPorcentaje: {
    ...tipo.menor,
    color: colores.textoSuave,
    marginLeft: espacio.sm,
    width: 34,
    textAlign: 'right',
  },

  vacio: { ...tipo.cuerpo, color: colores.textoSuave, textAlign: 'center', paddingVertical: espacio.md },

  promo: {
    backgroundColor: colores.primarioSuave,
    borderRadius: radio.lg,
    padding: espacio.md,
    marginTop: espacio.md,
  },
  promoTitulo: { ...tipo.cuerpoFuerte, fontSize: 14, color: '#0B6B4F' },
  promoTexto: { ...tipo.menor, color: '#0B6B4F', marginTop: 4, lineHeight: 17 },
});
