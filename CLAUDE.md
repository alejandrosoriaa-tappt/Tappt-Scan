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
(`services/taxonomia.js`, 41 carpetas) para que el usuario lo vea listo
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
### Nivel de persona en la ruta (2026-08-27)

Algunos documentos son **de alguien** —la colegiatura de un hijo, el estudio
médico de un familiar— y agruparlos por categoría los desparrama: las boletas
de Patricio por un lado, sus colegiaturas por otro. Por eso las secciones
marcadas `porPersona: true` en `taxonomia.js` (hoy solo **Educación**) llevan
un nivel extra con el nombre, **arriba de la subcarpeta**:

```
08 · Educación / Patricio Soria / Colegiaturas y pagos / Colegio Alemán / 2026
08 · Educación / Patricio Soria / Boletas y certificados / SEP / 2026
                └── todo lo del mismo hijo vive junto
```

Es un nivel **dinámico**, igual que el emisor y el año: no hay ningún nombre
escrito en el código —ni el de un hijo real en el repo— lo llena el
clasificador con lo que diga el documento o la corrección del usuario por
WhatsApp ("es de mi hijo Patricio Soria"). Para sumar otra sección basta
marcarle `porPersona: true`; Salud es la candidata obvia.

Si no se sabe de quién es, **el nivel se omite** en vez de inventar un
nombre: `filter(Boolean)` en `naming.rutaPara`. Y `usaPersona()` limita el
nivel a esas secciones, así que un recibo de CFE con `persona` no la usa.

Columna `scan_documents.persona` (migración al final de `scan_schema.sql`).
Los documentos ya archivados se quedan en null: no se reclasifica hacia atrás.

- `services/naming.js` — convierte el JSON extraído en la ruta
  (`sección/subcarpeta/emisor/año`, o `sección/persona/subcarpeta/emisor/año`
  en las secciones marcadas `porPersona` — ver abajo) y el nombre
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

**Validada en el dispositivo el mismo día**, en el escenario donde más podía
fallar. El riesgo que se introdujo con la puerta era un falso negativo sobre
**fondo oscuro**: que la máscara se apagara por falta de contraste y no por
falta de papel, borrando el contorno de un documento real. Se midió el par:

```
tapete negro VACÍO     areaGt05    2   meanProb 0.0021   → MASCARA_SIN_DOCUMENTO ✅
tapete negro CON doc   areaGt05  239   meanProb 0.059    → la puerta NO dispara ✅
```

**120× de separación en la misma superficie oscura.** El JSON del vacío trae
`razon: "MASCARA_SIN_DOCUMENTO"` — la puerta actuando en producción. Y con
tres vacíos en tres superficies distintas (clara 11, media 0, oscura 2), ya
no depende del tipo de fondo:

```
granito-vacio   11   ·  madera-vacia   0   ·  oscuro-vacio   2
                    ────────────────────────
mínimo CON documento: 82
```

### `oscuro-documento` (2026-08-18) — cierra el escenario 9, cuarta superficie con el mismo patrón

Entró la contraparte de `oscuro-vacio`: el mismo tapete de fibra de carbono,
ahora con dos hojas encima (una con texto arriba, una en blanco debajo,
traslapadas un poco). El ground truth es la hoja en blanco —la que detectó
el dispositivo—, trazado a mano sobre su contorno visible y verificado
dibujándolo encima (`scanner/fixtures/manifest.js`).

```
oscuro-documento   IoU=0.996  confiable=false  acuerdo=0.664
   docquad: IoU=0.996  z=[3.26, 3.67, 3.47, 2.83]  LOW_PEAK_MARGIN
   opencv:  SIN_ACUERDO_ENTRE_DETECTORES
   mask:    areaGt05=239  meanProb=0.059  ← sana, muy arriba del umbral (40 / 0.012)
```

Dos cosas confirmadas:

1. **La puerta de máscara no se dispara en falso.** Es justo el par que se
   necesitaba: `oscuro-vacio` (areaGt05=2) vs. `oscuro-documento`
   (areaGt05=239) — 120× de separación en la misma superficie, con
   documento real de por medio, no solo medido en teoría.
2. **Es la CUARTA superficie con el caso abierto de siempre**: DocQuad
   acierta (IoU 0.996, prácticamente perfecto) y el compuesto lo degrada a
   parcial porque OpenCV no está de acuerdo (0.664). Mismo patrón que
   granito centrado, granito de lado y madera — ya son cuatro superficies
   distintas donde el que falla es OpenCV, no DocQuad.

