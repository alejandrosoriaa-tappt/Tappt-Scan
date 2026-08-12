# Handoff ChatGPT — scanner / DocQuad — 2026-08-12

> Leer junto con `CLAUDE.md` y `docs/ARQUITECTURA-SCANNER.md` antes de tocar el scanner.
>
> Rama: `claude/new-session-9mhtdk`.
> No volver a parchar Otsu. El trabajo activo es DocQuad.

## Contexto recibido

Claude cerró su sesión en `4456f01`. En ese checkpoint ya estaban documentados:

- captura web a resolución completa;
- mejora medida de 0.25 MP a 5.35 MP (CamScanner de referencia: 2.6 MP en esa prueba);
- JPEG final alrededor de 0.59 MB/página vs 5.16 MB antes;
- overlay de cámara corregido respecto al preview;
- bug de calidad JPEG de `@napi-rs/canvas` corregido (calidad 0–100, no 0–1);
- fixes del adapter nativo (`maxAncho`, orientación live/final, `onMountError`);
- Otsu descartado después de fallar repetidamente con fotos reales;
- modelo DocQuad ORT ya localizado/verificado (~13.4 MB).

La prioridad actual de pruebas es **iPhone + Web App (Safari como referencia)** y WhatsApp. iOS/Android nativos se validarán cuando existan cuentas/builds de desarrollador.

## Cambios hechos después del handoff

### 1. Fix geométrico de `RecorteScreen`

Commits:

- `a449d20` — `fix(recorte): alinea esquinas con la foto real dentro de contain`
- `30fa042` — `fix(recorte): pasa dimensiones reales de la captura al editor`

Problema observado en Safari: la foto se muestra con `resizeMode="contain"`, pero las esquinas se dibujaban contra todo el lienzo. Los márgenes vacíos del `contain` desplazaban visualmente los cuatro tiradores y las líneas.

Solución:

- calcular el rectángulo real que ocupa la foto dentro del lienzo;
- proyectar coordenadas normalizadas de la foto (`0..1`) a ese rect, no al contenedor completo;
- hacer la transformación inversa al arrastrar;
- pasar `fotoAncho` / `fotoAlto` desde `EscanearScreen` para tener geometría correcta desde el primer render.

Este fix es independiente del detector y seguirá siendo necesario con DocQuad.

## Integración DocQuad que ya existe en la rama

Durante el relevo aparecieron/estaban ya integrados varios commits de DocQuad en la misma rama. No pisarlos. Entre ellos:

- `c7fd999` — usa detector nuevo en WhatsApp e importación;
- `87e353f` / `14df679` — redetección final sobre captura full-res;
- `d18727f` / `7511f74` — guardrail contra doble corrección de perspectiva;
- `bc8c366` — CI cubre integración de producto.

El spike actual tiene:

- `scanner/docquad/model.js` — descarga modelo fijado a commit de MakeACopy y verifica tamaño, cabecera ORT y Git blob SHA-1;
- `scanner/docquad/preprocess.js` — letterbox 256×256 / tensor NCHW float32;
- `scanner/docquad/ort-runtime.node.js` — `onnxruntime-web` ejecutado en Node/WASM single-thread para evitar el bloqueo de binarios de `onnxruntime-node`;
- `scanner/docquad/postprocess.js` — heatmaps de esquinas, refinamiento subpixel, máscara como guardrail y validación geométrica;
- `scanner/docquad/detector.js` — detector aislado;
- `.github/workflows/docquad-spike.yml` — modelo verificado, golden input y smoke test de pipeline.

`onnxruntime-web@1.27.0` está en el `package.json` raíz para este camino Node/WASM.

## 2. Fix del 502 / warm-up de DocQuad

Problema observado en Safari: al detectar bordes aparecía HTTP 502. El router de DocQuad ya atrapaba excepciones y respondía JSON 200, por lo que un 502 indicaba que la request estaba siendo cortada fuera del controlador (proceso/proxy/arranque pesado).

Causa probable tratada: descargar/verificar ~13.4 MB + inicializar ORT/WASM en la primera petición de cámara.

Commits:

- `b675f07` — DocQuad mantiene estado `listo/cargando/error` y warm-up reutilizable;
- `a2218dd` — `/detectar-bordes` no bloquea mientras el modelo calienta; responde `MODEL_WARMING` / `MODEL_RETRYING` con `esquinas:null`;
- `cb968e8` — servidor precalienta DocQuad al arrancar y `/health` expone estado del detector.

Regla: **la primera request de cámara no debe descargar/cargar el modelo**. Si todavía no está listo, la UI permanece en búsqueda y reintenta el siguiente frame.

## 3. Fix: no ocultar detección parcial

Commit:

