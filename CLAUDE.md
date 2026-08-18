# CLAUDE.md — Memoria del proyecto (tappt-scan)

## Qué es este repo

`tappt-scan`: monorepo con dos piezas del mismo producto —
**backend** (raíz, Node.js/Express 4 CommonJS, `server.js`) y **app nativa**
(`app/`, Expo / React Native). Es una **vertical propia**, separada de
`tappt-backend` — su propio repo, su propio número de WhatsApp, su propio
proyecto/schema de Supabase, su propio deploy en Railway. No compartir
credenciales ni tablas con `tappt-backend` o `tappt-broker`.

## Qué hace

Escaneo, clasificación y firma de documentos. Claude (visión) lee el
documento y deduce ámbito, categoría, emisor, periodo y monto; con eso se
arma **el nombre y la ruta** y el archivo se sube al Google Drive del propio
usuario. No se persiste el archivo en nuestros servidores, solo la metadata
en Supabase.

El momento que define el producto:

```
foto de un recibo de luz  →  CFE_Agosto_2026_$1,847.pdf
                             en  TapptScan/03 · Casa/Servicios/CFE/2026/
```

Al conectar Drive se crea de golpe **todo el árbol de carpetas**
(`services/taxonomia.js`, 36 carpetas) para que el usuario lo vea listo
desde el primer momento. Los niveles de emisor y año se crean solos
conforme llegan documentos. Lo que el clasificador no reconozca con
confianza cae en **`99 · Por revisar`** — un buzón para que el usuario lo
mueva, preferible a archivarlo mal.

Todo se guarda como **PDF**, también las fotos: se abre igual en cualquier
lado y el editor maneja un solo formato.

**Tres caminos de entrada**, todos a la misma tubería:

1. **Foto por WhatsApp** — el atajo rápido para escanear al vuelo.
2. **PDF reenviado por WhatsApp** — te llega un PDF en otro chat, lo
   reenvías a TapptScan y queda listo para editar o firmar.
3. **Importar desde la app** — para trabajo con calma: archivos del
   teléfono, iCloud, Drive o la galería.

WhatsApp es el camino rápido; el trabajo detallado (editar, firmar,
organizar) se hace en la app.

## Stack

- Runtime: Node ≥ 18, Express 4 (CommonJS).
- Datos: Supabase (Postgres) **solo como base de datos**, vía
  `services/supabase.js`. La autenticación es propia, por WhatsApp.
