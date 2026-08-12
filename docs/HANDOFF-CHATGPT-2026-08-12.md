# Handoff TapptScan — Scanner DocQuad + OpenCV — 2026-08-12

> **Documento de relevo autoritativo para retomar el scanner.**
>
> Repo: `github.com/alejandrosoriaa-tappt/Tappt-Scan`
>
> Rama activa: `claude/new-session-9mhtdk`
>
> Checkpoint técnico validado antes de escribir este handoff: `659ef39c3f023aaaff3a5281c89709cf93dabfbc`
>
> Si alguna nota anterior del scanner en `CLAUDE.md` contradice este archivo, **este handoff es el estado más reciente y prevalece**. En particular, ya NO se muestran quads parciales inválidos y el detector ya NO es DocQuad solamente: ahora el producto usa **DocQuad → OpenCV fallback**.

---

## 1. Objetivo del bloque que se acaba de cerrar

El problema visible en iPhone Safari era que TapptScan no conseguía encuadrar correctamente una hoja en vivo:

- inicialmente el detector Otsu/extremos dibujaba regiones absurdas y podía marcar `Listo para capturar`;
- después de migrar a DocQuad, el modelo/runtime funcionaban pero en fotos reales concretas DocQuad podía engancharse a una franja interna o devolver baja confianza;
- en una fixture real de diagnóstico DocQuad produjo un quad de ~5.3% del frame con `LOW_PEAK_MARGIN`;
- eso no era un problema del overlay, Safari ni de la resolución de la cámara: era una limitación/fallo de la detección para ese caso.

La decisión de arquitectura queda ahora congelada así:

```text
frame de cámara / foto
        ↓
     DocQuad
        ↓
 ¿quad válido y confiable?
      /         \
    sí           no / error / no listo
    ↓                    ↓
 usar DocQuad          OpenCV
                         ↓
                 ¿quad válido?
                    /       \
                  sí         no
                  ↓           ↓
             usar OpenCV   sin marco
                    \       /
                     ↓     ↓
                4 esquinas normalizadas
                         ↓
              redetección final full-res
                         ↓
              corrección de perspectiva
                         ↓
                       PDF
```

**Regla crítica:** nunca volver a dibujar ni usar automáticamente un quad que el motor considera inválido. Si ambos motores fallan, la UI debe quedarse buscando.

---

## 2. Estado previo que se conserva

Claude cerró su sesión anterior en `4456f01`. Antes de este relevo ya estaban resueltos/documentados:

- captura web full-resolution;
- salto medido de ~0.25 MP a ~5.35 MP en la prueba de referencia;
- JPEG alrededor de 0.59 MB/página vs ~5.16 MB antes;
- corrección del bug de calidad JPEG de `@napi-rs/canvas` (escala 0–100, no 0–1);
- overlay de cámara alineado con `object-fit: cover`;
- adapter nativo corregido para `maxAncho`, orientación live/final y `onMountError`;
- Otsu/extremos descartado como detector de producto después de varias fallas con fotos reales;
- modelo DocQuad ORT localizado y verificado (~13.4 MB);
- redetección sobre captura final full-res ya incorporada en la tubería de procesamiento;
- protección contra doble corrección de perspectiva.

La prioridad de pruebas sigue siendo **iPhone + Safari Web App** y WhatsApp. iOS/Android nativos se validarán cuando existan cuentas/builds de desarrollador.

---

## 3. Fix de RecorteScreen que debe conservarse

Commits:

- `a449d20` — alinea esquinas con la foto real dentro de `resizeMode="contain"`.
- `30fa042` — pasa ancho/alto reales de la captura al editor.

Problema: `RecorteScreen` mostraba la foto con `contain`, pero proyectaba las esquinas contra todo el lienzo, incluyendo las bandas vacías. El marco se veía desplazado aunque las coordenadas normalizadas fueran correctas.

Ahora:

```text
corner normalizada 0..1
        ↓
rect real ocupado por la foto dentro de contain
        ↓
posición visual correcta
```

Al arrastrar una esquina se aplica la transformación inversa. Este fix es independiente del detector y debe conservarse.

---

## 4. DocQuad: estado actual

### Runtime/modelo

Archivos principales:

- `scanner/docquad/model.js`
- `scanner/docquad/preprocess.js`
- `scanner/docquad/ort-runtime.node.js`
- `scanner/docquad/postprocess.js`
- `scanner/docquad/detector.js`

Modelo fijado a MakeACopy, no a `main` flotante. Input del modelo: **256×256** letterbox RGB/NCHW float32.

