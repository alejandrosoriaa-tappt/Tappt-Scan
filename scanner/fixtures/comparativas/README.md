# Comparativas contra el benchmark

Aquí vive la **medición** de un mismo documento escaneado con TapptScan y con
la app de referencia (CamScanner u otra), no las imágenes.

**Los PDF y las fotos NO se versionan.** Las comparativas se hacen con
documentos reales del usuario —escrituras, facturas, identificaciones— y ese
contenido no tiene por qué vivir en un repo de código. Lo que se guarda es el
JSON de métricas por página, que no contiene nada del documento: resolución,
peso, nitidez, contraste, brillo y proporción.

## Cómo se produce una comparativa

1. Escanear **el mismo documento físico** con las dos apps, el mismo día y la
   misma luz. Anotar dispositivo y build de TapptScan (`Ajustes` muestra la
   versión).
2. Correr el análisis sobre los dos PDF (ver el método en el doc de la
   comparativa correspondiente en `docs/`).
3. Guardar aquí el JSON con nombre `AAAA-MM-DD-<documento>.json` y escribir el
   hallazgo en `docs/COMPARATIVA-*.md`.

## Qué significa cada campo

| Campo | Qué mide |
|---|---|
| `mp` | megapíxeles de la página incrustada en el PDF |
| `kb` / `kb_por_mp` | peso y qué tan agresiva es la compresión JPEG |
| `nitidez` | varianza del laplaciano **después de normalizar ambas a 1000 px de ancho** — o sea, detalle percibido al mismo tamaño de pantalla, no premio por tener más píxeles |
| `contraste` | desviación estándar de la luminancia (qué tanto separa tinta de papel) |
| `brillo` | luminancia media (238 ≈ papel blanqueado) |
| `relacion` | alto/ancho de la página; su dispersión delata encuadres inconsistentes |

**La trampa a evitar** es la que ya costó una sesión en agosto (ver `CLAUDE.md`,
"🔴 ABIERTO 2026-08-20"): medir nitidez sobre imágenes de distinto tamaño. Más
píxeles suben la varianza del laplaciano sin que haya más detalle real. Por eso
se normaliza el ancho antes de medir.

## Comparativas registradas

| Fecha | Documento | Build | Hallazgo |
|---|---|---|---|
| 2026-09-09 | escritura notarial, 17 páginas | `0.1.6 (14)` | Empate en nitidez; la brecha es encuadre y enderezado — `docs/COMPARATIVA-CAMSCANNER-2026-09-09.md` |