- IA: Anthropic (Claude, visión) para clasificar/extraer — `services/vision.js`.
- Mensajería: WhatsApp Cloud API (Meta Graph v19) — `services/whatsapp.js`.
- Almacenamiento: Google Drive del usuario vía OAuth — `services/drive.js`.
- Pagos: **dos canales** (decisión 2026-08-12, ver `docs/DIRECCION-DISENO.md`).
  1. **App nativa (iOS/Android): In-App Purchase de la tienda** —
     `services/iap.js`, `POST /api/pagos/iap/verificar`,
     `app/src/lib/compras.native.js`. Se acepta la comisión de 15-30% como
     costo de negocio en vez de evadirla. La guía 3.1.1 de Apple prohíbe
     dirigir a comprar fuera desde la app, así que ahí **no** se abre
     WhatsApp para contratar (solo para gestionar una suscripción activa).
     Bloqueado hasta dar de alta los productos en App Store Connect / Play
     Console y configurar `APPLE_SHARED_SECRET` /
     `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
  2. **WhatsApp y Web App: Stripe Checkout, suscripción anual** (planes
     Personal/Negocio) — ahí sí es válido cobrar afuera. Multi-moneda
     (mxn/usd/eur) para salir a otros países sin tocar código.
- Idiomas: español e inglés, en la app y en el bot (`services/i18n.js` y
  `app/src/i18n/`). El idioma del usuario vive en `scan_users.idioma`.
- Scanner nuevo: DocQuadNet-256 vía ONNX. En Node el spike usa
  `onnxruntime-web@1.27.0` con WASM single-thread para evitar el bloqueo de
  descarga de binarios de `onnxruntime-node`. Ver `scanner/docquad/` y
  `docs/HANDOFF-CHATGPT-2026-08-12.md`.

## Comandos

Backend (raíz):

```bash
npm install
npm run dev     # nodemon server.js → http://localhost:3000
npm start       # node server.js
```

App nativa (`app/`):

```bash
cd app && npm install
npm start       # expo start (QR para Expo Go)
npm run ios     # simulador iOS
npm run android # emulador Android
```

Health check: `GET /health`. **Guardrail de identidad**: el server NO
arranca si `WHATSAPP_PHONE_NUMBER_ID` no coincide con
`EXPECTED_WHATSAPP_PHONE_NUMBER_ID` (aborto a propósito, evita cruzar
credenciales con otra vertical). El health también expone el estado de
warm-up de DocQuad.

## Estructura

- `server.js` — arranque, guardrail de identidad, montaje de rutas y warm-up
  no bloqueante de DocQuad.
- `routes/webhook.js` — verificación + recepción de eventos de WhatsApp
  Cloud API (imagen, texto, botones). Aplica el límite del plan antes de
  procesar y atiende "quiero personal/negocio" mandando el link de pago.
- `routes/auth.js` — acceso por WhatsApp: pide el código y consulta si ya
  llegó el mensaje. Sin autenticación, a propósito: es el paso previo.
- `routes/cuenta.js` — perfil, consumo, preferencias y alta de pago.
- `routes/docquad.js` — `POST /api/documentos/detectar-bordes` del scanner
  nuevo. Se monta antes que `routes/documentos.js`. Si el modelo todavía
  calienta responde seguro (`MODEL_WARMING` / `MODEL_RETRYING`) sin bloquear
  la request ni volver a Otsu.
- `routes/documentos.js` — lista, gastos del mes, borrado, escaneo desde
  la cámara, importación de archivos, páginas rasterizadas para el editor
  y horneado de anotaciones.
- `routes/drive.js` — inicio de OAuth, callback (guarda tokens y crea
  carpetas) y listado de carpetas para el explorador.
- `routes/pagos.js` — webhook de Stripe: primera compra, renovación, cobro
  fallido y cancelación. **Verifica la firma** con `STRIPE_WEBHOOK_SECRET`;
  por eso `server.js` monta `express.raw` en esa ruta antes del parser JSON.
  Es idempotente ante reintentos. Un cobro fallido **no** baja el plan —
  Stripe reintenta durante días; solo la cancelación lo baja.
- `services/sesiones.js` — **acceso sin correo ni contraseña**. WhatsApp no
  deja escribirle primero a quien no te ha escrito salvo con plantilla
  aprobada, así que el flujo se invierte: la app abre WhatsApp con el código
  ya escrito, el usuario toca enviar, y el webhook amarra la sesión a ese
  número. Un toque y cero trámites con Meta.
- `services/auth.js` — valida el token propio (`requireAuth` deja el usuario
  en `req.usuario`). **No se usa Supabase Auth**: Supabase es solo la base.
- `services/planes.js` — límites por plan (gratis: 5/mes) y conteo mensual.
- `services/stripe.js` — crea la sesión de Checkout y verifica los webhooks.
- `services/i18n.js` — textos del bot de WhatsApp y detección de idioma.
- `services/procesarDocumento.js` — tubería compartida (visión → Drive →
  DB) que usan los tres caminos de entrada. La integración nueva redetecta
  el documento en la captura final full-res y tiene guardrail para evitar
  doble corrección de perspectiva.
- `services/docquad.js` — singleton/warm-up del detector, contrato de producto
  para cámara/WhatsApp y traducción de resultado DocQuad a
  `{esquinas, confiable, razon, diagnostico}`. **Tres niveles, no dos**:
  `confiable` (recorta solo), **parcial** (`esquinas` con `confiable:false`
  — se dibuja para que el usuario ajuste, nunca recorta) y sin quad. La
  confianza sale de DocQuad pasando sus guardrails **o** de que DocQuad y
  OpenCV coincidan (IoU ≥ 0.8) en el mismo papel; dos métodos independientes
  sobre el mismo papel es mejor evidencia que cualquier umbral suelto.
- `scanner/fixtures/` — **banco de fixtures con ground truth** (paso 1.6) e
  `iou.js`. Correr con `npm run scanner:fixtures`. Un fixture es una imagen
  **más** dónde está de verdad el documento, anotado a mano, y se mide por
  IoU. Es la única forma de saber si un cambio al detector mejoró o empeoró.
  Distingue `escena` (documento dentro de un fondo) de `recortado` (la imagen
  ya es el documento): confundirlos fue lo que rompió el CI durante días.
  **Van 2 de las 20 que pide el plan** — agregar fotos aquí vale más que
  cualquier ajuste de umbral.
- `scanner/docquad/` — modelo, descarga/verificación, letterbox 256×256,
  runtime ONNX/WASM, postproceso y detector aislado. El modelo queda fijado a
  un commit conocido de MakeACopy; no seguir `main` silenciosamente.
- `services/imagen.js` — conserva corrección de perspectiva y utilidades de
  imagen. **La detección Otsu/extremos está obsoleta y NO debe parcharse ni
  volver a ser el camino principal.** Ver `docs/ARQUITECTURA-SCANNER.md`.
- `services/pdf.js` — arma el PDF desde la imagen, hornea las anotaciones
  (texto, firma, imagen, emoji, tapar) con `pdf-lib`, y rasteriza páginas
  con `pdf.js` + `@napi-rs/canvas` para poder mostrarlas en la app. Ver
  `docs/EDITOR-PDF.md` y `assets/README.md`.
- `services/whatsapp.js` — mandar texto/botones, resolver y descargar media.
- `services/vision.js` — llamada a Claude vision, clasifica y extrae JSON.
- `services/gastos.js` — agregaciones de gasto. **El modelo nunca toca la
  base**: manda filtros, aquí se validan campo por campo y se ejecutan.
- `services/consultas.js` — preguntas de gasto en lenguaje natural por
  WhatsApp. Dos pasos: Claude traduce la pregunta a filtros, nosotros
  calculamos, Claude redacta los números que le damos.
- `services/sheets.js` — hoja de gastos en el Drive del usuario (plan
  Negocio). Usa el mismo scope `drive.file`.
- `services/taxonomia.js` — **fuente única del árbol de carpetas**. De aquí
  salen las tres cosas a la vez: las carpetas que se crean en el onboarding,
  el catálogo que se le inyecta al prompt del clasificador, y la validación
  de su respuesta. Cambiar el árbol aquí las cambia todas. También define `CATEGORIAS_GASTO`,
  un **eje independiente**: la carpeta dice dónde vive el documento, la
  categoría de gasto dice en qué se fue el dinero (un ticket de gasolina
  vive en Vehículos pero cuenta como `gasolina`).
- `services/naming.js` — convierte el JSON extraído en la ruta
  (`sección/subcarpeta/emisor/año`) y el nombre
  (`CFE_Agosto_2026_$1,847.pdf`). Limpia razones sociales y manda a
  `99 · Por revisar` lo que no case con la taxonomía.
- `services/drive.js` — OAuth de Google (**solo scope `drive.file`**, ver
  `docs/GOOGLE-DRIVE.md` — ampliarlo dispara la evaluación de seguridad de
  Google y atrasa el lanzamiento meses), crea rutas anidadas bajo
  `TapptScan/` (`ensureRuta`), lista carpetas para el explorador y sube o
  baja archivos. Las carpetas **no son fijas**: las crea el clasificador.
- `services/supabase.js` — cliente Supabase (service-role).
- `scan_schema.sql` — esquema completo: `scan_users`, `scan_documents`,
  `scan_sesiones`, `scan_payments`.

App nativa (`app/`, Expo / React Native, JS sin TypeScript):

- `App.js` — providers (navegación, safe area) y arranque.
- `src/navigation/RootNavigator.js` — stack raíz + cinco elementos
  (Inicio · Documentos · botón central · Gastos · Carpetas). La barra es
  propia porque el botón central va elevado sobre ella.
- `src/screens/DashboardScreen.js` — saludo, stats (documentos, gasto del
  mes), banner de upgrade y lista de recientes.
- `src/screens/EscanearScreen.js` — cámara de respaldo y overlay en vivo. En
  web usa frames ~640 px para detección y captura final full-res. El panel ⓘ
  muestra cámara real y la respuesta del detector (ver "Panel de diagnóstico").
  El contorno se dibuja con `components/ContornoQuad.js`, **no con SVG**.
- `src/components/ContornoQuad.js` — dibuja el cuadrilátero con cuatro Views
  rotadas. Es la única técnica que pinta en Safari/iPhone; ver la sección
  "El overlay NO usa SVG".
- `src/lib/preview.js` — **fuente única** del modo de ajuste del preview
  (`contain` en web, `cover` en nativo) y de la proyección de esquinas a
  píxeles de pantalla. El componente de cámara y el overlay TIENEN que usar
  el mismo: si se separan, el quad sale corrido.
- `src/screens/DriveScreen.js` — explorador del árbol real de Drive, con
  migas de pan. Los archivos propios abren el detalle; el resto va a Drive.
- `src/screens/DocumentoScreen.js` — detalle, datos extraídos y acciones
  (editar PDF, firmar, abrir en Drive).
- `src/screens/AjustesScreen.js` — cuenta, conexiones, plan y upgrade.
- `src/screens/LoginScreen.js` — un botón: abre WhatsApp con el código ya
  escrito y espera a que el backend confirme.
- `src/screens/OnboardingScreen.js` — único paso previo: conectar Drive.
  El número ya quedó verificado al entrar.
- `src/context/SesionContext.js` — sesión de Supabase + datos de la cuenta.
- `src/lib/sesion.js`, `src/lib/api.js` — token guardado y cliente del
  backend (toda llamada va firmada con él).
- `src/screens/RecorteScreen.js` — recorte con cuatro esquinas arrastrables.
  **Fix 2026-08-12:** las esquinas se proyectan contra el rect real de la foto
  dentro de `resizeMode="contain"`, no contra todo el lienzo; recibe
  `fotoAncho/fotoAlto` desde cámara.
- `src/screens/EditorScreen.js` — editor multipágina: eliges herramienta y
  tocas el documento para colocar texto, firma, emoji, imagen o un tapado.
- `src/lib/importar.js` — importación desde archivos del dispositivo
  (`expo-document-picker`) o desde la galería (`expo-image-picker`).
- `src/components/FirmaPad.js` — lienzo de firma en WebView; devuelve PNG.
- `src/i18n/` — `textos.js` (catálogo es/en) y el proveedor con `useIdioma()`.
  El idioma sale del dispositivo, el usuario lo puede cambiar en Ajustes, y
  se sincroniza al backend para que el bot le hable igual.
- `src/hooks/useCargar.js`, `src/components/DocumentoCard.js`, `src/theme.js`.

**Navegación:** tres puertas — sin sesión → Login; con sesión pero sin Drive
conectado → Onboarding; todo listo → tabs.

**Autenticación:** no hay Supabase Auth. La identidad es el número de
WhatsApp; el backend firma su propio token. Ver `services/sesiones.js`.

**Variables de la app** (`app/.env.example`): `EXPO_PUBLIC_API_URL` (el
backend desplegado, nunca `localhost`: el teléfono de un tester no ve tu
máquina). En la **web app** es opcional: `src/lib/api.js` cae al propio
origen, porque el backend sirve `app/dist`. En nativo sí es obligatoria.

**Build web:** `app/dist` NO se versiona. Railway lo genera en cada deploy
con `npm run build:web` (raíz), que instala `app/`, corre `expo export` y
después `app/scripts/postbuild-web.js` (apple-touch-icon, manifest y meta
tags de PWA). Si algún día la web app responde 404, lo primero a revisar es
si Railway ejecutó ese `buildCommand`.

**Web app espejo:** el mismo código corre en el navegador con React Native
Web (`npm run web`). Dos piezas tienen variante `.web.js` porque no existen
fuera del móvil: `FirmaPad.web.js` (canvas directo en vez de WebView) e
`importar.web.js` (`FileReader` en vez de `expo-file-system`). Al agregar
código que use APIs nativas, revisar si necesita su variante web.

**Probar y repartir la app:** todo lo que usa está en Expo Go, así que
`cd app && npm start` y escanear el QR basta para probarla sin compilar.
Para beta con usuarios reales, ver `docs/DISTRIBUCION.md` (web app, EAS
Build, TestFlight y Play Internal Testing).

## Modelo de negocio (referencia)

| Plan | MXN | USD | EUR | Incluye |
|---|---|---|---|---|
| Gratis | $0 | $0 | €0 | 5 escaneos/mes, sin edición de PDF ni firmas |
| Personal | $299 | $19 | €18 | Escaneos ilimitados, edición de PDF + firmas |
| Negocio | $499 | $29 | €28 | + control de gastos, multi-usuario, recordatorios |

Precios en `services/planes.js` (`PRECIOS`): agregar una moneda ahí basta
para vender en otro país. Cobro por WhatsApp/Web con Stripe; app nativa usa
IAP de tienda según la decisión documentada en `docs/DIRECCION-DISENO.md`.

## Convenciones

- **Idioma: español** en código, docs y commits.
- **Commits:** estilo `tipo(scope): descripción`, p. ej. `feat(webhook): …`.
- Rutas en `routes/` = controladores HTTP delgados; lógica en `services/`.
- Estado durable → Supabase (proyecto/schema propio de TapptScan).
- No mezclar con `tappt-backend` ni `tappt-broker`: ni tablas, ni número de
  WhatsApp, ni env vars.

## Puesta en marcha

Credenciales, variables, qué crear en Railway y qué SQL correr:
**`docs/PUESTA-EN-MARCHA.md`**. El esquema completo está en
`scan_schema.sql` (un solo archivo idempotente, se corre entero).

**Qué cuenta/proyecto es cada cosa** (Supabase, Railway, Google Cloud,
Stripe — nombres, IDs, org, sin secretos): **`docs/INVENTARIO-INFRAESTRUCTURA.md`**.
Consultar ahí antes de crear nada nuevo, para no duplicar cuentas ni mezclar
infraestructura con otra vertical.

**Rediseño de la app (benchmark CamScanner)**: brief completo de producto
y diseño, pantalla por pantalla, con los prompts exactos a seguir:
**`docs/DIRECCION-DISENO.md`**. Ahí también está la crónica de qué se
intentó y qué falló — leerla antes de repetir un enfoque ya descartado.

**Motor de escaneo**: **`docs/ARQUITECTURA-SCANNER.md`** — arquitectura,
benchmark y orden de trabajo. Otsu está para reemplazarse, no para
parcharse. Para el estado exacto del relevo y los fixes hechos después de la
sesión de Claude, leer inmediatamente:

**`docs/HANDOFF-CHATGPT-2026-08-12.md`**.

## Rama de trabajo

Rama activa: **`claude/new-session-9mhtdk`**. Desarrollar, commitear y
pushear ahí. No abrir PR salvo que se pida explícitamente.

## 👉 Retomando la sesión (actualizado 2026-08-13 CDMX)

**ORDEN DE LECTURA para retomar scanner:**

1. `CLAUDE.md` (este archivo).
2. `docs/ARQUITECTURA-SCANNER.md`.
3. `docs/HANDOFF-CHATGPT-2026-08-12.md` (histórico del relevo anterior).

### Estado actual — validado en iPhone/Safari 2026-08-13

**El escaneo funciona de punta a punta en la web app.** Medido en el
dispositivo, no en teoría:

- Cámara: ultra-wide real a **0.5x** (Safari SÍ expone `zoom: 0.5-10`),
  stream `3024×4032` (4:3), preview en `contain`. El campo visual abierto
  del benchmark ya está.
- **Contorno en vivo antes de disparar**: sobre madera da `acuerdo=0.98/0.99`
  entre los dos detectores y el quad verde queda pegado al papel. Latencia
  ~300-560ms por ciclo.
- Recorte y enderezado sobre la captura full-res (12.19MP): correcto,
  incluso con perspectiva fuerte.

**Caso abierto: superficies claras (granito, mármol claro, acero).** Ahí
OpenCV se traga la barra entera (áreas medidas 0.66-0.77) y DocQuad
devuelve quads más grandes que el papel. Los dos fallan. Hoy el producto
responde con contorno BLANCO —detecté algo pero no me fío, ajústalo tú— y
NO recorta solo, que es la conducta correcta mientras no se pueda medir.
No tocar ese caso sin fixtures: ya se intentó a ojo y salió mal (abajo).

**Sigue pendiente:** DocQuad en el navegador (pasos 3 y 6). Hoy cada ciclo
es un viaje al servidor; CamScanner corre en el teléfono a 30fps. Esa es la
brecha de FLUIDEZ que queda, no de acierto.

### Reglas del compuesto (`services/docquad.js`)

Tres niveles: **confiable** (recorta solo) · **parcial** (se dibuja para
ajustar, nunca recorta) · **sin quad**.

`confiable` exige **ACUERDO entre los dos detectores** (IoU ≥ 0.8), o que
DocQuad pase sus propios guardrails. En desacuerdo se dibuja el quad de
**DocQuad** —en madera y granito es el único que se queda en el documento
cuando OpenCV se va a la mesa— pero marcado como parcial.

**Intento revertido el 2026-08-13:** se permitió que DocQuad SOLO marcara
confiable cuando su única objeción fuera `LOW_PEAK_MARGIN` y no hubiera
señal de imagen ya recortada. En granito eso produjo quads confiables
visiblemente equivocados (áreas 0.315 y 0.363, uno saliéndose del cuadro),
o sea recorte automático malo. **Un verde equivocado es peor que un blanco
correcto:** el blanco pide ajuste, el verde recorta. No reintentarlo sin
fixtures de superficie clara que lo respalden.

### El overlay NO usa SVG — y no debe volver a usarlo

`react-native-svg` con `<Svg style={StyleSheet.absoluteFill}>` **no pinta
nada en Safari/iPhone**, aun cuando el detector responde `confiable` con
acuerdo 0.98. `RecorteScreen` siempre funcionó porque dibuja con Views
rotadas. Esa técnica está extraída en `components/ContornoQuad.js` y la
usan las dos pantallas.

Va **sin relleno** a propósito: aproximarlo con la caja envolvente del quad
se veía mal con el documento inclinado (la mancha sugería una detección
mayor que la real). Un overlay que miente sobre lo que detectó es peor que
uno sin relleno.

### Cómo se toman decisiones aquí ahora

`npm run scanner:fixtures` es la vara. Cualquier cambio al detector se
justifica con IoU contra ground truth, no con una foto que "se ve bien".
Esto no es burocracia: se perdieron varias sesiones ajustando contra un
fixture que premiaba la respuesta incorrecta.

**Prohibido mover umbrales a ojo.** Ya se intentó y los datos lo
desmintieron dos veces (ver abajo).

### Hallazgo 2026-08-13 — por qué el scanner no avanzaba

Tres causas, todas nuestras, encontradas con el banco de fixtures nuevo:

1. **DocQuad estaba apagado de hecho.** `PEAK_SIGMA_THRESHOLD = 5.0`
   (heredado tal cual de MakeACopy, `DocQuadPostprocessor.java:130`) exige
   que las 4 esquinas tengan su pico a ≥5σ. En fotos reales los picos
   medidos van de **2.4 a 4.0**, así que `LOW_PEAK_MARGIN` se disparaba
   siempre. Todo lo visto en pantalla hasta ahora ha sido OpenCV; DocQuad
   nunca produjo una detección aceptada.
2. **El compuesto era todo-o-nada y tiraba esquinas correctas.** Un quad de
   DocQuad con IoU **0.948** contra ground truth se descartaba entero por
   estar marcado `suspicious`, y la app no dibujaba nada. El `CLAUDE.md`
   afirmaba que `99cff3d` conservaba el parcial: el postproceso sí lo
   conservaba, pero el compuesto lo anulaba después. Ya está arreglado.
3. **Medíamos con un fixture equivocado.** El del CI es una hoja YA
   RECORTADA y se le exigía un quad de área < 0.95 — o sea, se premiaba
   la respuesta incorrecta. Se estuvo ajustando contra esa señal.

**NO tocar `PEAK_SIGMA_THRESHOLD` a ojo — se midió y NO funciona.** La
tentación es bajarlo de 5.0 a ~2.5 para que las detecciones reales pasen.
Los datos lo desmienten: el caso donde DocQuad SE EQUIVOCA tiene
z 2.37-3.65, **solapado** con los aciertos (2.97-3.96). Bajarlo dejaría
pasar la detección mala. Tampoco separan la máscara (0.033 en un acierto
vs 0.023 en el error) ni la concordancia interna corners/mask (0.238 en un
acierto vs 0.668 en el error).

Lo que SÍ separa ese caso: la imagen ya es el documento. Ahí OpenCV ve
superficie clara ocupando casi todo el cuadro → señal `marcoCompleto`.
Por eso el compuesto confía en DocQuad cuando su única objeción es
`LOW_PEAK_MARGIN`, su geometría es válida y NO hay `marcoCompleto`.

### Mínimos de área y el encuadre abierto

Al pasar la cámara a 0.5x el documento ocupa ~5-10% del cuadro. Los
mínimos de OpenCV (0.15/0.10) estaban calibrados para el visor recortado
y dejaban ciego al detector justo en el encuadre que el producto pide.
Están en 0.03/0.02, fijados por el fixture `camscanner-lejos`.

Commits del relevo ChatGPT documentados en el handoff:

- `a449d20` — fix `contain` en RecorteScreen.
- `30fa042` — dimensiones reales de captura al editor.
- `9d722c9` — limpieza de workflow temporal.
- `b675f07` — warm-up/estado DocQuad.
- `a2218dd` — endpoint no bloquea mientras calienta.
- `cb968e8` — warm-up al arranque + estado en `/health`.
- `99cff3d` — conserva quad parcial si la geometría es válida.

### Granito (2026-08-14) — el caso ya es medible, y no era lo que creíamos

Entraron las **dos primeras tomas reales del dispositivo**, cada una con su
JSON de diagnóstico al lado (`scanner/fixtures/fotos/`). El banco reproduce
en Node exactamente lo que pasó en el iPhone, así que el caso de superficie
clara **ya no se discute de memoria, se mide**:

```
granito-centrado  IoU=0.982  confiable=false  acuerdo=0.111
   docquad: IoU=0.982  z=[3.15, 3.21, 3.34, 3.50]  LOW_PEAK_MARGIN
   opencv:  area=0.744  ← se traga la barra entera

