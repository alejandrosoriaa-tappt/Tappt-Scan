'use strict';

function alpha(cutoff, dt) {
  const tau = 1 / (2 * Math.PI * cutoff);
  return dt / (dt + tau);
}

function crearFiltroOneEuro(t0, esquinas, opciones = {}) {
  if (!Array.isArray(esquinas) || esquinas.length !== 4) {
    throw new Error('one_euro_quad_invalido');
  }
  return {
    t: t0,
    puntos: esquinas.map((p) => ({ x: p.x, y: p.y })),
    velocidad: esquinas.map(() => ({ x: 0, y: 0 })),
    minCutoff: opciones.minCutoff ?? 0.5,
    beta: opciones.beta ?? 0.1,
    dCutoff: opciones.dCutoff ?? 1,
  };
}

function filtrarOneEuro(estado, t, esquinas) {
  if (!estado) return { estado: crearFiltroOneEuro(t, esquinas), esquinas };
  if (!(t > estado.t)) return { estado, esquinas: estado.puntos };
  const dt = t - estado.t;
  const aD = alpha(estado.dCutoff, dt);

  const velocidad = esquinas.map((p, i) => {
    const anterior = estado.puntos[i];
    const previa = estado.velocidad[i];
    return {
      x: aD * ((p.x - anterior.x) / dt) + (1 - aD) * previa.x,
      y: aD * ((p.y - anterior.y) / dt) + (1 - aD) * previa.y,
    };
  });

  const puntos = esquinas.map((p, i) => {
    const anterior = estado.puntos[i];
    // El paper define cutoff por magnitud de la derivada. Usar la magnitud
    // conjunta evita deformar cada eje con una respuesta diferente.
    const rapidez = Math.hypot(velocidad[i].x, velocidad[i].y);
    const a = alpha(estado.minCutoff + estado.beta * rapidez, dt);
    return {
      x: a * p.x + (1 - a) * anterior.x,
      y: a * p.y + (1 - a) * anterior.y,
    };
  });

  return {
    estado: { ...estado, t, puntos, velocidad },
    esquinas: puntos,
  };
}

module.exports = { crearFiltroOneEuro, filtrarOneEuro };