Esto NO significa que la foto final quede en 256×256. Es sólo una copia de detección:

```text
foto full-res
   ├── conservar original
   └── copia 256×256 → DocQuad → 4 esquinas
                                  ↓
                         proyectar al original
                                  ↓
                         perspectiva full-res
```

En Node se usa `onnxruntime-web@1.27.0` con WASM single-thread porque el entorno anterior bloqueaba la descarga de binarios de `onnxruntime-node`.

### Golden del modelo/runtime

El workflow valida cinco checks numéricos contra el golden de MakeACopy:

- `cornerMean`
- `cornerStd`
- `maskArea`
- `maskMean`
- `maskStd`

Estos checks pasan. Esto demuestra que modelo/runtime/outputs básicos son correctos, pero **no demuestra precisión geométrica sobre cualquier foto real**.

### Postproceso DocQuad actualizado

`scanner/docquad/postprocess.js` ya no es el port incompleto de sólo heatmaps. Ahora incluye:

- refinamiento subpixel de corner heatmaps;
- `mask_logits` → quad candidato basado en máscara;
- scoring/penalizaciones geométricas;
- comparación `CORNERS` vs `MASK`;
- selección determinista;
- guardrails de confianza/geometría;
- diagnóstico de `LOW_PEAK_MARGIN`, máscara, penalizaciones, área, etc.

Se agregaron pruebas deterministas en `scripts/docquad-postprocess-test.js` para validar, entre otros casos:

- `MASK` gana si CORNERS produce bow-tie/hard penalty;
- CORNERS gana si la máscara fue fallback;
- desacuerdo excesivo favorece CORNERS;
- empate determinista favorece CORNERS;
- canonicalización TL/TR/BR/BL.

### Cambio importante de producto

**Ya NO se devuelven quads inválidos como detección parcial para dibujarlos en blanco.**

Ese comportamiento anterior fue descartado porque hacía visible exactamente el tipo de franja falsa que se observó en Safari.

Ahora:

```text
DocQuad valid=true  → puede usarse
DocQuad valid=false → NO se dibuja; probar OpenCV
```

---

## 5. Por qué se agregó OpenCV

DocQuad pasó el golden numérico, pero en una fixture fotográfica concreta:

- `valid: false`
- `suspiciousReason: LOW_PEAK_MARGIN`
- `area ≈ 0.0531`
- el quad cubría una zona pequeña/interna del documento.

Portar más thresholds a ciegas no era correcto.

MakeACopy también está diseñado con un detector OpenCV como fallback, y el pipeline clásico de scanner probado por múltiples implementaciones es:

```text
GaussianBlur / median
        ↓
      Canny
        ↓
   findContours
        ↓
  approxPolyDP
        ↓
 cuadrilátero plausible
        ↓
 perspectiva
```

El usuario además encontró repositorios clásicos de CamScanner/OpenCV que siguen exactamente este patrón. Se tomó ese patrón como referencia conceptual, no como copia ciega de código.

---

## 6. OpenCV: implementación de producto

Nuevo módulo:

- `scanner/opencv/detector.js`

Dependencia raíz:

- `@techstark/opencv-js@5.0.0-release.1`

El paquete quedó fijado en `package.json` y `package-lock.json`.

### Resolución de trabajo

OpenCV procesa una **copia de detección de máximo 720 px en el lado largo**.

No procesa/reescribe la foto final a 720 px. Devuelve esquinas normalizadas `0..1`; la imagen original full-res sigue siendo la fuente para perspectiva/guardado.

### Pipeline actual OpenCV

#### Rama Canny

1. RGBA → gris.
2. `GaussianBlur(5×5)`.
3. median blur 3.
4. Canny adaptativo según media.
5. Canny fijo 30/100 como segunda señal.
6. Rama morfológica adicional para recuperar bordes difíciles.
7. Unión de edge maps.
8. `MORPH_CLOSE` pequeño para unir discontinuidades.
9. `findContours(RETR_LIST)`.
10. `approxPolyDP` con varios epsilons:
   - `0.01`
   - `0.015`
   - `0.02`
   - `0.025`
   - `0.03`
   - `0.04`
   - `0.05`
11. exigir 4 puntos + convexidad.
12. ordenar TL/TR/BR/BL.
13. validar área/aspecto/ángulos.
14. score combinando área y rectangularidad.

#### Rama `opencv-paper`

Si Canny no consigue un quad cerrado:

- segmenta regiones claras con varios thresholds;
- cierra huecos de texto/ruido con morfología;
- busca el mejor contorno/cuadrilátero;
- sirve para documentos claros sobre fondos más oscuros o bordes incompletos.

Esta rama fue importante porque en fotos reales el documento puede tocar/cortar el borde del frame y un contorno puramente cerrado puede no existir.

### Guardrails de producto OpenCV

- quad finito;
- 4 esquinas dentro de `0..1`;
- área mínima confiable: **10% del frame**;
- área máxima: **<95% del frame**;
- aspecto/ángulos plausibles;
- si no pasa, OpenCV devuelve `valid:false` y el producto no dibuja marco.

El umbral Otsu que aparece dentro de una rama OpenCV es sólo **una operación de preprocesamiento para generar una máscara**, no es el viejo detector Otsu/extremos de TapptScan. El detector de geometría sigue siendo contornos/cuadriláteros.

---

## 7. Servicio compuesto de producción

Archivo:

- `services/docquad.js`

Aunque conserva el nombre histórico, ahora es el **servicio compuesto del scanner**.

Mantiene dos singletons/warm-ups:

- DocQuad
- OpenCV

Contrato:

```js
{
  esquinas: [{x,y}, ...] | null,
  confiable: boolean,
  fuente: 'docquad' | 'opencv-canny' | 'opencv-paper' | 'scanner',
  razon?: string,
  diagnostico?: {...}
}
```

Orden real:

```text
1. Si DocQuad está listo:
      ejecutar
      si valid → devolver DocQuad

2. Si DocQuad no está listo / falla / invalid:
      ejecutar OpenCV si está listo
      si valid → devolver OpenCV

3. Si ninguno produce quad confiable:
      esquinas:null
      confiable:false
```

No se vuelve a Otsu como fallback.

---

## 8. Endpoint `/detectar-bordes` y prevención de 502

Archivo:

- `routes/docquad.js`

Problema anterior: inicializar el modelo dentro/pegado a la primera request podía provocar que Railway/proxy cortara la llamada y Safari viera HTTP 502.

Ahora:

- DocQuad y OpenCV se calientan en background;
- si ninguno está listo, el endpoint responde inmediatamente:
  - `DETECTORS_WARMING`, o
  - `DETECTORS_RETRYING`;
- no espera dentro de la request;
- si OpenCV ya está listo pero DocQuad todavía no, **OpenCV puede detectar inmediatamente**;
- el motor faltante sigue calentando/reintentando en background.

`server.js` llama `scanner.prepararMotores()` al arrancar.

`GET /health` expone el estado compuesto. Para compatibilidad conserva ambas claves:

- `docquad`
- `scanner`

apuntando al mismo estado compuesto.

---

## 9. Pruebas automáticas que YA pasan

Workflow:

- `.github/workflows/docquad-spike.yml`
- nombre actual: `Scanner detector spike`

Última corrida compuesta validada antes de escribir este handoff:

- Run: `31646189051`
- Commit: `659ef39c3f023aaaff3a5281c89709cf93dabfbc`
- Resultado: **SUCCESS**

Pasaron, entre otros:

1. syntax check de integración de producto;
2. pruebas deterministas de postproceso DocQuad;
3. modelo DocQuad verificado;
4. golden ONNX de MakeACopy;
5. diagnóstico DocQuad sobre fixture MakeACopy;
6. OpenCV sobre la misma fixture;
7. **prueba del servicio compuesto real: DocQuad inválido → OpenCV fallback → `confiable:true`, 4 esquinas, fuente OpenCV**;
8. fixture clásica CamScanner/OpenCV;
9. contrato de salida OpenCV.

### Resultado de fixture CamScanner/OpenCV

Sobre `AdityaPai2398/CamScanner-In-Python/test_img.jpg`:

```text
valid              true
source             opencv-canny
area               ~0.341934
score              ~0.523347
angles             ~91.8°, 91.3°, 88.3°, 88.6°
```

Es una buena prueba de que la implementación Canny/contornos/quad está funcionando.

### Resultado diagnóstico MakeACopy

La fixture se llama `20251007_183138_cropped.jpg`; ya viene recortada y **no tiene ground truth del borde exterior del papel**, así que NO usarla como benchmark de precisión.

En esa imagen:

- DocQuad: inválido, `LOW_PEAK_MARGIN`, área ~5.3%;
- OpenCV: encontró un quad mediante `opencv-paper`;
- servicio compuesto: pasó correctamente a OpenCV.

La utilidad de esa fixture es validar el fallback, no juzgar si el quad coincide al píxel con un papel original que ya fue previamente recortado.