granito-de-lado   IoU=0.894  confiable=false  acuerdo=0.160
   docquad: IoU=0.894  z=[3.49, 2.85, 3.34, 3.53]  LOW_PEAK_MARGIN
   opencv:  area=0.867  ← otra vez la barra entera
```

**DocQuad no falla en granito.** El `CLAUDE.md` decía "los dos fallan"; con
las fotos en la mano el que falla, dos de dos, es OpenCV. Lo que degrada la
respuesta a `parcial` es el **desacuerdo** entre un detector que acertó y
otro que se fue a la mesa — más el 5σ, que descarta a DocQuad como siempre.

Se registran como **casos abiertos** (`abierto: true`): se miden e imprimen,
pero no tumban el CI. Marcar rojo algo que ya se sabe roto solo entrena a
ignorar el rojo.

**Aun así no hay con qué arreglarlo todavía.** La tentación obvia —"si
DocQuad acierta, hazle caso"— es exactamente el cambio que se revirtió el
2026-08-13, y estas dos tomas no la respaldan: el `IoU(corners,mask)` sale
0.766 y 0.552, o sea a ambos lados del caso malo conocido (0.668), así que
esa métrica sigue sin separar nada. Lo que falta es **granito SIN
documento**: si el detector inventa un quad sobre la barra vacía, confiarle
en superficie clara queda descartado de entrada, y esa sola foto ahorra la
discusión entera.

Nota de anotación: en `granito-de-lado` la hoja está girada, y colocar las
esquinas sobre la rejilla de décimos no daba confianza. El ground truth se
midió sobre la propia imagen (componente blanca conexa → casco convexo →
cuadrilátero de área máxima) y se verificó dibujándolo encima. Es el método
a repetir cuando el papel no esté alineado con el cuadro.

### `granito-vacio` (2026-08-14) — la máscara sí separa

Entró la toma que faltaba: **la misma barra sin documento**. Fixture de tipo
`vacio`, sin ground truth (no hay nada que encerrar); la respuesta correcta
es no dar nada por confiable y ni siquiera dibujar.

```
granito-vacio  dibuja=true  confiable=false  acuerdo=0.008
   docquad: z=[2.67, 2.40, 2.28, 2.52]  area=0.020  chosenSource=MASK
   opencv:  area=0.765  ← la barra otra vez
