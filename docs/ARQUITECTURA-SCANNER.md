# Arquitectura del escáner — TapptScannerCore

_Definido: 2026-08-12. Documento de plan, no de estado: describe hacia
dónde vamos. Para lo que HAY hoy en el código, ver la sección "Estado
real" al final y `docs/DIRECCION-DISENO.md`._

## Por qué existe este documento

El escáner es "la carnita" del producto: es lo que separa a TapptScan de
un simple subidor de fotos a Drive. Durante la sesión del 2026-08-12 se
intentó cuatro veces mejorar el detector de bordes actual parchando el
mismo heurístico, y las cuatro fallaron contra fotos reales. La
conclusión no fue "otro parche más", sino que **la técnica actual no da
para más** y hay que cambiar de enfoque.

Este documento fija ese enfoque para no volver a improvisar.

## El diagnóstico que originó todo (con evidencia medida)

Comparando el PDF real que generaba TapptScan contra el mismo documento
escaneado con CamScanner:

| | Resolución | Píxeles |
|---|---|---|
| TapptScan (antes) | 477×530 | 0.25 MP |
| CamScanner | 1356×1920 | 2.6 MP |
| TapptScan (después del fix) | 1869×2863 | 5.35 MP |

**Dos causas independientes, ninguna era el filtro de imagen:**

1. **La foto nacía chica.** `expo-camera` en web nunca pide constraints a
   `getUserMedia` (su `getIdealConstraints` jamás recibe width/height, así
   que cae siempre en `MinimumConstraints = { video: true }`), y el
   navegador entregaba su default (~480p). Ninguna mejora posterior puede
   recuperar detalle que nunca se capturó. **Ya corregido** (ver
   `CamaraDoc.web.js`).

2. **La detección no está a la altura.** Umbral global (Otsu) + puntos
   extremos. Falla con luz despareja, fondos complejos, objetos oscuros, y
   con el contenido impreso dentro de una hoja. **Pendiente** — es lo que
   resuelve DocQuad.

## Decisión de plataforma

**Un solo código para web, web móvil, iOS y Android.** Hoy eso ya se
cumple vía React Native + react-native-web (por eso existen los pares
`.web.js` / `.native.js` en `FirmaPad`, `compras` y `CamaraDoc`).

Se evaluó y **se descartó** migrar a React DOM + Vite + Capacitor:
implicaría reescribir toda la UI (`View`/`Text`/`StyleSheet` de React
Native no corren en React DOM), y no resolvería ningún problema que
tengamos — el único límite real de plataforma era la resolución de la
cámara en navegador, y eso ya se corrigió sin cambiar de stack. En la app
nativa empaquetada, Expo ya entrega resolución de sensor.

Lo importante: **el resto de la arquitectura (core en TS, ONNX, OpenCV
WASM, Worker, adapters de cámara) es independiente del shell** y funciona
igual sobre React Native.

## El core

`TapptScannerCore` debe ser **TypeScript puro, sin React y sin saber en
qué plataforma corre**. Recibe imágenes y devuelve datos:

```
scanner.analyzeFrame(frame) →
{
  detected, corners: { topLeft, topRight, bottomRight, bottomLeft },
  focus, exposure, glare, stability,
  instruction: "READY" | "MOVE_CLOSER" | "HOLD_STEADY" | ...,
  shouldCapture
}
```

```
React → ScannerController → TapptScannerCore
```

Nunca `React Component → llamadas a OpenCV/ONNX` directo.

## Pipeline objetivo

```
CAMERA
  ↓  frame de análisis (640–1280px, chico y rápido)
WEB WORKER  ────────────────────────────────┐
  ├── DocQuad (ONNX) ──────→ 4 esquinas     │  fuera del hilo de UI para
  └── Quality Engine ──→ foco/exposición/   │  que el overlay corra a
                          glare/movimiento   │  60fps mientras la IA
  ↓                                          │  piensa a ~4 inf/seg
AutoCaptureGate ── READY → dispara ─────────┘
  ↓
FOTO A RESOLUCIÓN COMPLETA   ← nunca del stream de preview
  ↓
DocQuad otra vez sobre la foto real → refinar quad
  ↓
OpenCV WASM: warpPerspective → recorte → realce
  ↓
AUTO | ORIGINAL | COLOR | GRISES | B&N
```

