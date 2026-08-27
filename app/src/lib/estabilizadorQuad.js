const COINCIDENCIAS_PARA_BLOQUEAR = 2;
const FALLOS_PARA_PERDER = 3;
const IOU_ADQUISICION = 0.5;
const IOU_SEGUIMIENTO = 0.3;
const SUAVIZADO_ADQUISICION = 0.5;
const SUAVIZADO_SEGUIMIENTO = 0.28;

function areaPoligono(puntos) {
  if (!Array.isArray(puntos) || puntos.length < 3) return 0;
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % puntos.length];
    suma += a.x * b.y - b.x * a.y;
  }
  return Math.abs(suma) / 2;
}

function orientacion(puntos) {
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % puntos.length];
    suma += a.x * b.y - b.x * a.y;
  }
  return Math.sign(suma) || 1;
}

function dentro(p, a, b, signo) {
  const cruz = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return signo > 0 ? cruz >= -1e-9 : cruz <= 1e-9;
}

function interseccionSegmentos(inicio, fin, a, b) {
  const dx1 = fin.x - inicio.x;
  const dy1 = fin.y - inicio.y;
  const dx2 = b.x - a.x;
  const dy2 = b.y - a.y;
  const divisor = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(divisor) < 1e-9) return fin;
  const t = ((a.x - inicio.x) * dy2 - (a.y - inicio.y) * dx2) / divisor;
  return { x: inicio.x + t * dx1, y: inicio.y + t * dy1 };
}

// Sutherland–Hodgman: ambos quads llegan convexos y ordenados por el detector.
function recortarPoligono(sujeto, recorte) {
  let salida = sujeto.map((p) => ({ ...p }));
  const signo = orientacion(recorte);
  for (let i = 0; i < recorte.length; i++) {
    const a = recorte[i];
    const b = recorte[(i + 1) % recorte.length];
    const entrada = salida;
    salida = [];
    if (!entrada.length) break;
    let anterior = entrada[entrada.length - 1];
    for (const actual of entrada) {
      const actualDentro = dentro(actual, a, b, signo);
      const anteriorDentro = dentro(anterior, a, b, signo);
      if (actualDentro) {
        if (!anteriorDentro) salida.push(interseccionSegmentos(anterior, actual, a, b));
        salida.push(actual);
      } else if (anteriorDentro) {
        salida.push(interseccionSegmentos(anterior, actual, a, b));
      }
      anterior = actual;
    }
  }
  return salida;
}

function iouQuad(a, b) {
  if (!quadValido(a) || !quadValido(b)) return 0;
  const interseccion = areaPoligono(recortarPoligono(a, b));
  const union = areaPoligono(a) + areaPoligono(b) - interseccion;
  return union > 0 ? interseccion / union : 0;
}

function quadValido(esquinas) {
  if (!Array.isArray(esquinas) || esquinas.length !== 4) return false;
  if (!esquinas.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))) return false;
  const area = areaPoligono(esquinas);
  return area >= 0.04 && area <= 0.97;
}

function mezclar(anterior, nuevo, alfa) {
  return anterior.map((p, i) => ({
    x: p.x + (nuevo[i].x - p.x) * alfa,
    y: p.y + (nuevo[i].y - p.y) * alfa,
  }));
}

function estadoInicial() {
  return {
    estado: 'buscando',
    fase: 'buscando',
    esquinas: null,
    candidato: null,
    coincidencias: 0,
    fallos: 0,
  };
}

function estadoVisual(confiable) {
  return confiable ? 'listo' : 'parcial';
}

function actualizarEstabilizador(anterior, deteccion) {
  const previo = anterior || estadoInicial();
  const nuevo = quadValido(deteccion?.esquinas) ? deteccion.esquinas : null;

  if (previo.fase === 'bloqueado') {
    if (nuevo && iouQuad(previo.esquinas, nuevo) >= IOU_SEGUIMIENTO) {
      return {
        ...previo,
        estado: estadoVisual(Boolean(deteccion.confiable)),
        esquinas: mezclar(previo.esquinas, nuevo, SUAVIZADO_SEGUIMIENTO),
        candidato: null,
        coincidencias: COINCIDENCIAS_PARA_BLOQUEAR,
        fallos: 0,
      };
    }

    const fallos = previo.fallos + 1;
    if (fallos < FALLOS_PARA_PERDER) return { ...previo, fallos };
    // El candidato incompatible no se dibuja. Puede iniciar una adquisición
    // nueva, pero tendrá que repetirse antes de aparecer en pantalla.
    return {
      ...estadoInicial(),
      fase: nuevo ? 'adquiriendo' : 'buscando',
      candidato: nuevo,
      coincidencias: nuevo ? 1 : 0,
    };
  }

  if (!nuevo) return estadoInicial();

  const compatible =
    previo.candidato && iouQuad(previo.candidato, nuevo) >= IOU_ADQUISICION;
  const candidato = compatible
    ? mezclar(previo.candidato, nuevo, SUAVIZADO_ADQUISICION)
    : nuevo.map((p) => ({ ...p }));
  const coincidencias = compatible ? previo.coincidencias + 1 : 1;

  if (coincidencias < COINCIDENCIAS_PARA_BLOQUEAR) {
    return {
      ...estadoInicial(),
      fase: 'adquiriendo',
      candidato,
      coincidencias,
    };
  }

  return {
    estado: estadoVisual(Boolean(deteccion.confiable)),
    fase: 'bloqueado',
    esquinas: candidato,
    candidato: null,
    coincidencias,
    fallos: 0,
  };
}

module.exports = {
  actualizarEstabilizador,
  estadoInicial,
  iouQuad,
};
