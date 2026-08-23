# Benchmark DocAligner LCNet100 — 2026-08-23

## Veredicto

No integrar LCNet100 en el detector de producto. Cuando entrega cuatro
esquinas es preciso, pero sólo cubre 2–3 de las 10 escenas reales y no rescata
ningún caso donde DocQuad sea peor. Mantener el adaptador únicamente como
experimento reproducible.

## Artefactos

- DocAligner `lcnet100_h_e_bifpn_256_fp32.onnx`
  - tamaño: 4,767,987 bytes
  - SHA-256: `f4117b786e3a18470f3865c93f3c2bd69d9b998edd60f385574a5c665e79594e`
- ONNX Runtime 1.29.0, CPUExecutionProvider, macOS arm64.
- 13 tomas reales de iPhone: 10 con documento y 3 sin documento.
- Preproceso oficial: resize 256×256, BGR, NCHW, float 0..1.
- Postproceso oficial: cuatro heatmaps y umbral 0.3; centroide del mayor
  componente conexo por canal.

## Resultados LCNet100

| Fixture | Resultado | IoU | Mediana CPU |
|---|---:|---:|---:|
| escritorio-cuaderno | 4 esquinas | 0.877 | 33.3 ms |
| madera-libreta | 4 esquinas* | 0.921 | 39.8 ms |
| oscuro-libreta | 4 esquinas | 0.971 | 32.0 ms |
| granito-centrado | incompleto | — | 26.7 ms |
| granito-de-lado | 2 esquinas | — | 37.4 ms |
| escritorio-lejos | incompleto | — | 33.7 ms |
| escritorio-angulo | incompleto | — | 37.9 ms |
| oscuro-documento | incompleto | — | 45.3 ms |
| granito-tapete | 1 esquina | — | 40.8 ms |
| poca-luz | incompleto | — | 37.2 ms |
| 3 escenas vacías | 0 falsos positivos | — | — |

`madera-libreta` queda en el límite: una repetición produjo pico 0.286 en una
esquina y no superó 0.3. Por eso la cobertura estable es 2/10 y la mejor
observada 3/10. Bajar el umbral hasta 0.025 no recuperó las escenas difíciles:
en ellas faltan uno o varios heatmaps, no sólo margen de calibración.

- IoU medio cuando completó: 0.923.
- Latencia mediana CPU: 37.4 ms.
- Falsos positivos completos en vacíos: 0/3.

## Comparación DocQuad crudo

Se ejecutó el mismo conjunto con el modelo fijado de DocQuad, usando su
letterbox RGB 256×256 y sus corner heatmaps. Esta comparación es del candidato
neuronal crudo; el producto agrega máscara, OpenCV y guardrails.

- Produce cuatro candidatos en 10/10 escenas.
- IoU ≥ 0.85 en 7/10 escenas.
- IoU medio crudo: 0.810.
- Latencia mediana CPU: 28.6 ms.
- Rechaza correctamente las tres escenas vacías mediante sus señales de
  confianza/máscara.

DocAligner coincide en los casos que DocQuad ya resuelve bien. No agrega una
señal útil en `escritorio-lejos`, `escritorio-angulo` o `poca-luz`, y pierde
los dos casos de granito donde DocQuad crudo logra IoU 0.981 y 0.953.

## Core ML

El modelo sólo pudo asignar 164 de 256 nodos al CoreML Execution Provider y
falló al compilar el plan dentro de este entorno. Debe comprobarse en un
target iOS real antes de afirmar aceleración ANE. Esto no cambia el veredicto
de precisión.

## Siguiente experimento razonable

No ajustar más umbrales de LCNet100. Si se continúa con DocAligner, evaluar
su modelo de puntos con señal `has_obj` o hacer fine-tuning con las fixtures
reales. Para el producto inmediato, concentrarse en recalibrar/validar DocQuad
y probar One Euro sobre secuencias reales.
