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
- Pagos: **Stripe Checkout** (planes Personal/Negocio), cobro fuera de la app
  nativa para evitar la comisión de las tiendas. Multi-moneda (mxn/usd/eur)
  para poder salir a otros países sin tocar código.
- Idiomas: español e inglés, en la app y en el bot (`services/i18n.js` y
  `app/src/i18n/`). El idioma del usuario vive en `scan_users.idioma`.

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
credenciales con otra vertical).

## Estructura

- `server.js` — arranque, guardrail de identidad, montaje de rutas.
- `routes/webhook.js` — verificación + recepción de eventos de WhatsApp
  Cloud API (imagen, texto, botones). Aplica el límite del plan antes de
  procesar y atiende "quiero personal/negocio" mandando el link de pago.
- `routes/auth.js` — acceso por WhatsApp: pide el código y consulta si ya
  llegó el mensaje. Sin autenticación, a propósito: es el paso previo.
- `routes/cuenta.js` — perfil, consumo, preferencias y alta de pago.
- `routes/documentos.js` — lista, gastos del mes, borrado, escaneo desde
  la cámara, importación de archivos, páginas rasterizadas para el editor
  y horneado de anotaciones.
- `routes/drive.js` — inicio de OAuth, callback (guarda tokens y crea
  carpetas) y listado de carpetas para el explorador.
- `routes/pagos.js` — webhook de Stripe. **Verifica la firma** con
  `STRIPE_WEBHOOK_SECRET`; por eso `server.js` monta `express.raw` en esa
  ruta antes del parser JSON. Es idempotente ante reintentos.
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
  DB) que usan los tres caminos de entrada.
- `services/imagen.js` — detección de las esquinas del documento (Otsu +
  extremos) y corrección de perspectiva por mapeo inverso. Ver
  `docs/EDITOR-PDF.md`.
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
- `src/screens/EscanearScreen.js` — cámara de respaldo. Obligatoria por la
  guía 4.2 de Apple: la app no puede ser solo un puente a WhatsApp.
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
- `src/screens/RecorteScreen.js` — recorte con cuatro esquinas
  arrastrables, pre-colocadas por el detector del servidor. Toda foto de la
  cámara pasa por aquí antes de subirse.
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

**Variables de la app** (`app/.env.example`): `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_API_URL` (el backend
desplegado, nunca `localhost`: el teléfono de un tester no ve tu máquina).

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
para vender en otro país. Cobro por WhatsApp (link de Stripe Checkout),
nunca dentro de la app nativa. El webhook actualiza `scan_users.plan`; app
y bot solo lo consultan.

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

## Rama de trabajo

Rama activa: **`claude/new-session-9mhtdk`**. Desarrollar, commitear y
pushear ahí. No abrir PR salvo que se pida explícitamente.

## Estado / pendientes

Nada se ha probado todavía contra servicios reales — falta configurar el
número de WhatsApp Cloud API, el proyecto de Supabase, las credenciales de
Google OAuth y las de MercadoPago, y correr el flujo completo end-to-end.

Pendientes de código:

- **Mejora de imagen** ("modo documento": contraste, blanco y negro) — es
  lo que hace ver limpio un escaneo y no está.
- **Detector de bordes** más robusto: la heurística actual asume papel claro
  sobre fondo oscuro. Fuera de ese caso pide ajuste manual.
- **Editor**: falta arrastrar un elemento ya colocado y reemplazar texto de
  un PDF nativo en su sitio. Ver `docs/EDITOR-PDF.md`.
- **Migración pendiente en Supabase**: las columnas `mime_type`, `paginas`
  y `nombre_original` de `scan_documents` están al final de
  `scan_schema.sql` como `alter table` — hay que correrlas.
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