Corrido en el banco (`npm run scanner:fixtures`) sin tocar el detector:
**cero regresión**, los 12 fixtures anteriores conservan IoU y estado
idénticos. `oscuro-documento` entra como caso abierto (no tumba CI).

### `oscuro-libreta` (2026-08-18) — el par completo: mismo fondo, caso normal

Llegó también el JSON que le faltaba a la foto de la libreta sobre el mismo
tapete oscuro (se había capturado antes que `oscuro-documento`, en la misma
sesión de fotos, pero el JSON se traspapeló). A diferencia de
`oscuro-documento`, aquí **los dos detectores concuerdan** (acuerdo 0.982) y
el resultado es `confiable: true` — el caso ordinario que sí funciona.

```
oscuro-libreta   IoU=0.999  confiable=true  acuerdo=0.982
   docquad: IoU=0.981  z=[3.54, 3.13, 2.83, 3.15]  LOW_PEAK_MARGIN (igual descartado, pero coincide con OpenCV)
   opencv:  opencv-paper, sin discrepancia
   mask:    areaGt05=928  meanProb=0.225  ← la más alta del banco
```

Con `oscuro-documento` y `oscuro-libreta` ya hay, en la MISMA superficie
oscura, el par completo: vacío (puerta se apaga), documento con desacuerdo
(caso abierto, degrada a parcial) y documento con acuerdo (caso normal,
confiable). Es la primera superficie del banco con los tres estados
cubiertos a la vez. Cero regresión en el resto del banco.

### `granito-tapete` (2026-08-19) — quinta superficie con el mismo patrón

Documento de una página completa (trámite gob.mx) sobre un tapete gris,
encima de otra encimera de granito claro con vetas. Escena nueva de
granito, distinta de `granito-centrado`/`granito-de-lado` (esas no tenían
tapete debajo).

```
granito-tapete   IoU=0.999  confiable=false  acuerdo=0.440
   docquad: IoU=0.999  z=[3.50, 3.66, 3.08, 2.88]  LOW_PEAK_MARGIN
   opencv:  area=0.704  ← se traga tapete + encimera, casi el doble de DocQuad (0.338)
   mask:    areaGt05=1020  meanProb=0.249  ← sana, consistente con el resto del banco
```

Es la QUINTA superficie —después de granito centrado, granito de lado,
madera y `oscuro-documento`— donde pasa exactamente lo mismo: el quad de
DocQuad calza casi perfecto (verificado dibujándolo encima) y el compuesto
lo degrada a parcial porque OpenCV se traga una superficie más grande que
el papel. Con cinco superficies distintas mostrando el mismo patrón, la
evidencia para revisar la regla del compuesto (confiar en DocQuad cuando su
única objeción es `LOW_PEAK_MARGIN` y la máscara está sana) sigue creciendo
— pero, como con el 5σ, no se toca sin medir primero contra el banco
completo. Cero regresión en el resto del banco (`npm run scanner:fixtures`).

### Franja borrosa en un borde del frame (2026-08-19) — fusión de sensores en 0.5x, no el lente

En dos fixtures reales (`granito-tapete` y su par sin registrar de la misma
sesión) apareció una franja borrosa vertical pegada al borde izquierdo,
corriendo todo el alto del frame, idéntica en posición en ambas tomas. El
usuario descartó el lente físico (probó con otra app y no aparece). Revisado
el código de captura (`CamaraDoc.web.js`), `capturar()` solo hace un
`drawImage` directo del frame de video a un canvas — no hay recorte ni
composición ahí que pudiera meter una franja así. El problema viene del
stream de cámara, antes de que la app lo toque.

Hipótesis: `abrirStreamMasAbierto()` forzaba el zoom al **mínimo físico
exacto** del track (`caps.zoom.min`, 0.5x en iPhone) vía `applyConstraints`.
Ese 0.5x exacto es la frontera donde iOS funde el sensor ultra angular con
el principal ("seamless zoom"); el sensor ultra angular está desplazado
físicamente del principal, así que un error de paralaje en esa fusión cae
consistentemente hacia un borde — no al azar, y no del lado que cambiaría
si fuera un dedo tapando el lente. Que no aparezca en otra app cuadra: si
esa app no fuerza el 0.5x físico exacto, nunca entra a esa frontera, o usa
la corrección propietaria de Apple que Safari/WebRTC no expone igual.

