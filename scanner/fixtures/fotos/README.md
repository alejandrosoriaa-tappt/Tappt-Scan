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
| 9 | Superficie oscura | ✅ `oscuro-vacio` (vacía) · falta CON documento |
| 10 | Dos hojas encimadas (debe tomar la de arriba) | **falta** |
| — | Madera SIN documento (extra) | ✅ `madera-vacia` |
| — | Escritorio, caso ordinario que sí funciona (extra) | ✅ `escritorio-cuaderno` |

**Van 12 de 20** (9 reales del dispositivo + 2 de referencia + 1 sintético).

### Lo que falta, por orden de valor

1. **Superficie oscura CON documento** (#9). La vacía ya entró y validó la
   puerta; falta fijar como regresión la contraparte, cuyo diagnóstico del
   dispositivo ya se midió (máscara 239 / 0.059, o sea sana) pero llegó sin
   su jpg.
2. **Poca luz** (#8) — el otro escenario donde la máscara puede debilitarse.
3. **Documento cortado por el borde** (#7) — hoy nada en el banco lo cubre.
4. **Dos hojas encimadas** (#10) — el único caso de desambiguación.

Las #1 a #6 ya están cubiertas y varias resultaron ser el mismo caso abierto
(DocQuad acierta, OpenCV falla, el desacuerdo lo degrada a parcial).

## Qué pasa después

Cada foto se anota a mano (dónde está de verdad el documento) y se registra en
`scanner/fixtures/manifest.js`. A partir de ahí `npm run scanner:fixtures` la
mide por IoU en cada cambio del detector, y el CI bloquea las regresiones.