```

**Los dos inventan.** OpenCV devuelve la barra; DocQuad, con sus esquinas
penalizadas, cae a la máscara y devuelve un quad de 0.02. El producto no
recorta —queda en parcial— pero igual pinta un contorno donde no hay nada,
y eso le dice al usuario "ahí hay algo".

Lo importante es que **por primera vez una métrica separa**, y es la máscara
de DocQuad, no las z:

```
                     areaGt05   meanProb
camscanner-nota          702      0.171
granito-de-lado          393      0.098
granito-centrado         263      0.064
camscanner-lejos         133      0.033
makeacopy-recortado       97      0.023
granito-vacio             11      0.004   ← sin documento
```

Un orden de magnitud de distancia contra el mínimo de todo lo que sí lleva
documento. Es la primera candidata seria a puerta de "no inventes", y de
paso la vara con la que se puede volver a discutir el 5σ: si la máscara ya
dice que no hay papel, el 5σ deja de ser la única defensa.

**No se implementa todavía**: es UNA sola toma vacía. Un umbral sacado de un
punto es exactamente el error que costó las sesiones anteriores. Con dos o
tres vacíos más (madera, oscuro), la puerta se puede fijar con evidencia.

El tipo `vacio` es además la pieza que faltaba en el banco: sin él,
"detectar más" se confunde con "detectar bien" — un detector que siempre
devuelve un quad saca IoU decente en todos los demás fixtures.

### Bug de captura de fixtures — dos botones encimados (arreglado)

Los dos botones del panel de depuración vivían en el mismo sitio
(`left:16px; bottom:150px`) y quedaban uno encima del otro: el de la app
(`app/src/lib/api.js`, entrega **jpg + json**, lo único registrable) y el
que inyecta `server.js` (entrega solo el render con el quad encima). No se
podía saber cuál se estaba tocando, y por eso llegaron tomas con solo el
visual, que hubo que repetir.

En realidad eran **tres** elementos peleando la misma franja: los dos
botones más la pista de la cámara (`pistaCaja` en `EscanearScreen`), que
queda justo ahí. Por eso los dos botones se mudan **arriba**, apilados bajo
la fila de ✕/ⓘ (`top:112px` el gris, `top:160px` el verde): separarlos entre
sí abajo solo habría movido el choque al tercero. El gris dice "Ver
detección (solo imagen)"; el verde, "Compartir fixture (jpg + json)".

### Cómo NO se pierde el jpg al recolectar (2026-08-18)

Recolectando `escritorio-cuaderno` se repitió **cuatro veces** el mismo
JSON (mismo sello `T134607347Z`) sin su jpg, antes de que llegara un par
bueno. Dos causas, para no repetirlas:

1. **Reenviar la foto ya guardada NO es un fixture nuevo.** El botón verde
   hay que tocarlo de nuevo sobre la escena actual; reenviar desde la
   galería una imagen que ya se compartió antes solo repite el sello viejo
   — el detector nunca volvió a correr sobre nada.
2. **AirDrop va al Mac, no a esta conversación.** Si la sesión de Claude se
   usa solo desde el iPhone, la ruta es "Guardar en Archivos" desde el
   panel de compartir de iOS, y adjuntar desde ahí con el clip 📎 — nunca
   hay una carpeta del teléfono visible para quien lee los fixtures.

Señal de que el par SÍ es válido: el `.jpg` trae dimensiones de frame de
cámara (640×853 en las tomas de esta sesión), no las de una foto normal de
galería, y su nombre comparte sello exacto con el `.json` de al lado.

### Pedido "que encuadre como CamScanner, en ángulo" (2026-08-18) — medido, no es umbral

Se pidió que el overlay se pintara verde con transparencia y encuadrara
aunque la cámara no esté perfectamente cenital, citando CamScanner de
referencia. Antes de tocar nada se pidió el fixture que probara el caso:
`escritorio-lejos`, la libreta chica y lejos en el cuadro, en la posición
donde hoy sale blanco.

El candidato que devuelve el detector en esa foto **no seguía el borde del
papel**: cae sobre un reflejo/brillo de la página y corta casi media hoja
(**IoU 0.375** contra el ground truth de la página derecha). El blanco no
es un umbral de más — es la respuesta correcta ante un candidato roto.

Esto es la contraparte exacta del intento revertido el 2026-08-13
(aflojar el umbral produjo verdes malos en granito): la petición de
"que encuadre siempre" choca con el mismo hecho de siempre, medido dos
veces ahora en escenas distintas — **cuando el candidato es malo, ponerlo
confiable no arregla el candidato, solo esconde que está mal.** El overlay
sin relleno (ver arriba) tampoco se toca por la misma razón: rellenarlo de
verde en un caso como este mentiría sobre una detección que no existe.

Lo que SÍ falta para acercarse a CamScanner sin repetir el error: mejores
candidatos cuando el documento es chico (subir resolución del recorte que
ve OpenCV, o que DocQuad no dependa tanto del 5σ en escenas lejanas), no
bajar la vara de qué se pinta verde.

**Segunda medición (`escritorio-angulo`, mismo día):** la misma libreta en
ángulo oblicuo, y el candidato es todavía peor — una esquina se sube al
**teclado**, metiendo área negra al quad (IoU 0.385). Dos escenas, dos
veces el mismo resultado: el ángulo no es lo que rompe la detección, el
candidato ya venía roto.

**Y la máscara vuelve a separar.** Comparando las tres tomas de escritorio:

```
                       areaGt05  meanProb  IoU final
