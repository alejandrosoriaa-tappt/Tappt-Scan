const PROPORCIONES_PAPEL = {
  carta: 8.5 / 11,
  a4: 210 / 297,
};

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dimensionesDestino(origen, formato = null) {
  const [supIzq, supDer, infDer, infIzq] = origen;
  let ancho = Math.round(Math.max(distancia(supIzq, supDer), distancia(infIzq, infDer)));
  let alto = Math.round(Math.max(distancia(supIzq, infIzq), distancia(supDer, infDer)));

  const proporcionCruda = ancho / alto;
  // En automatico solo normalizamos candidatos con silueta de hoja Carta.
  // Una credencial, ticket, fotografia u objeto cuadrado conserva su forma.
  const pareceCarta =
    (proporcionCruda >= 0.72 && proporcionCruda <= 0.92) ||
    (proporcionCruda >= 1 / 0.92 && proporcionCruda <= 1 / 0.72);
  const formatoResuelto = formato === 'auto' && pareceCarta ? 'carta' : formato;
  const proporcionBase = PROPORCIONES_PAPEL[formatoResuelto];
  if (proporcionBase) {
    const vertical = alto >= ancho;
    const proporcion = vertical ? proporcionBase : 1 / proporcionBase;
    const area = ancho * alto;
    ancho = Math.round(Math.sqrt(area * proporcion));
    alto = Math.round(ancho / proporcion);
  }

  return { ancho, alto };
}

module.exports = { dimensionesDestino, PROPORCIONES_PAPEL };
