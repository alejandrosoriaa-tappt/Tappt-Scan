# Fotos del banco de fixtures

Aquí van las tomas reales del dispositivo. **Dos archivos por toma**, tal como
los entrega el botón "Compartir fixture" de `scan.tappt.lat/?scannerDebug=1`:

```
tapptscan-fixture-<sello>.jpg     el frame EXACTO que recibió el detector
tapptscan-fixture-<sello>.json    lo que el detector respondió en ese instante
```

No sirven capturas de pantalla del teléfono: traen la interfaz encima, están
reescaladas y recomprimidas, y el detector nunca ve esa imagen.

## Escenarios pendientes

| # | Escenario | Estado |
|---|---|---|
| 1 | Granito claro, documento centrado | falta |
| 2 | Granito claro, documento de lado | falta |
| 3 | Granito solo, SIN documento (el detector no debe inventar nada) | falta |
| 4 | Madera con reflejo de ventana | falta |
| 5 | Documento lejos, chico en el cuadro | falta |
| 6 | Documento muy inclinado | falta |
| 7 | Documento cortado por el borde del cuadro | falta |
| 8 | Poca luz | falta |
| 9 | Superficie oscura | falta |
| 10 | Dos hojas encimadas (debe tomar la de arriba) | falta |

Prioridad si solo salen unas pocas: **1, 3, 4 y 9** — cubren los dos fallos ya
observados en dispositivo más el caso de "no inventes".

## Qué pasa después

Cada foto se anota a mano (dónde está de verdad el documento) y se registra en
`scanner/fixtures/manifest.js`. A partir de ahí `npm run scanner:fixtures` la
mide por IoU en cada cambio del detector, y el CI bloquea las regresiones.