- `99cff3d` — `fix(docquad): conserva quad parcial cuando la geometria es valida`

Problema: `services/docquad.js` devolvía `esquinas:null` para cualquier resultado que no pasara todos los guardrails. Esto hacía imposible distinguir:

1. DocQuad no ve ningún documento;
2. DocQuad sí encuentra un quad geométricamente válido, pero la confianza es insuficiente.

Nuevo comportamiento esperado:

- geometría inválida → `esquinas:null`, estado buscando;
- geometría válida pero confianza baja → devuelve esquinas + `confiable:false`; la cámara debe mostrar polígono **blanco/parcial** y “sigue ajustando”;
- geometría válida y confiable → devuelve esquinas + `confiable:true`; polígono **verde** y “listo para capturar”.

Nunca usar automáticamente un quad parcial para destruir/recortar una foto final.

## Pruebas reales de Safari recibidas

Diagnóstico medido en iPhone Safari:

- STREAM: `2160×3840`;
- TRACK: `2160×3840 @30fps`;
- frame enviado a detector: alrededor de `640×1138`, 84–98 KB, ~62–65 ms **sólo para generar el frame en cliente**.

Ojo: el valor `62–65ms` mostrado actualmente como `DETECTOR` en el panel NO es el tiempo real de DocQuad; es el tiempo de generación/compression del frame local. No usar ese número para evaluar inferencia.

Una prueba sin documento (bolsa/caja/fondo) correctamente no mostró quad. Una prueba posterior sí mostró una hoja grande, clara y casi completa, pero aún no mostró polígono. Esa última prueba es la que hay que resolver.

## Siguiente paso exacto

No tocar umbrales a ciegas.

Instrumentar la respuesta real de `/detectar-bordes` en `EscanearScreen`/panel diagnóstico y mostrar al menos:

- `fuente`;
- `razon` (`MODEL_WARMING`, `LOW_PEAK_MARGIN`, `MASK_DIFFUSE`, `GEOMETRY_IMPLAUSIBLE`, etc.);
- si llegaron `esquinas`;
- `confiable`;
- `diagnostico.area`;
- `diagnostico.minConfidenceZ`;
- `diagnostico.mask`;
- `diagnostico.timing.inferenceMs` y `totalMs`;
- latencia HTTP total desde Safari.

Con la misma hoja real:

- si llegan esquinas pero `confiable:false` → revisar guardrails/confianza con evidencia;
- si no llegan esquinas porque `geometryValid=false` → revisar preprocess/postprocess/letterbox/orden TL-TR-BR-BL;
- si el endpoint sigue en `MODEL_WARMING` → revisar warm-up/modelo/Railway;
- si hay `DETECTION_ERROR` → mirar log `[docquad]` en Railway;
- si devuelve quad correcto pero no se dibuja → entonces sí revisar mapping UI/overlay.

## Brecha técnica detectada vs MakeACopy

El postproceso de TapptScan actualmente obtiene el quad final principalmente de las cuatro `corner_heatmaps`; `mask_logits` se usa como estadística/guardrail. MakeACopy tiene lógica más rica para aprovechar/contrastar la máscara del documento y escoger/refinar el quad en algunos casos.

No declarar DocQuad terminado hasta comparar nuestra implementación contra el postproceso real de MakeACopy y decidir si portar la selección/refinamiento basada en máscara. Hacerlo después de instrumentar la prueba real, para saber si esa es efectivamente la causa.

## No hacer

- No volver a Otsu ni ajustar sus umbrales.
- No asumir que “no hay marco” significa que el modelo no vio nada; revisar primero la respuesta DocQuad.
- No usar el quad live como verdad final: después del disparo debe haber redetección en captura full-res.
- No bajar guardrails de confianza hasta ver métricas reales de la misma foto.
- No confundir el tiempo de captura del frame 640 px con la inferencia DocQuad.
- No rehacer Expo/React Native a Capacitor; ya se evaluó y descartó.

## Commits hechos directamente durante este relevo

- `a449d20` — fix geometría `contain` en RecorteScreen.
- `30fa042` — dimensiones reales de captura a RecorteScreen.
- `9d722c9` — retiro de workflow temporal de lockfile creado durante el relevo (limpieza; no funcional).
- `b675f07` — warm-up/estado DocQuad.
- `a2218dd` — respuesta no bloqueante mientras calienta.
- `cb968e8` — warm-up al arranque + estado en health.
- `99cff3d` — conservar quad parcial geométricamente válido.

Último comportamiento observado antes de escribir este handoff: Safari apunta a una hoja real, el panel confirma stream 2160×3840 y frame detector 640×1138, pero todavía no aparece el quad. El próximo trabajo es **instrumentar la respuesta de DocQuad**, no cambiar algoritmos a ciegas.