**Regla dura:** el preview solo sirve para detectar, guiar y decidir
cuándo disparar. El escaneo final **siempre** sale de la captura a
resolución completa, con las coordenadas mapeadas del preview a la foto
original.

## Componentes

### Cámara — patrón adapter (✅ ya implementado)

`CamaraDoc.web.js` / `CamaraDoc.native.js`, misma API:

```js
capturar({ calidad, maxAncho }) → { base64, ancho, alto }
```

- `maxAncho` para los frames de detección (chicos = rápidos)
- Sin `maxAncho` para la captura final (resolución completa)
- Web: `getUserMedia` propio pidiendo hasta 4K. Nota: la documentación de
  WebKit sobre un tope de 720p en iOS Safari resultó **desactualizada** —
  en iPhone moderno sí honró constraints altas (medido: 5.35 MP).
- Nativo: `expo-camera`, que ya daba resolución de sensor.

### Detección — DocQuad (pendiente)

Modelo `docquadnet256_trained_opset17.ort` de
[MakeACopy](https://github.com/egdels/makeacopy) (Apache 2.0).
MobileNetV3 + FPN ligera.

```
imagen → letterbox 256×256 → RGB float NCHW → ONNX Runtime
       → mask_logits [1,1,64,64] + corner_heatmaps [1,4,64,64]
       → postproceso → TL, TR, BR, BL → validación geométrica
```

**Dónde corre — TRES runtimes, no dos.** "Cliente" no es uno solo: React
Native **no** corre `onnxruntime-web`. Corre JS sobre Hermes, no en un
navegador, y necesita su propio paquete:

| Superficie | Runtime | Motor |
|---|---|---|
| Web y web móvil (react-native-web) | `onnxruntime-web` | WASM (+ WebGPU opcional) |
| iOS / Android (Expo) | `onnxruntime-react-native` | ONNX Runtime nativo |
| WhatsApp / backend | `onnxruntime-node` | ONNX Runtime nativo |

El backend es **obligatorio**, no un respaldo: la entrada principal de
TapptScan es WhatsApp, y ahí no hay cliente nuestro — llega una foto al
webhook y hay que detectar y enderezar en el servidor.

**Esto no rompe el principio de un solo scanner.** Lo que se comparte es
todo menos la llamada al runtime:

```
COMPARTIDO (TypeScript, idéntico en las 3 superficies)
  DocQuadDetector · preprocessor (letterbox, NCHW, normalización)
  postprocessor (heatmaps → esquinas) · QuadValidator
  QualityEngine · AutoCaptureGate · ScannerController

ESPECÍFICO POR PLATAFORMA (adapter, solo carga y ejecuta el modelo)
  OrtRuntime.web.ts · OrtRuntime.native.ts · OrtRuntime.node.ts
```

Mismo patrón `.web` / `.native` que ya usamos en `CamaraDoc`, `FirmaPad` y
`compras`. El adapter es delgado a propósito: si la lógica se filtra
hacia él, se nos triplica el mantenimiento.

Conservar la filosofía del original: **no confiar ciegamente en la IA**.
Validar que el cuadrilátero sea convexo, no degenerado y razonable antes
de aceptarlo, con fallback a OpenCV y, al final, a ajuste manual.

Cadena de fallback:
```
1. DocQuad sobre la foto capturada
2. Esquinas del live, mapeadas a resolución completa
3. OpenCV (contornos)
4. Ajuste manual  ← el usuario SIEMPRE debe poder mover las 4 esquinas
```

### Geometría y realce — `ImageProcessor` (pendiente)

Mismo patrón adapter que `OrtRuntime`, y por la misma razón: **OpenCV.js
se compila con Emscripten para navegador, y React Native no es un
navegador**. Una librería hecha para browser/React DOM no es
automáticamente compatible con Hermes.

```
ImageProcessor          ← misma API, mismo algoritmo, mismo resultado
  ├── .web    → OpenCV.js / WASM
  ├── .native → POR VALIDAR   ← no asumir que OpenCV.js corre aquí
  └── .node   → OpenCV nativo o alternativa de servidor
```

La regla que sí imponemos es **misma API y mismo resultado visual**, no
"mismo binario WASM en todos lados". Ese desacople nos evita quedar
atrapados si en React Native hay que resolverlo distinto.

Operaciones necesarias (build reducido: `core` + `imgproc`, no OpenCV
entero): `getPerspectiveTransform`, `warpPerspective`, CLAHE,
`adaptiveThreshold`, `GaussianBlur`, `Laplacian`, contornos, morfología,
unsharp.

Presets al usuario, sin exponer 20 controles:

- **ORIGINAL** — solo perspectiva, recorte, rotación
- **AUTO** (default) — normalización de iluminación → balance de blancos
  → contraste local → denoise suave → sharpening suave
- **COLOR** — CLAHE solo sobre luminancia en LAB (preserva sellos, logos,
  firmas, fotos)
- **GRISES** — luminancia → normalización de fondo → CLAHE suave → sharpen
- **B&N** — corrección de fondo → umbral adaptativo → despeckle

### AutoCaptureGate (pendiente) — aportación propia

Es lo que más va a mover la sensación de producto, y es independiente del
detector. **Elimina los escaneos malos en el origen** en vez de intentar
rescatarlos después.

Cinco indicadores en tiempo real; cuando los cinco se mantienen estables
~350 ms → **dispara solo**:

```
✓ Documento detectado      ✓ Imagen enfocada
✓ Área suficiente          ✓ Sin movimiento
✓ Cámara razonablemente paralela
```

Medidas baratas: `variance(Laplacian)` para foco (normalizado contra un
máximo móvil, **no** un umbral absoluto — no funciona igual en todas las
cámaras), diff entre frames para movimiento, histograma para luz,
regiones saturadas para glare, % de área para encuadre.

Los umbrales **se calibran con fotos reales**, no se fijan a ojo.

### Estabilización del overlay (pendiente)

`OneEuroFilter` sobre las esquinas: quita el temblor sin que el contorno
se sienta atrasado. El overlay se renderiza a 60fps con las últimas
coordenadas suavizadas, aunque la inferencia corra a ~4/seg.

**El overlay siempre es nuestro** (React + SVG), idéntico en las cuatro
superficies, aunque debajo la cámara sea nativa.

## Sobre MakeACopy

Es **referencia algorítmica + fuente del modelo**, no código a portar: la
app es Java/Android (CameraX, OpenCV Android SDK) y no aplica a nuestro
stack. Lo que sí aprovechamos, reimplementado limpio en TypeScript:

modelo DocQuad · pre/postprocesamiento · validación de esquinas · One Euro
smoothing · algoritmo de foco · pipeline OpenCV · estrategia de fallback

**Licencias:** MakeACopy Apache 2.0, OpenCV Apache 2.0, ONNX Runtime MIT
— todas viables comercialmente. Conservar los avisos correspondientes.
**Verificar el `LICENSE` y el model card directamente** (no solo el
README) antes de incorporar nada. Descartados: DocTr (uso comercial
requiere contactar autores) y trudido-scanner (GPL-3.0).

## Antes de integrar nada: el spike de runtime

**No meter DocQuad al producto sin antes probar que el motor enciende en
los tres ambientes.** Un spike aislado, fuera de la app, con la MISMA
fotografía:

```
docquadnet256.ort
    ├── NODE            ✓ carga  ✓ inferencia  ✓ outputs correctos
    ├── WEB             ✓ carga  ✓ inferencia  ✓ outputs correctos
    └── REACT NATIVE    ✓ carga  ✓ inferencia  ✓ outputs correctos
```

Criterio: `esquinas(Node) ≈ esquinas(Web) ≈ esquinas(Native)`. No tienen
que ser bit-exact, pero sí geométricamente equivalentes.

Eso valida de un golpe: que el `.ort` funciona en cada runtime, el tensor
de entrada, NCHW, la normalización, el letterbox, los nombres y
dimensiones de los outputs, el postprocesador en TS, el empaquetado del
modelo, la memoria y el runtime de React Native. Si algo de eso falla,
falla **antes** de haber construido el scanner encima.

## `scanner-fixtures/` — medir en vez de opinar

Antes de las 300–500, un set chico de **20 fotos asesinas**, cada una con
sus `groundTruthCorners` marcadas a mano:

```
papel blanco / mesa oscura      perspectiva fuerte     luz amarilla
papel blanco / mesa blanca      sombra diagonal        baja luz
INE                             glare                  texto negro abundante
tarjeta oscura                  fondo con objetos      ticket largo
recibo térmico                  papel ocupando 90%     documento horizontal
contrato                        papel ocupando 30%     hoja ligeramente doblada
                                esquina fuera de cuadro
                                foto SIN documento     ← el falso positivo importa
```

Con eso, desde el primer día de DocQuad se mide **IoU / error de esquina,
tasa de detección, falsos positivos y latencia**.

Esto existe para no volver a *"se ve mejor en mi teléfono"* — que es
exactamente cómo se perdieron cuatro intentos el 2026-08-12. Pasamos a
*"DocQuad acertó 18/20, error medio de esquina X px"*.

Las 20 crecen después a las 300–500 de abajo.

## Criterio de "ya tenemos scanner"

No comparar por cantidad de funciones. Armar un set de **300–500 fotos
reales** y correr la misma foto contra CamScanner y TapptScan:

A4 · carta · recibos largos · tickets térmicos · INE/identificaciones ·
contratos · papel blanco sobre mesa blanca · papel blanco sobre mesa
oscura · sombras · poca luz · luz amarilla · perspectiva extrema ·
documento parcialmente fuera · fondos con ruido · papel doblado · reflejo

Medir: ¿detectó? ¿las 4 esquinas correctas? ¿disparó demasiado pronto?
¿quedó derecho? ¿cortó texto? ¿dejó mesa de más? ¿el blanco parece
blanco? ¿el texto se lee mejor que en la foto original? ¿introdujo
artefactos? ¿tiembla el overlay? ¿cuánto tardó?

## Fuera de v1

**Dewarping de páginas curvas** (libro abierto, hoja doblada). Necesita
modelos bastante más sofisticados. Primero resolver perfectamente papel
plano: recibos, contratos, identificaciones, tickets, facturas — que es
el grueso del uso real.

## Estado real hoy (2026-08-12)

| Pieza | Estado |
|---|---|
| Captura a resolución completa (web) | ✅ hecho (0.25 → 5.35 MP, medido) |
| Overlay alineado con el preview | ✅ hecho |
| Adapter de cámara (`CamaraDoc`) | ✅ hecho |
| Panel de diagnóstico (botón ⓘ, solo web) | ✅ hecho |
| Salida JPEG en vez de PNG | ✅ hecho (5.16 → 0.59 MB) |
| Filtros de imagen (4 presets) | ✅ hecho, pero manuales y básicos |
| Detección DocQuad | ❌ pendiente — hoy es Otsu, y no da el ancho |
| Recorte + perspectiva automáticos | ❌ dependen de la detección |
| OpenCV WASM / realce automático | ❌ pendiente |
| AutoCaptureGate | ❌ pendiente |
| One Euro smoothing | ❌ pendiente |
| Worker | ❌ pendiente |

### Lo primero al retomar

1. **Las 6 capturas de diagnóstico** (3 Safari + 3 Chrome iOS, mismo
   documento, misma luz). El botón ⓘ de la pantalla de cámara ya muestra
   STREAM / TRACK / DETECTOR / CAPTURA con dimensiones, MP, KB y ms. Con
   esos números se cierra el **Paso 0 Web con evidencia**, que es lo que
   falta para darlo por bueno. Verificar además: nitidez real ampliando
   texto chico (no solo comparar MP), que lo que se ve en el preview sea
   lo que sale en la foto, y que el marco verde caiga sobre las esquinas
   físicas del documento. Después, aparte, probar rotar el dispositivo
   (histórico punto débil de `getUserMedia` en WebKit).
2. **Decidir la salida del bloqueo de ONNX** (ver abajo). Recomendado:
   `onnxruntime-web` en Node para el spike.
3. No probar todavía como PWA instalada — WebKit tiene reportes de
   `getUserMedia` fallando en modo standalone aunque funcione en el
   navegador. Eso es un criterio de compatibilidad aparte, no mezclarlo
   con la calidad del scanner.

### Estado honesto del escáner

La **materia prima** ya está resuelta: capturamos 5.35 MP (más que los
2.6 MP de CamScanner) y pesa 0.59 MB. Lo que falta es **procesamiento**:
hoy el documento se guarda sin recortar ni enderezar, porque el detector
de Otsu no da confianza y cae al cuadro completo. Ese es exactamente el
hueco de DocQuad, y es el siguiente trabajo real.

## Orden de trabajo acordado

**Alcance temporal (2026-08-12):** hasta tener las cuentas de
desarrollador de Apple y Google, el laboratorio es **iPhone + Web App
(Safari de referencia, Chrome como compatibilidad) y WhatsApp/Node**.
React Native nativo se pospone — no bloquea nada del scanner.

Nota: Chrome en iOS **no** es Blink, corre sobre WKWebView/WebKit. Si
algo falla igual en Safari y en Chrome iOS, el problema es WebKit o
nuestro código, no "Chrome vs Safari". No optimizar los dos por
separado sin evidencia de que difieren.

| # | Paso | Estado |
|---|---|---|
| 0 | Captura full-res + overlay alineado | ✅ web / ⚠️ nativo sin medir |
| 1 | PNG → JPEG | ✅ hecho (5.16 MB → 0.59 MB) |
| 1.5 | **Spike DocQuad**: el `.ort` enciende en Node y Web | 🔴 bloqueado |
| 1.6 | `scanner-fixtures/` — 20 fotos con ground truth | ⬜ |
| 2 | DocQuad en **Node** (cubre WhatsApp Y la web app) | ⬜ |
| 3 | DocQuad en `onnxruntime-web` (quitar latencia del live loop) | ⬜ |
| 4 | AutoCaptureGate + quality gates | ⬜ |
| 5 | Perspectiva + realce automático (`ImageProcessor`) | ⬜ |
| 6 | One Euro + Worker (pulido de sensación) | ⬜ |
| 7 | Benchmark de 300–500 fotos contra CamScanner | ⬜ |
| — | DocQuad / AutoCapture / ImageProcessor en React Native | ⏸ hasta cuentas de tiendas |

**Hallazgo que simplifica el orden:** la web app ya pide la detección al
servidor (`POST /api/documentos/detectar-bordes`, cada 1.4 s). Poner
DocQuad en el backend con `onnxruntime-node` arregla **WhatsApp y la web
app de un solo golpe**, sin necesitar `onnxruntime-web` todavía. Ese
queda como optimización de latencia, no como requisito.

Los pasos **1.5 y 1.6 van antes de tocar el producto**: primero
comprobar que el motor enciende y que tenemos con qué medir. Construir
DocQuad encima sin eso es repetir el error de depender de "se ve mejor
en mi teléfono".

### 🔴 Bloqueo activo del paso 1.5

`onnxruntime-node` **no se instala desde el entorno de desarrollo de
Claude**: su `postinstall` descarga los binarios nativos de ONNX Runtime
desde un CDN externo y el proxy corta la conexión (`ECONNRESET`,
reproducido dos veces con `--foreground-scripts`).

El modelo **sí se pudo descargar** y está verificado: 13.4 MB, formato
ORT (flatbuffer, identificador `ORTM` en los bytes 4-8), desde
`raw.githubusercontent.com/egdels/makeacopy/main/app/src/main/assets/docquad/docquadnet256_trained_opset17.ort`.
Es formato ORT, **no** ONNX protobuf — hay que confirmar que el runtime
elegido lo cargue.

Tres salidas posibles, a decidir al retomar:
1. Instalar `onnxruntime-node` desde una máquina con salida libre y
   commitear el `package-lock.json`. Railway sí tiene red, así que en el
   deploy bajaría los binarios sin problema.
2. **Usar `onnxruntime-web` (WASM) dentro de Node** para el spike: se
   instala sin binarios nativos, desbloquea la validación de modelo,
   tensores, letterbox y postprocesador hoy mismo. Si el rendimiento no
   alcanza en producción se cambia el adapter — `OrtRuntime` existe
   justamente para eso. **Opción recomendada.**
3. Pedir que el proxy permita ese CDN.
