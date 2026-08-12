# Arquitectura del escáner — TapptScannerCore

_Definido: 2026-08-13. Documento de plan, no de estado: describe hacia
dónde vamos. Para lo que HAY hoy en el código, ver la sección "Estado
real" al final y `docs/DIRECCION-DISENO.md`._

## Por qué existe este documento

El escáner es "la carnita" del producto: es lo que separa a TapptScan de
un simple subidor de fotos a Drive. Durante la sesión del 2026-08-13 se
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

**Dónde corre — en los dos lados, con el mismo postprocesador en TS:**

- `onnxruntime-web` en el cliente → live loop sin latencia de red
- `onnxruntime-node` en el backend → **obligatorio**, porque la entrada
  principal de TapptScan es WhatsApp y ahí no hay cliente nuestro: llega
  una foto al webhook y hay que detectar y enderezar en el servidor

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

### Geometría y realce — OpenCV WASM (pendiente)

Build reducido (`core` + `imgproc`), no OpenCV entero:
`getPerspectiveTransform`, `warpPerspective`, CLAHE, `adaptiveThreshold`,
`GaussianBlur`, `Laplacian`, contornos, morfología, unsharp.

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

## Estado real hoy (2026-08-13)

| Pieza | Estado |
|---|---|
| Captura a resolución completa | ✅ hecho (0.25 → 5.35 MP) |
| Overlay alineado con el preview | ✅ hecho |
| Adapter de cámara (`CamaraDoc`) | ✅ hecho |
| Filtros de imagen (4 presets) | ✅ hecho, pero manuales y básicos |
| Detección DocQuad | ❌ pendiente — hoy es Otsu, y no da el ancho |
| Recorte + perspectiva automáticos | ❌ dependen de la detección |
| OpenCV WASM / realce automático | ❌ pendiente |
| AutoCaptureGate | ❌ pendiente |
| One Euro smoothing | ❌ pendiente |
| Worker | ❌ pendiente |

**Pendiente conocido no listado arriba:** el pipeline guarda PNG (~5 MB
por página ahora que las imágenes son grandes). Debe pasar a JPEG.

## Orden de trabajo acordado

1. PNG → JPEG (rápido, urgente por el peso de archivo)
2. **DocQuad** — arregla recorte, perspectiva y marco de una sola vez.
   Empezar por `onnxruntime-node` en el backend (una implementación,
   todas las plataformas, y cubre WhatsApp), luego `onnxruntime-web` para
   el live loop
3. **AutoCaptureGate** + quality gates
4. OpenCV WASM: realce automático y refinamiento de esquinas
5. Worker + One Euro (pulido de sensación)
