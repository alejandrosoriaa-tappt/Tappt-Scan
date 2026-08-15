# Fotos del banco de fixtures

Aquí van las tomas reales del dispositivo. **Dos archivos por toma**, tal como
los entrega el botón "Compartir fixture" de `scan.tappt.lat/?scannerDebug=1`:

```
tapptscan-fixture-<sello>.jpg     el frame EXACTO que recibió el detector
tapptscan-fixture-<sello>.json    lo que el detector respondió en ese instante
```

No sirven capturas de pantalla del teléfono: traen la interfaz encima, están
reescaladas y recomprimidas, y el detector nunca ve esa imagen.

**Tampoco sirve el `-visual-` solo.** El botón comparte además una imagen
`tapptscan-fixture-visual-*.jpg` con el contorno ya dibujado encima: sirve
para enseñar de un vistazo qué vio el detector, pero como fixture no vale
—lleva el overlay quemado y no trae el JSON al lado—. Si de una toma solo
llega el visual, esa toma no se puede registrar; hay que repetirla.

## Escenarios pendientes

| # | Escenario | Estado |
|---|---|---|
| 1 | Granito claro, documento centrado | ✅ `granito-centrado` (2026-08-14) |
| 2 | Granito claro, documento de lado | ✅ `granito-de-lado` (2026-08-14) |
| 3 | Granito solo, SIN documento (el detector no debe inventar nada) | ✅ `granito-vacio` (2026-08-14) |
| 4 | Madera con reflejo de ventana | falta |
| 5 | Documento lejos, chico en el cuadro | falta |
| 6 | Documento muy inclinado | falta |
| 7 | Documento cortado por el borde del cuadro | falta |
| 8 | Poca luz | falta |
| 9 | Superficie oscura | falta |
| 10 | Dos hojas encimadas (debe tomar la de arriba) | falta |

Prioridad de lo que falta: **4 (madera con reflejo) y 9 (superficie oscura)**,
que son las otras dos que ya se sabe que dan guerra. Las demás completan el
set de 20.

La #3 ya entró y contestó su pregunta: sobre granito vacío los dos detectores
inventan, pero la **máscara de DocQuad se apaga** (`areaGt05=11`,
`meanProb=0.004`, contra ≥97 y ≥0.023 en todas las que sí tienen documento).
Es la primera señal medida que separa "no hay nada" de "hay algo".

## Qué pasa después

Cada foto se anota a mano (dónde está de verdad el documento) y se registra en
`scanner/fixtures/manifest.js`. A partir de ahí `npm run scanner:fixtures` la
mide por IoU en cada cambio del detector, y el CI bloquea las regresiones.