**Cambio (sin validar en dispositivo todavía):** `ZOOM_PREFERIDO = 0.6` en
`abrirStreamMasAbierto()` — pide un zoom un poco arriba del mínimo físico
(clampado entre `caps.zoom.min` y `caps.zoom.max`) en vez del mínimo exacto.
De paso acerca el encuadre al de CamScanner, que hoy se ve más cerrado
(más zoom) que el nuestro. **Falta la prueba real**: confirmar que la
franja desaparece y que el campo visual sigue sintiéndose abierto. Si
0.6x no alcanza a evitar la frontera de fusión, subir un poco más, pero
medido con una toma nueva — no a ojo.

**Primera señal, sin confirmar todavía:** la siguiente toma real que llegó
después del cambio (`poca-luz`, ver abajo) no muestra la franja. Una sola
toma no prueba nada —la escena también cambió (otro cuarto, otra luz)— pero
es consistente con que el ajuste esté funcionando.

### 🔴 ABIERTO (2026-08-20) — la hipótesis del zoom probablemente era la equivocada

**El problema NO está resuelto y el diagnóstico de arriba está en duda.** El
usuario siguió reportando imagen suave/borrosa después del cambio a 0.6x, en
tomas nuevas (`152511175Z`, `153619182Z`) y contra una comparativa de
CamScanner sobre la MISMA libreta donde CamScanner conserva claramente más
microdetalle en el texto a lápiz.

**Dos errores de método de esta sesión, anotados para no repetirlos:**

1. **Se midió nitidez sobre el frame de 640px del detector.** Ese frame está
   reducido a propósito (`ANCHO_DETECCION = 640`) — es la entrada del
   detector, no la foto que se guarda. Medir nitidez ahí no dice nada sobre
   la calidad real de captura. Hay que separar **tres** cosas y medirlas por
   separado: (a) preview, (b) fixture 640 del detector, (c) **captura final
   full-res**, que es la única que no puede salir borrosa.
2. **Se aceptó "no veo la franja" como evidencia de arreglo.** Varianza de
   Laplaciano por franjas sobre un frame downscaled no separa el caso; las
   tres tomas "sin franja" no prueban nada.

**Sospechoso mucho más fuerte (análisis externo, ChatGPT, 2026-08-20):** la
regresión no es el zoom sino **la selección de cámara ultra angular** que se
introdujo el 2026-08-12 al pasar de `expo-camera` a `getUserMedia`.
`puntuarAngular()` en `CamaraDoc.web.js` da **+100** a cualquier device cuyo
label diga `ultra-wide`/`0.5`/`wide angle`, y `abrirStreamMasAbierto()`
**sustituye el stream inicial por ese sin verificar nada**:

```js
const segundo = await navigator.mediaDevices.getUserMedia(c);
inicial.getTracks().forEach((t) => t.stop());
elegido = segundo;   // ← no se comprueba qué resolución entregó de verdad
```

Dos agujeros ahí:

- **La ultra-wide del iPhone es un sensor peor** (más chico, óptica más
  suave), sobre todo con luz de interior. Estamos cambiando calidad por
  campo visual y asumiendo que "más angular = mejor".
- **`BASE_VIDEO` pide 4032×3024 como `ideal`, no `exact`.** `ideal` significa
  "lo más parecido que puedas": el navegador puede negociar bastante menos y
  nosotros lo aceptamos igual. No hay quality/resolution gate.

CamScanner probablemente NO usa la ultra-wide física continuamente para su
encuadre abierto — es un supuesto nuestro, nunca verificado.

**Probabilidades del análisis externo** (de mayor a menor): selección de
ultra-wide sacrificando calidad · resolución negociada por debajo de lo
pedido sin gate · autofocus/exposure sin estabilizar al capturar · JPEG 0.92
(poco probable por sí solo) · DocQuad/OpenCV (**descartado**: el frame ya
llega degradado al detector).

**Lo que falta y por qué se paró aquí:** el fixture JSON de hoy trae
diagnóstico del DETECTOR, no de la CÁMARA, así que no se puede confirmar
nada. `CamaraDoc.web.js` ya expone `diagnostico()` con `track.getSettings()`,
`getCapabilities()`, `label`, `videoWidth/videoHeight` — pero eso **no se
está guardando en el fixture**, que es exactamente el dato que haría falta.

**Siguiente paso acordado — prueba A/B, sin tocar DocQuad/OpenCV:**

- **A** — cámara actual: selección automática ultra-wide + zoom forzado.
- **B** — cámara principal: `facingMode: environment`, sin selección
  explícita de angular y **sin tocar zoom**.

