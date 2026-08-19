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

## Escenarios

| # | Escenario | Estado |
|---|---|---|
| 1 | Granito claro, documento centrado | ✅ `granito-centrado` |
| 2 | Granito claro, documento de lado | ✅ `granito-de-lado` |
| 3 | Granito solo, SIN documento | ✅ `granito-vacio` |
| 4 | Madera con reflejo de ventana | ✅ `madera-libreta` |
| 5 | Documento lejos, chico en el cuadro | ✅ `escritorio-lejos` |
| 6 | Documento muy inclinado | ✅ `escritorio-angulo` |
| 7 | Documento cortado por el borde del cuadro | **falta** |
| 8 | Poca luz | **falta** |
| 9 | Superficie oscura | ✅ `oscuro-vacio` (vacía) · ✅ `oscuro-documento` (con documento) |
| 10 | Dos hojas encimadas (debe tomar la de arriba) | **falta** (parcial: `oscuro-documento` trae dos hojas traslapadas, pero no es el escenario de desambiguación dedicado) |
| — | Madera SIN documento (extra) | ✅ `madera-vacia` |
| — | Escritorio, caso ordinario que sí funciona (extra) | ✅ `escritorio-cuaderno` |
| — | Superficie oscura, caso ordinario que sí funciona (extra) | ✅ `oscuro-libreta` |
| — | Granito con tapete, quinta superficie del caso abierto (extra) | ✅ `granito-tapete` |

**Van 15 de 20** (12 reales del dispositivo + 2 de referencia + 1 sintético).

### Lo que falta, por orden de valor

1. **Poca luz** (#8) — el otro escenario donde la máscara puede debilitarse.
2. **Documento cortado por el borde** (#7) — hoy nada en el banco lo cubre.
3. **Dos hojas encimadas** (#10) — el único caso de desambiguación dedicado
   (`oscuro-documento` ayuda pero traslapa poco; falta una toma donde de
   verdad estén una encima de la otra).

Las #1 a #6 y la #9 ya están cubiertas y varias resultaron ser el mismo caso
abierto (DocQuad acierta, OpenCV falla, el desacuerdo lo degrada a parcial).
`oscuro-documento` es la CUARTA superficie con ese mismo patrón, después de
granito centrado, granito de lado y madera; `granito-tapete` es la QUINTA.
`oscuro-libreta`, en cambio, es el caso ordinario donde los dos detectores
concuerdan (acuerdo 0.982) y todo funciona — la misma superficie, sin
desacuerdo.

## Qué pasa después

Cada foto se anota a mano (dónde está de verdad el documento) y se registra en
`scanner/fixtures/manifest.js`. A partir de ahí `npm run scanner:fixtures` la
mide por IoU en cada cambio del detector, y el CI bloquea las regresiones.