---

## 10. Qué todavía NO está demostrado

No declarar el scanner terminado todavía.

Falta evidencia real de producto en:

### A. Safari iPhone después de este deploy

Todavía no se ha hecho la prueba visual final del código compuesto más reciente en el mismo iPhone/hoja que provocaba el problema.

**Éste es el siguiente paso inmediato.**

Después de que Railway despliegue el HEAD actual:

1. abrir Web App en Safari;
2. usar la misma hoja real;
3. verificar que ya no aparece la franja falsa;
4. verificar si aparece un quad sobre la hoja;
5. observar si la fuente fue `docquad`, `opencv-canny` u `opencv-paper`;
6. capturar;
7. comprobar recorte/perspectiva final en Drive.

### B. `scanner-fixtures/` con 20 fotos + ground truth

Sigue pendiente y es crítico.

Necesitamos fotos reales tomadas por el usuario, por ejemplo:

- papel blanco sobre escritorio oscuro;
- papel claro sobre mesa clara;
- sombras;
- perspectiva fuerte;
- documento parcialmente fuera del frame;
- recibos angostos;
- credenciales/tarjetas;
- documentos con fondo complejo;
- poca luz;
- reflejos.

Cada fixture debe llevar las cuatro esquinas reales anotadas. Sólo así podremos medir error/IoU y evitar el ciclo de “se ve mejor”.

### C. Hough fallback

MakeACopy incluye además un fallback basado en Hough lines para bordes quebrados. **No se portó todavía.**

No añadirlo hasta ver fallos reales en fixtures que Canny/segmentación no resuelvan.

### D. Web/native local runtimes

El fallback actual está integrado en Node/backend, lo que beneficia ya a:

- Safari web app vía endpoint;
- Chrome web app vía endpoint;
- WhatsApp/backend;
- redetección final backend.

Todavía queda llevar la detección al cliente para eliminar dependencia/latencia de red:

- Web: ONNX/OpenCV.js en Worker;
- iOS/Android: runtime nativo/adapter apropiado.

No bloquear el avance actual por eso.

### E. Native iOS/Android

Aún no hay medición real de captura nativa en dispositivos. Validar cuando existan las cuentas/builds.

---

## 11. Perspectiva y calidad final

OpenCV/DocQuad **sólo localizan** las esquinas en este bloque.

La corrección de perspectiva actual sigue en `services/imagen.js`. No eliminarla todavía.

Pipeline deseado a futuro:

```text
DocQuad/OpenCV
     ↓
quad aproximado
     ↓
refinamiento de borde/line snap full-res
     ↓
warpPerspective / perspectiva
     ↓
realce
     ↓
JPEG/PDF
```

Puede valer la pena migrar posteriormente el warp a OpenCV, pero no mezclar esa decisión con la validación del detector actual.

Realce/efecto scanner posterior:

- gris;
- contraste/local contrast;
- `adaptiveThreshold` para B&N;
- corrección de sombras;
- sharpening prudente.

No aplicar realce antes de terminar la geometría.

---

## 12. Commits relevantes de este relevo

### Recorte / cámara

- `a449d20` — `fix(recorte): alinea esquinas con la foto real dentro de contain`
- `30fa042` — `fix(recorte): pasa dimensiones reales de la captura al editor`

### Warm-up / 502

- `b675f07` — estado y warm-up DocQuad
- `a2218dd` — endpoint no bloquea mientras calienta
- `cb968e8` — warm-up inicial + health

### DocQuad postproceso

- `dfadd37` — port de postproceso productivo `CORNERS vs MASK`
- pruebas posteriores en `scripts/docquad-postprocess-test.js`

### OpenCV spike → producto

- `d100242` — fusión Canny directo + corrección de `approxPolyDP`
- `488a128` — agrega fallback de segmentación de papel
- `b6ceaba` — valida OpenCV con fixture de CamScanner
- `7fa26cac00db39e8eaa70b9b4f1d0f8183e9e0fe` — `scanner/opencv/detector.js`
- `43bc795e444ae2b7c489a76f0eb0c83ede9440ae` — spike usa detector de producto
- `f4b9c929bfe43de09ccd880576e5f23e39a69851` — servicio compuesto DocQuad → OpenCV
- `7cdc9c3d3caaa1660729dca4e1ea33755e3889ef` — OpenCV disponible mientras DocQuad calienta
- `4534b570315c33c8be46df6f54560aca01823c5d` — precalienta ambos motores
- `8dcb6ff0e33ef5ba9f11800f7e79b1d50da7e119` — compatibilidad `/health`
- `9d60ea7094868c4bca357b7e2f228a267256de8f` — retiro de workflow temporal de lockfile
- `659ef39c3f023aaaff3a5281c89709cf93dabfbc` — CI valida fallback compuesto de producción