escritorio-cuaderno        370     0.090     0.891  OK
escritorio-lejos           119     0.029     0.375  malo
escritorio-angulo           82     0.024     0.385  malo
```

Es la misma señal que apareció con `granito-vacio` (11 / 0.004). La
máscara de DocQuad no solo distingue "no hay documento": **predice si el
candidato va a servir**.

### Madera con reflejo (2026-08-18) — el banco ya tiene con qué decidir

Entraron `madera-libreta` y `madera-vacia`: mesa barnizada con sol directo
por la ventana, media escena en sombra. Las dos cierran una discusión cada
una.

**1. `madera-libreta` es la TERCERA superficie con el mismo patrón.**

```
madera-libreta   IoU=0.935  confiable=false  acuerdo=0.216
   docquad: IoU=0.935  ← el mejor de TODAS las tomas reales del banco
   opencv:  discrepa → el compuesto degrada a parcial
```

DocQuad acierta mejor que en ninguna otra foto del dispositivo, y aun así
sale contorno blanco. Ya son tres superficies distintas —granito centrado,
granito de lado, madera con reflejo— donde **el que falla es OpenCV y el
desacuerdo se lleva por delante una detección buena**.

**2. `madera-vacia` da la señal más limpia del banco:**

```
                  areaGt05   meanProb
