# TapptScan — Handoff para Claude Code

Fecha: 2026-08-12
Repo: `alejandrosoriaa-tappt/Tappt-Scan`
Rama: `claude/new-session-9mhtdk`
Checkpoint de código antes de este handoff: `18b3a21728672479311f6a8d78faf32690379a09`

## 1. Objetivo de producto decidido

TapptScan debe tomar como benchmark principal la experiencia reciente de cámara de CamScanner: visor limpio, campo visual amplio, documento relativamente pequeño dentro del frame, polígono fino y estable pegado al perímetro físico, tolerancia a perspectiva fuerte y corrección automática posterior. La filosofía es `apunta y ya`; no obligar al usuario a alinear el papel con precisión.

Prioridad UX inmediata:
1. Cámara más abierta / zoom-out real.
2. Detectar perímetro exterior del papel aunque esté inclinado.
3. Estabilizar temporalmente las 4 esquinas para que el quad no salte.
4. Aplicar homografía/rectificación automática después de capturar.
5. Simplificar UI: quitar marco punteado grande y reducir mensajes de “Alinea el documento”.

## 2. Arquitectura actual del detector

Detector compuesto de producción:

`DocQuad -> OpenCV fallback`

OpenCV actualmente compara tres familias de candidatos:
- `opencv-canny`
- `opencv-paper`
- `opencv-neutral-paper` (HSV: papel brillante + baja saturación)

No volver a Otsu como estrategia principal y no ajustar thresholds a ciegas. Los falsos positivos observados eran rectángulos internos del documento (tablas/recuadros) aceptados como si fueran el papel completo.

Commits relevantes del scanner durante esta sesión:
- `73f270bf38c3d7bfd26dba25063215503129b64a` — Canny y Paper compiten siempre.
- `efe7a11115afef3698a25181a1651379dc8697bb` — añade `opencv-neutral-paper` por HSV.
- `119efcdf7bc1fe8e2f9fd5c4a6f1edc8bb9c3150` — render de fixture visual con quad/telemetría.
- `dbcee41c45fd32255897babb057e7540406d2233` — comparte un solo fixture visual.

## 3. Fixtures reales

Ya se capturaron varios frames REALES enviados por navegador al detector, de exactamente `640x1138`. No son screenshots del teléfono. Esos casos demostraron que:
- una hoja completa sobre fondo de madera/tela puede ser confundida con tablas internas;
- los frames limpios sirven como regresión positiva;
- el ground truth esperado es siempre el perímetro físico exterior del papel;
- un documento puede tocar o salir ligeramente del viewport y aun así nunca debe sustituirse por un rectángulo interior.

Existe modo de diagnóstico con `?scannerDebug=1`. El backend guarda el último frame por cookie efímera y `/api/documentos/debug-fixture-visual` genera un JPEG que debe llevar:
- frame real;
- quad detectado en verde;
- fuente;
- confiable;
- area;
- score;
- timestamp.

## 4. Cámara / zoom-out

Se implementó en source web:

Commit `6fb33a0f027a3ee5cb8697b7dd6b9df06d111712` — `feat(scanner): prioriza cámara trasera más angular en web`

Archivo: `app/src/components/CamaraDoc.web.js`

Comportamiento nuevo:
- pide cámara `environment` primero para obtener permiso;
- enumera `videoinput` después del permiso;
- intenta priorizar labels tipo ultra-wide / 0.5x / wide-angle;
- penaliza tele/zoom;
- si el track expone `zoom`, aplica `caps.zoom.min`;
- conserva resolución alta para captura final;
- análisis live sigue reducido a 640 px de ancho.

IMPORTANTE: este cambio estaba sólo en `app/src` y la producción servía un `app/dist` precompilado viejo. Por eso todavía no se podía validar visualmente.

## 5. Cambio crítico de build / Railway hecho al cierre

Se dejó preparado para que Railway compile la app web automáticamente en cada deploy.

### `app/package.json`
Nuevo script:

`"build:web": "expo export --platform web --output-dir dist"`

Commit: `6a97701ac2b088bdc3cac8edcd13d9ea576eacfe`

### `package.json` root
Nuevo script:

`"build:web": "npm --prefix app ci && npm --prefix app run build:web"`

Commit: `759e4b750dd6934e7c0c7f2a3a7eaffad5540fb9`

### `railway.json`
Nuevo archivo con Nixpacks:
- build command: `npm run build:web`
- start command: `npm start`

Commit/checkpoint: `18b3a21728672479311f6a8d78faf32690379a09`