Mismo teléfono, misma libreta, misma distancia y luz. Registrar en ambas:
`label | videoWidth×videoHeight | track settings width×height | zoom |
fixture JPEG | captura final JPEG`, y comparar **fixture y captura full-res
por separado**. Si B recupera la nitidez, la regresión es la selección de
ultra-wide.

Después, la política correcta no es renunciar al encuadre abierto sino
**priorizar la cámara principal y usar la ultra angular solo cuando de
verdad entrega resolución/calidad suficiente** — con un gate antes de
sustituir el stream inicial, nunca por lo que diga el label.

Decisión de producto del usuario: **prefiere perder algo de zoom-out antes
que escanear borroso.**

### `poca-luz` (2026-08-19) — cierra el escenario 8, y de paso blanco sobre blanco

Documento sobre la tapa de un excusado, baño con luz muy baja (brillo medio
~53/255). Doble dificultad: poca luz Y blanco sobre blanco —el borde entre
papel y tapa casi no tiene contraste—, la combinación más dura del banco
hasta ahora.

```
poca-luz   IoU=0.953  confiable=false  acuerdo=0.450
   docquad: chosenSource=MASK (esquinas descartadas con penalty ~2000000)
   opencv:  area=0.434 vs. 0.207 de DocQuad — discrepancia fuerte
   mask:    areaGt05=468  meanProb=0.113
```

Ground truth anotado a mano con realce gamma (0.4) sobre la imagen original
—a simple vista el borde es invisible— y verificado dibujándolo encima: el
quad crudo de DocQuad tenía el borde superior ~2% más arriba de donde
realmente está el papel (el margen en blanco sobre el título se leyó como
parte de la tapa). El resto de los bordes sí coincidía. Por esa
incertidumbre extra en la propia anotación, este fixture usa `minIoU: 0.75`
en vez del 0.85 del resto del banco.

**El rechazo a confiable es correcto.** DocQuad descarta sus propias
esquinas (penalty extremo) y cae a la máscara; OpenCV da un área más del
doble que DocQuad. Ninguno de los dos tiene evidencia sólida en esta
escena, y el compuesto responde bien: no inventa confianza que no existe.
Corrido en el banco: cero regresión (8/16 OK).

### Comparación con CamScanner (2026-08-18) — la brecha es LATENCIA, no puntería

Se revisaron capturas de CamScanner en vivo sobre la misma libreta. Primera
lectura: "acierta 2 de 5". **Corrección del usuario: eran fotogramas de
tránsito** —movía la cámara rápido a propósito— y CamScanner converge
rapidísimo después de cada movimiento. La lectura correcta es que no es más
preciso que nosotros; es incomparablemente más **rápido**.

```
                  TapptScan hoy        CamScanner
dónde corre       servidor (red)       en el teléfono
ciclo             ~300-560 ms          ~33 ms (30fps)
inferencia sola   79-157 ms            —
al mover          se queda atrás       sigue continuo
```

Un orden de magnitud. Eso es exactamente lo que ya estaba en el plan como
**pasos 3 y 6** (DocQuad en navegador + OneEuro/Worker), y confirma que son
los que faltan, no más ajuste de umbrales.

### 🔴 La cámara SIEMPRE pasa por Recorte — y eso invalida un argumento

Hallazgo al revisar el flujo: `capturar()` en `EscanearScreen` **siempre**
navega a `Recorte`. Desde la cámara nunca se recorta solo.

Consecuencia directa: la regla escrita arriba —*"un verde equivocado es peor
que un blanco correcto: el blanco pide ajuste, el verde recorta"*— **es
falsa para el camino de cámara**. Ahí nadie recorta solo; la red de
seguridad ya existe. Solo aplica al camino de **WhatsApp**, donde
`procesarDocumento` sí corrige perspectiva sin preguntar
(`if (confiable && esquinas?.length === 4 …)`).

Y hay un costo real por no haberlo notado:

```js
// RecorteScreen.js
const [esquinas, setEsquinas] = useState(esquinasIniciales || MARCO_COMPLETO);
// EscanearScreen.js — solo pasa si estado === 'listo'
esquinasIniciales: deteccion.estado === 'listo' ? deteccion.esquinas : null,
```

Cuando el contorno sale blanco **se tira el quad** y el usuario recibe un
marco de cuadro completo para arrastrar las cuatro esquinas desde cero. En
`madera-libreta` eso significa desechar una detección de **IoU 0.935**.
CamScanner enseña su quad —a veces peor— y el usuario lo ajusta tantito.