---

## 13. Dependencias / notas de runtime

Raíz:

- `onnxruntime-web@1.27.0`
- `@techstark/opencv-js@5.0.0-release.1`
- `@napi-rs/canvas` para decodificar/renderizar imágenes en Node

Durante `npm ci`, npm reporta vulnerabilidades en el árbol global del proyecto. **No asumir que todas pertenecen a OpenCV**. Revisar `npm audit` de forma separada antes de release; no hacer `npm audit fix --force` a ciegas porque puede introducir breaking changes.

---

## 14. Roadmap actualizado

```text
0    Captura full-res + overlay               web prácticamente listo; native pendiente
1    PNG → JPEG                               resuelto/avanzado en flujo actual
1.5  Spike DocQuad (Node)                    ✅ modelo/runtime/postproceso validados
1.5b OpenCV Node fallback                    ✅ implementado + CI
1.6  scanner-fixtures 20 + ground truth      ⬜ SIGUIENTE BLOQUE DE CALIDAD
2    Detector compuesto Node / WhatsApp      ✅ integrado; validar con fotos reales
3    DocQuad/OpenCV Web + Native              ⬜
4    AutoCapture + Quality                    ⬜
5    Perspectiva + realce                     parcial; falta validar end-to-end
6    OneEuro + Worker                         ⬜
7    Benchmark 300–500                       ⬜
```

No reordenar agresivamente. La prueba real de Safari y `scanner-fixtures/` son la evidencia que falta antes de declarar detección cerrada.

---

## 15. Siguiente paso exacto al abrir una nueva sesión

### Primero

Leer:

1. `CLAUDE.md`
2. `docs/ARQUITECTURA-SCANNER.md`
3. **este archivo** `docs/HANDOFF-CHATGPT-2026-08-12.md`

Recordar: cuando este handoff y la sección vieja de scanner en `CLAUDE.md` difieran, este handoff manda.

### Después

1. confirmar HEAD de `claude/new-session-9mhtdk`;
2. confirmar último `Scanner detector spike` verde;
3. esperar/confirmar deploy de Railway;
4. pedir al usuario una nueva captura de Safari con la **misma hoja**;
5. verificar visualmente el quad live;
6. si el quad es incorrecto, **no tocar thresholds a ciegas**:
   - registrar `fuente` (`docquad` / `opencv-canny` / `opencv-paper`);
   - registrar área, score, ángulos, razón y tiempos;
   - guardar esa foto en `scanner-fixtures/`;
   - anotar ground truth;
   - medir error antes de cambiar algoritmo.
7. si el live funciona, capturar y verificar el PDF final en Drive para confirmar redetección + perspectiva.

---

## 16. NO HACER

- **No revivir el detector Otsu/extremos como camino principal ni fallback.**
- No mostrar un quad inválido sólo porque tenga 4 puntos.
- No bajar `LOW_PEAK_MARGIN`/áreas/guardrails a ojo para “hacer aparecer” el marco.
- No tratar `20251007_183138_cropped.jpg` como ground truth de precisión; ya viene recortada.
- No procesar la imagen final a 256 o 720 px. Esas resoluciones son sólo copias para detección.
- No usar el quad live como única verdad final: redetectar después del disparo sobre la foto full-res.
- No migrar Expo/React Native a Capacitor; esa decisión ya se evaluó y descartó.
- No meter Hough/dewarping/otros algoritmos antes de tener fixtures que demuestren la necesidad.
- No modificar perspectiva/realce mientras se intenta diagnosticar detección; separar problemas.

---

## 17. Criterio para declarar esta etapa cerrada de verdad

La infraestructura/código del fallback queda cerrada con CI verde, pero la **detección de producto** sólo se declara validada cuando:

1. el mismo iPhone Safari que fallaba muestra el marco correcto repetidamente;
2. la captura final se recorta/endereza correctamente en Drive;
3. al menos 20 fixtures reales tienen ground truth;
4. DocQuad/OpenCV no generan falsos quads aceptados en escenas sin documento;
5. existe una métrica de precisión, no sólo screenshots subjetivos.

Hasta entonces el estado correcto es:

> **Detector compuesto implementado y probado en CI; validación real Safari/fixtures pendiente.**
