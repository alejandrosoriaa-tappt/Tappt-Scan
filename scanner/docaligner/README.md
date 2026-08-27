# DocAligner experimental

Este adaptador reproduce el pre/postproceso del modelo heatmap-regression de
DocAligner (Apache-2.0). Está deliberadamente desconectado de producción.

Hipótesis que debe validar el banco de fixtures antes de integrarlo:

1. mejora el IoU de las cuatro esquinas frente a DocQuad en fondos claros;
2. no inventa papel en fixtures vacíos;
3. cabe en el presupuesto de latencia móvil;
4. dos o más frames consecutivos concuerdan antes de pintar verde.

DocAligner sólo debe proponer geometría. El recorte final seguirá usando una
homografía determinista sobre la foto original; nunca generación de imagen.

El modelo recomendado para el primer benchmark es `lcnet100` (256x256,
aprox. 4.9 MB). El runtime y el archivo ONNX se inyectan al adaptador para que
una descarga o cambio de modelo no pueda modificar silenciosamente producción.

Benchmark local reproducible:

```sh
DOCALIGNER_MODEL_PATH=/ruta/lcnet100_h_e_bifpn_256_fp32.onnx \
  npm run docaligner:fixtures
```

El script imprime el SHA-256 del modelo, IoU por toma real, falsos positivos
en escenas vacías y latencia de inferencia. No descarga nada ni modifica el
detector de producto.

Resultado del primer benchmark: ver `docs/DOCALIGNER-BENCHMARK.md`. LCNet100
no se integra: su precisión condicional es alta, pero su cobertura sobre las
tomas reales es insuficiente.