Lo correcto es **separar las dos decisiones**:

- **Cámara:** dibujar siempre el mejor quad disponible (verde con relleno) y
  pasarlo a `Recorte` como punto de partida, aunque sea parcial.
- **WhatsApp:** `confiable` sigue estricto, porque ahí sí actúa solo.

La puerta de máscara es lo que hace seguro el "siempre dibujar": sobre mesa
vacía ya no inventa nada.

### ✅ RESUELTO (2026-08-19) — el quad parcial ya no se tira

Implementado en dos puntos, no solo uno — `EscanearScreen` pasaba `null` si
no era `'listo'`, pero **`RecorteScreen` también tiraba el quad por su
cuenta** al terminar su propia redetección full-res si no salía confiable
(`resultado.confiable ? resultado.esquinas : MARCO_COMPLETO`), así que
arreglar solo el primero no habría bastado.

```js
// EscanearScreen.js — antes: null salvo 'listo'
esquinasIniciales: deteccion.estado !== 'buscando' ? deteccion.esquinas : null,
// RecorteScreen.js — antes: MARCO_COMPLETO si !confiable
setEsquinas(resultado.esquinas || MARCO_COMPLETO);
```

La razón original de tirar el quad no confiable en `RecorteScreen` estaba
documentada y era real: un caso donde una región chica y equivocada
(~335×410px sobre una foto de ~1300×1900px) dejaba el documento borroso si
el usuario guardaba sin ajustar. Pero esa protección ya no depende de
esconder el quad — depende del aviso (`ajustaAMano`) más el botón **"Toda
la foto"**, que resetea a `MARCO_COMPLETO` en un toque. Con eso, mostrar el
mejor candidato disponible es estrictamente mejor: en los cuatro casos
abiertos con IoU 0.89-0.999 (`granito-tapete`, `oscuro-documento`,
`madera-libreta`, `granito-de-lado`) el usuario ahora ajusta un quad casi
perfecto en vez de dibujar las 4 esquinas desde cero.

Motivado por un research addendum externo (`TapptScan_Research_Addendum_
Claude_20260819.pdf`, compartido por el usuario) que revisó FairScan,
MakeACopy y otros scanners open source y llegó a la misma conclusión de
forma independiente: *"if detection is imperfect in camera mode, the best
quad is preserved into RecorteScreen rather than discarded"* — coincide con
lo que ya estaba escrito arriba, y confirma que no hace falta reemplazar el
detector, solo terminar de conectar lo que ya existe. WhatsApp no se tocó:
`confiable` sigue estricto ahí, porque actúa sin que nadie mire.

### Scanners open source revisados (2026-08-18)

| Proyecto | Licencia | Detección | Qué aporta |
|---|---|---|---|
| **FairScan** | **GPLv3** ⚠️ | Segmentación propia (DeepLabV3+ / MobileNetV2, Dice > 0.94) con **LiteRT en el teléfono** | La arquitectura a imitar |
| **MakeACopy** | Apache 2.0 | OpenCV **+ modelo ONNX propio** (UVDoc, SmartDoc, CORD) | De aquí sale nuestro DocQuad |
| OSS-DocumentScanner | — | OpenCV / C++ nativo | Filtros, menos relevante al detector |
| OpenScan | BSD-3 | Flutter, enfoque clásico | UX/PDF; no basar el detector aquí |

**Cuidado legal:** FairScan es **GPLv3** y este repo es propietario
(`UNLICENSED`). Se puede estudiar su arquitectura y sus ideas; **no** copiar
código. MakeACopy es Apache 2.0 —incluido su modelo ONNX, el que ya
usamos— así que ahí sí se puede reutilizar con atribución.

### Dirección propuesta: la MÁSCARA como fuente primaria de geometría

Lo que hacen los scanners modernos, y lo que la evidencia de este banco ya
está señalando por su cuenta:

```
segmentación → máscara → morfología → componente conexa → casco convexo
  → simplificar a 4 lados → score geométrico → (comparar OpenCV)
  → estabilidad temporal → perspectiva
```

En vez de: `Canny → buscar polígono → ¿parece papel?`

Hoy usamos la máscara solo como **señal de veto** (la puerta de arriba) y
seguimos tomando la geometría de las cuatro esquinas de DocQuad o de
OpenCV. La propuesta es que la máscara **produzca** el contorno.

Dos razones de peso, y la segunda es la que convence:

1. Ataca justo los casos abiertos —documento chico, lejano, en ángulo—
   donde los bordes son débiles pero la mancha de papel sigue siendo clara.
2. **Ya está probado en este repo.** El ground truth de `granito-de-lado`,
   `escritorio-angulo` y `madera-libreta` se anotó exactamente con ese
   pipeline (componente conexa → casco → cuadrilátero de área máxima),
   sobre píxeles RGB, y dio contornos correctos en todos. Aplicarlo sobre
   la máscara del modelo —que ya distingue papel de mesa— debería ser
   mejor, no peor.

Ojo con lo que NO cambia: la máscara de DocQuad es de 256×256, así que da
un contorno grueso. Sirve para *encontrar* el documento; el refinamiento
fino de esquinas sigue necesitando el otro camino.

### Lectura estratégica (2026-08-18): CamScanner también se mueve a organizar

CamScanner está empujando hacia unificar escaneo + PDF + OCR + QR en un
flujo de trabajo documental. O sea: **el escaneo se está volviendo commodity
y la pelea real se muda a la organización**, que es exactamente donde
TapptScan ya tiene ventaja (clasificación con IA, taxonomía, archivo en el
Drive del propio cliente).

Consecuencia para el orden de trabajo, y es un cambio de énfasis:

- **La organización va bien** — es el diferenciador y ya funciona.
- **El escaneo es lo que nos frena**, y encima es donde el competidor está
  más maduro. Es deuda que hay que pagar rápido, no pulir indefinidamente.
- **La entrada por WhatsApp sigue siendo el foso**: cero instalación, cero
  capacitación. Ninguno de los scanners revisados —ni CamScanner ni los
  open source— tiene nada parecido.

Traducido a prioridades: cerrar la experiencia de captura al nivel del
benchmark **cuanto antes**, sin abrir frentes nuevos, y volver a invertir
en organización una vez que escanear se sienta bien.

Nota: en `madera-vacia` **OpenCV acierta** (`NO_QUAD`, no devuelve nada) y
el que inventa es DocQuad (área 0.121). Es el espejo exacto del caso de
granito — cada detector falla en el escenario donde el otro acierta, y por
eso el acuerdo entre ambos sigue siendo mejor evidencia que cualquiera por
separado.

### 🔴 SIGUIENTE PASO (2026-08-20) — la regresión de NITIDEZ va primero

Antes que cualquier fixture o ajuste del detector: **la prueba A/B de cámara
en `CamaraDoc.web.js`** descrita arriba ("la hipótesis del zoom probablemente
era la equivocada"). Un scanner que entrega imagen suave no se arregla
midiendo IoU — el frame ya llega degradado al detector.

Orden concreto para quien retome:

1. Guardar el diagnóstico de CÁMARA en el fixture (`diagnostico()` ya existe
   en `CamaraDoc.web.js`, pero no se está escribiendo al JSON). Sin eso no
   se puede confirmar nada.
2. A/B ultra-wide vs. cámara principal, comparando **captura full-res**, no
   el frame de 640 del detector.
3. Según el resultado: quality/resolution gate antes de sustituir el stream
   inicial, en vez de confiar en el label del device.

No tocar DocQuad/OpenCV ni sus umbrales mientras tanto.

### Fixtures pendientes (en pausa hasta cerrar lo de arriba)

**Las tomas que faltan del banco de fixtures.** Es lo que falta para poder
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
1.6  scanner-fixtures (20 + ground truth)  banco y metrica IoU listos; van 16/20 fotos
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
- **Fotos del banco de fixtures: van 16 de 20** (una sintética). Trece tomas
  reales del dispositivo: `granito-centrado`, `granito-de-lado`,
  `granito-vacio`, `escritorio-cuaderno`, `escritorio-lejos`,
  `escritorio-angulo`, `madera-libreta`, `madera-vacia`, `oscuro-vacio`,
  `oscuro-documento`, `oscuro-libreta`, `granito-tapete` y `poca-luz` (ver
  arriba). Escenario 9 (superficie oscura) ya cerrado, vacía y con
  documento, con los tres estados del compuesto cubiertos en la misma
  superficie. Escenario 8 (poca luz) también cerrado. El caso abierto de
  superficie clara (DocQuad acierta, OpenCV falla) ya tiene CINCO
  superficies midiéndolo. Falta: documento cortado por el borde (#7) y dos
  hojas de verdad encimadas (#10) — ver `scanner/fixtures/fotos/README.md`
  para el checklist completo.