madera-vacia            0    0.0000146   ← sin documento
granito-vacio          11    0.004       ← sin documento
──────────────────────────────────────
escritorio-angulo      82    0.024       ← el mínimo CON documento
camscanner-nota       702    0.171       ← el máximo
```

**Cero absoluto.** Con dos vacíos medidos y siete con documento, la puerta
de "no inventes" ya no depende de un solo punto: hay un hueco de 7× entre
el vacío más alto (11) y el mínimo con documento (82). Ese era el requisito
que faltaba para poder implementarla con datos en vez de a ojo.

### ✅ Puerta de máscara — IMPLEMENTADA (2026-08-18)

`mascaraApagada()` en `services/docquad.js`. Si la máscara de DocQuad está
apagada, no se dibuja nada: no hay papel.

```js
MASCARA_AREA_MINIMA = 40      // vs. 11 el vacío más alto, 82 el mínimo con papel
MASCARA_PROB_MINIMA = 0.012   // vs. 0.004 y 0.024
```

Tres decisiones de diseño, todas por lo mismo —solo hay dos tomas vacías—:

1. **Umbrales pegados al lado vacío** (2× por debajo del mínimo con papel).
   Errar hacia abajo solo deja el comportamiento de hoy; errar hacia arriba
   borraría el contorno de un documento real, que es mucho peor.
2. **Se exigen las DOS señales a la vez** (`areaGt05` Y `meanProb`). Pedir
   que ambas coincidan es más difícil de romper que un umbral suelto.
3. **La puerta va ANTES de mirar a OpenCV**, y eso es lo que importa: en
   `granito-vacio` OpenCV devuelve la barra entera con toda confianza
   (0.765). Anular solo el quad de DocQuad dejaría el acuerdo en `null`, y
   la rama de abajo trataría esa barra como **confiable** — recorte
   automático de la mesa, peor que el contorno fantasma que se arreglaba.

Resultado en el banco: `granito-vacio` y `madera-vacia` pasan a `dibuja=false`
y **cero regresión** — los nueve fixtures con documento conservan IoU y
estado idénticos. Los dos vacíos dejan de ser casos abiertos y quedan como
prueba de regresión: si alguien afloja la puerta, se ponen rojos.

Sin datos de máscara la puerta **no opina** (`return false`): solo actúa
con evidencia, nunca por ausencia de ella.

Nota: en `madera-vacia` **OpenCV acierta** (`NO_QUAD`, no devuelve nada) y
el que inventa es DocQuad (área 0.121). Es el espejo exacto del caso de
granito — cada detector falla en el escenario donde el otro acierta, y por
eso el acuerdo entre ambos sigue siendo mejor evidencia que cualquiera por
separado.

### 🔴 SIGUIENTE PASO — bloqueado esperando datos

**Las 9 tomas que faltan del banco de fixtures.** Es lo único que falta para poder
avanzar en el caso del granito y para revisar si el 5σ ya se puede mover.
Instrucciones y lista de escenarios en `scanner/fixtures/fotos/README.md`.

Se sacan con el botón **"Compartir fixture"** de
`scan.tappt.lat/?scannerDebug=1` — entrega el frame EXACTO que recibió el
detector más el JSON de lo que respondió. **No sirven capturas de pantalla
del teléfono**: traen la interfaz encima y están reescaladas.

Prioridad de escenarios: granito con documento, granito SIN documento (el
detector no debe inventar), madera con reflejo, superficie oscura.

**Esperar el set completo antes de tocar el detector.** En esta sesión se
avanzó con la mitad de las fotos y el resultado fue un cambio que hubo que
revertir.

### Panel de diagnóstico ⓘ (temporal, solo web)

Ya muestra la respuesta real del detector, no solo el frame local:

```
DETECCIÓN <fuente> · confiable|parcial · <ms>
dibuja=<docquad|opencv> area=<n> acuerdo=<n> minZ=<n>
razon=<...>
opencv: area=<n> <razon> [· marcoCompleto]
```

`DETECTOR` mide el frame local; `DETECCIÓN` mide lo que contestó el
servidor. No confundirlos.

## Posicionamiento (2026-08-13): expo industrial

Se está postulando TapptScan a un encuentro industrial. El encuadre que se
definió ahí y que conviene sostener en producto:

- **Público:** equipos de campo saturados —obra, mantenimiento, logística,
  planta— que generan remisiones, vales, órdenes de trabajo y certificados
  de calidad, y no tienen tiempo de capturarlos.
- **Argumento de adopción:** cero instalación, cero licencias por usuario,
  cero capacitación. La entrada es una foto por WhatsApp.
- **Argumento para TI:** el archivo vive en el Google Workspace **del
  cliente**, con scope mínimo `drive.file` (no puede leer el resto de su
  Drive). Nosotros solo guardamos metadatos.
- **Requisito duro del prospecto:** que ya use Google Workspace.

Dos consecuencias para el orden de trabajo:

1. **Lote/mosaico sube de prioridad.** Un equipo de campo trae un FAJO de
   remisiones, no una hoja. Con este posicionamiento deja de ser una
   función bonita y pasa a ser necesaria.
2. **Robustez en superficies claras es crítica.** Acero inoxidable, lámina
   y mesas de trabajo claras son el pan de cada día en una planta — y es
   justo el caso que hoy falla.

## Estado / pendientes generales

Pendientes de scanner están gobernados por `docs/ARQUITECTURA-SCANNER.md` y
el handoff anterior. El orden acordado sigue siendo:

```
0    Captura full-res + overlay             en validación web / nativo pendiente
1    PNG → JPEG                             avanzado/resuelto en web actual
1.5  Spike DocQuad (3 runtimes)            Node avanzado; web/native pendientes
1.6  scanner-fixtures (20 + ground truth)  banco y metrica IoU listos; van 11/20 fotos
2    DocQuad Node / WhatsApp                integración en curso
3    DocQuad Web + Native                   pendiente
4    AutoCapture + Quality                  pendiente
5    Perspectiva + realce                   parcial / pendiente de validar end-to-end
6    OneEuro + Worker                       pendiente
7    Benchmark 300–500                      pendiente
```

Otros pendientes de producto:

- **Editor**: falta arrastrar un elemento ya colocado y reemplazar texto de
  un PDF nativo en su sitio. Ver `docs/EDITOR-PDF.md`.
- **Fuente Unicode** (`assets/fuente-unicode.ttf`) — sin ella se omiten los
  caracteres fuera de WinAnsi. Ver `assets/README.md`.
- **Pestaña de Gastos en la app** — el backend ya responde preguntas por
  WhatsApp y escribe la hoja; falta la pantalla nativa.
- **Proyectos** (`scan_documents.proyecto`) — la columna y el filtro
  existen, pero nada lo llena todavía: falta que el usuario pueda etiquetar
  un documento como parte de un proyecto.
- Refrescar el token de Google cuando expire (hoy se guarda tal cual).
- **Idioma:** solo es/en. Para agregar otro, añadir su clave a
  `services/i18n.js` y `app/src/i18n/textos.js` — lo que falte cae al
  español, así que una traducción parcial degrada en vez de romper.
- **Moneda:** la app no deja elegirla todavía; se usa la del usuario o
  `STRIPE_MONEDA`. El endpoint `PUT /api/cuenta/preferencias` ya la acepta.
- Recordatorios de vencimiento (plan Negocio) y multi-usuario.
- **Lote / múltiples documentos** (pedido 2026-08-13). Cuatro caras de una
  sola función: modo Individual/Lote en la cámara, botón **+** para
  agregar páginas, **mosaico previo** antes de mandar a Drive (con borrar
  del temporal) y **compartir** desde ahí. El mosaico es la pieza que las
  une: es el único punto donde el documento existe ANTES de irse a Drive.
  `components/VistaMosaico.js` ya existe (se usa en el editor) y ya trae
  compartir. OJO: no es solo UI — hoy `procesarDocumento` asume
  1 documento = 1 foto = 1 PDF; lote implica varias páginas por PDF, un
  temporal que sobrevive entre captura y subida, y decidir qué pasa si se
  cierra la app a medias.
- **Fotos del banco de fixtures: van 11 de 20** (una sintética). Ocho tomas
  reales del dispositivo: `granito-centrado`, `granito-de-lado`,
  `granito-vacio`, `escritorio-cuaderno`, `escritorio-lejos`,
  `escritorio-angulo`, `madera-libreta` y `madera-vacia` (ver abajo). Falta
  sobre todo **superficie oscura**, con documento y vacía. Sin la imagen
  original no se pueden fijar como prueba de regresión.
