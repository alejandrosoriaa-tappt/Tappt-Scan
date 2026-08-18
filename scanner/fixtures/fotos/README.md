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
| 9 | Superficie oscura | **falta** |
| 10 | Dos hojas encimadas (debe tomar la de arriba) | **falta** |
| — | Madera SIN documento (extra) | ✅ `madera-vacia` |
| — | Escritorio, caso ordinario que sí funciona (extra) | ✅ `escritorio-cuaderno` |

**Van 11 de 20** (8 reales del dispositivo + 2 de referencia + 1 sintético).

### Lo que falta, por orden de valor

1. **Superficie oscura, CON y SIN documento** (#9). Las dos tomas vacías que
   ya hay —granito y madera— fijaron la puerta de máscara con dos puntos.
   Una tercera, sobre fondo oscuro, es la que más la refuerza: es el caso
   donde una máscara podría apagarse por falta de contraste y provocar un
   falso negativo, o sea borrar el contorno de un documento real.
2. **Poca luz** (#8) — el otro escenario donde la máscara puede debilitarse.
3. **Documento cortado por el borde** (#7) — hoy nada en el banco lo cubre.
4. **Dos hojas encimadas** (#10) — el único caso de desambiguación.

Las #1 a #6 ya están cubiertas y varias resultaron ser el mismo caso abierto
(DocQuad acierta, OpenCV falla, el desacuerdo lo degrada a parcial).

## Qué pasa después

Cada foto se anota a mano (dónde está de verdad el documento) y se registra en
`scanner/fixtures/manifest.js`. A partir de ahí `npm run scanner:fixtures` la
mide por IoU en cada cambio del detector, y el CI bloquea las regresiones.
