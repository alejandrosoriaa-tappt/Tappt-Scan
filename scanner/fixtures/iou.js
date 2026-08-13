'use strict';

/**
 * IoU (intersección sobre unión) entre dos cuadriláteros convexos.
 *
 * Es la métrica del banco de fixtures: dice qué tanto se parece el quad
 * detectado al perímetro real del papel, en un solo número entre 0 y 1.
 * Un quad correcto pero un poco corrido da 0.9; uno que agarró una tabla
 * interna da 0.3; uno que agarró el cuadro completo da el cociente de
 * áreas. Comparar esquina por esquina no serviría: dos anotaciones
 * igual de buenas difieren unos píxeles y eso no debe contar como error.
 */

function areaPoligono(puntos) {
  if (!puntos || puntos.length < 3) return 0;
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % puntos.length];
    suma += a.x * b.y - b.x * a.y;
  }
  return Math.abs(suma) / 2;
}

function sentidoAntihorario(puntos) {
  let suma = 0;
  for (let i = 0; i < puntos.length; i++) {
    const a = puntos[i];
    const b = puntos[(i + 1) % puntos.length];
    suma += a.x * b.y - b.x * a.y;
  }
  return suma > 0 ? puntos : puntos.slice().reverse();
}

function dentro(p, a, b) {
  // Lado izquierdo de la arista a→b, con el polígono en sentido antihorario.
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0;
}

function interseccion(p, q, a, b) {
  const x1 = p.x;
  const y1 = p.y;
  const x2 = q.x;
  const y2 = q.y;
  const x3 = a.x;
  const y3 = a.y;
  const x4 = b.x;
  const y4 = b.y;
  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(den) < 1e-12) return q;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
}

/**
 * Recorte de Sutherland–Hodgman: recorta el polígono `sujeto` contra cada
 * arista del `recortador`. Vale porque ambos son convexos.
 */
function recortar(sujeto, recortador) {
  let salida = sujeto;
  for (let i = 0; i < recortador.length; i++) {
    const a = recortador[i];
    const b = recortador[(i + 1) % recortador.length];
    const entrada = salida;
    salida = [];
    for (let j = 0; j < entrada.length; j++) {
      const actual = entrada[j];
      const previo = entrada[(j + entrada.length - 1) % entrada.length];
      const actualDentro = dentro(actual, a, b);
      const previoDentro = dentro(previo, a, b);
      if (actualDentro) {
        if (!previoDentro) salida.push(interseccion(previo, actual, a, b));
        salida.push(actual);
      } else if (previoDentro) {
        salida.push(interseccion(previo, actual, a, b));
      }
    }
    if (!salida.length) return [];
  }
  return salida;
}

function iou(quadA, quadB) {
  if (!quadA || !quadB || quadA.length !== 4 || quadB.length !== 4) return 0;
  const a = sentidoAntihorario(quadA);
  const b = sentidoAntihorario(quadB);
  const areaA = areaPoligono(a);
  const areaB = areaPoligono(b);
  if (areaA <= 0 || areaB <= 0) return 0;
  const inter = areaPoligono(recortar(a, b));
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

module.exports = { iou, areaPoligono };