Al cerrar la sesión, Railway reportaba este commit como `pending`.

### PRIMER PASO OBLIGATORIO EN CLAUDE CODE

1. `git checkout claude/new-session-9mhtdk`
2. `git pull`
3. Confirmar HEAD.
4. Revisar deployment Railway correspondiente a `18b3a217...` (o HEAD posterior de este handoff).
5. Confirmar que el build ejecuta realmente `npm run build:web`, instala dependencias de `app/` y genera `app/dist` sin error.
6. Si falla, arreglar el build antes de tocar detector/UI.
7. Si queda verde, abrir Chrome iPhone y verificar si el campo visual ahora es más abierto y qué cámara/label/zoom reporta el diagnóstico.

## 6. Look & Feel deseado de cámara

Referencia visual: CamScanner reciente.

TapptScan debe migrar a:
- preview casi full-screen;
- sin gran marco punteado obligatorio;
- polígono exterior fino, limpio y estable;
- instrucciones discretas o inexistentes si hay detección útil;
- obturador limpio;
- permitir capturar desde más lejos;
- no exigir documento frontal;
- rectificar perspectiva automáticamente al terminar.

Después de validar zoom-out, hacer este bloque de UI. No intentar copiar branding/íconos exactos de CamScanner; copiar patrón de interacción y comodidad.

## 7. WhatsApp — confirmación de documentos

Se detectó una regresión: a las 3:31 p. m. la confirmación funcionaba (`Listo`, nombre, carpeta, link app y botones), pero pruebas posteriores guardaban el PDF sin mostrar confirmación.

El código actual seguía intentando `sendButtons`, por lo que la hipótesis más probable es rechazo del mensaje interactivo por Meta.

Fix aplicado:
`d3da9ab376ef487ebcaec2a49a26b402d210b221` — `fix(whatsapp): fallback a texto si Meta rechaza botones`

Ahora `sendButtons` debe intentar el interactivo y, si Meta lo rechaza, enviar el mismo body como texto simple. El usuario nunca debe quedarse sin confirmación después de un guardado exitoso.

Prueba pendiente: reenviar un PDF y comprobar que llega al menos el texto `Listo...` y, si Meta acepta, también los botones.

## 8. Qué NO hacer al retomar

- No regresar a Otsu como detector principal.
- No seguir bajando/subiendo thresholds a ojo.
- No asumir que Safari es el único navegador: las últimas pruebas fueron en Chrome iPhone.
- No confundir screenshot UI con fixture real; los fixtures reales son 640x1138.
- No tocar detector antes de validar que el nuevo build web realmente llegó a producción.
- No considerar resuelto el scanner sólo porque diga `confiable:true`; el quad debe seguir físicamente el papel.

## 9. Orden recomendado para la siguiente sesión

A. Validar build automático Railway y nuevo `app/dist`.

B. Validar cámara más angular/zoom mínimo en Chrome iPhone. Comparar el encuadre con CamScanner: debe permitir trabajar más lejos y dejar aire alrededor del documento.

C. Probar fixture visual con `?scannerDebug=1`; capturar un caso bueno y uno malo con quad quemado en el JPEG.

D. Corregir detector sólo si aún selecciona perímetros internos. Convertir los frames reales en tests/fixtures permanentes del repo.

E. Implementar estabilización temporal del quad (varios frames consistentes antes de marcar listo).

F. Simplificar UI al look & feel acordado tipo CamScanner.

G. Asegurar rectificación/homografía automática en la captura final y conservar ajuste manual como fallback.

H. Reprobar WhatsApp: PDF -> guardado -> confirmación visible.

## 10. Definición de “scanner listo” para este bloque

Este bloque se considera terminado cuando, en iPhone/Chrome:
- el usuario puede sostener el teléfono notablemente más lejos que antes;
- la hoja completa cabe cómodamente con margen alrededor;
- el quad sigue las cuatro orillas físicas, aunque haya perspectiva;
- no salta a tablas/recuadros internos;
- el quad es estable durante varios frames;
- la captura final se endereza automáticamente;
- la UI se siente limpia y de baja fricción;
- el mismo código source que está en GitHub se compila automáticamente en Railway sin depender de commitear manualmente `app/dist`.

---

Contexto final: el objetivo no es reinventar la UX de escaneo. CamScanner es el benchmark. TapptScan debe igualar la comodidad de captura y diferenciarse después con WhatsApp, Drive propio del usuario, IA, clasificación, nombres inteligentes, edición/firma y automatización documental.
