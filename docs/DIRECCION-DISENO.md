# Dirección de diseño — TapptScan (benchmark CamScanner)

_Definido: 2026-08-10_

## Notas de estrategia de producto (2026-08-11, para considerar más adelante)

Ideas del usuario, sin acción todavía — capturadas tal cual para no
perderlas antes de la siguiente sesión.

**1. Comisión de las tiendas (App Store / Play Store) — aceptarla, no
evadirla.** Si le das a Apple/Google la oportunidad de cobrar (pagos
dentro de la app), cobran su comisión — pero a cambio tratan mejor a la
app (mejor posicionamiento, features, confianza del usuario). Evadirlo
(cobrar solo por fuera, como hoy con el link de WhatsApp) puede ahorrar
la comisión, pero si la app funciona bien y crece, "se van a dar cuenta"
— no es sostenible como estrategia de largo plazo. Postura propuesta:
tratar esa comisión como costo de negocio/marketing, no como algo que
evadir para siempre. Repensar la estrategia de pago (hoy: precios fuera
de la app por la guía 3.1.1) cuando el producto esté más maduro.

**2. Sincronización cross-dispositivo — Drive ya es la respuesta.**
Experiencia personal del usuario: CamScanner en iPhone funciona perfecto
con su nube propia, pero la misma cuenta en Android nunca sincronizaba
igual de bien. TapptScan ya resuelve esto de raíz al usar **Google
Drive del usuario** como la capa de sincronización (no una nube propia)
— confirmar que esto se sostiene bien en la práctica según vayamos
probando multi-dispositivo.

**3. La web tiene que ser de primer nivel, no un "también existe".**
La versión web de CamScanner es mala, y aun así mucha gente trabaja
desde web, no solo desde la app. TapptScan no se puede dar ese lujo:
**mismo look and feel entre web app y app nativa**, ambas de calidad
real — no una app cuidada y una web de segunda. Ya vamos en esa
dirección (mismo código con React Native Web, mismo theme), pero
mantenerlo como criterio explícito de aceptación al revisar cada
pantalla nueva.

**4. Activación cross-dispositivo por QR/token.** Si el usuario ya
inició sesión con WhatsApp en su iPhone y quiere la misma cuenta en un
Android o en la web de su compu, no debería repetir todo el flujo de
OTP por WhatsApp cada vez — un mecanismo tipo QR/token para "activar
este dispositivo con la sesión que ya tengo abierta en otro" (misma
familia de idea que la cámara continua celular↔web ya guardada abajo,
pero para *sesión completa*, no solo para la cámara). Evaluar si
conviene resolver ambas necesidades (emparejar cámara y emparejar
sesión) con el mismo mecanismo de token temporal + QR, en vez de dos
sistemas separados.

Brief de producto y diseño para el rediseño pantalla por pantalla de la
app, usando CamScanner como benchmark funcional. Es la referencia a seguir
en las próximas sesiones — no reinventar lo que ya está bien resuelto en
la industria, pero con identidad visual propia y el diferencial de
TapptScan intacto.

## Lectura estratégica

- CamScanner es el benchmark **funcional** principal — no reinventar sus
  flujos, que ya están probados a escala de industria.
- La identidad **visual** sí debe ser propia de TapptScan.
- El diferenciador de TapptScan **no** es "un scanner más bonito". Es:

  > WhatsApp como canal rápido de entrada + IA que analiza, clasifica,
  > nombra y guarda en el Google Drive del usuario.

## Pilares obligatorios del producto

1. Escaneo tipo CamScanner (detección viva, recorte, enderezado)
2. Edición de PDF fuerte
3. Firma y biblioteca de firmas
4. **Versionado del documento**: original / firmado / editado — nunca
   sobrescribir en silencio
5. Identidad TapptScan con verde protagonista

## Qué tomar de CamScanner, pantalla por pantalla

- **Splash**: sobriedad, contraste, marca centrada, rápida.
- **Home/Dashboard**: buscador arriba, grid de accesos rápidos, recientes
  abajo, navegación inferior fija, CTA de cámara al centro.
- **Cámara**: preview full screen, botón de captura dominante, cambio de
  modo (individual/lote) discreto. TapptScan mejora esto con detección
  viva del documento (ver estados abajo), no solo un marco fijo.
- **Visor de documento**: documento protagonista, barras oscuras,
  herramientas por contexto, pocas decisiones por pantalla.
- **Firma**: biblioteca de firmas reusables, inserción con drag/escala/
  rotación, gestión de firmas guardadas.

## Prompt maestro de dirección de producto

> Diseña TapptScan como una app móvil nativa de escaneo de documentos
> inspirada en los patrones UX más exitosos de CamScanner, sin reinventar
> flujos que ya funcionan extraordinariamente bien.
>
> La aplicación debe sentirse tan eficiente, clara y confiable como
> CamScanner en sus módulos principales de: cámara de escaneo, detección
> y recorte, visualización de documentos, edición PDF, firma y manejo de
> documentos.
>
> Sin embargo, TapptScan debe expresar una identidad visual propia,
> moderna, limpia y premium, usando como color central un verde de marca
> basado en `#18B875`, acompañado de neutrales oscuros, superficies
> sobrias y acentos brillantes.
>
> El producto no debe posicionarse como "otro scanner", sino como una
> evolución del scanner móvil con un diferencial muy claro: **TapptScan =
> escaneo probado + acceso rápido por WhatsApp + IA que analiza, clasifica,
> renombra y guarda en Google Drive del usuario.**
>
> La UX debe comunicar que existen dos puertas de entrada al mismo
> sistema:
>
> 1. **Desde la app**: abrir cámara → escanear → editar → firmar →
>    guardar/exportar.
> 2. **Desde WhatsApp**: enviar foto o PDF → TapptScan procesa con IA →
>    clasifica → asigna nombre inteligente → guarda en la carpeta correcta
>    del Drive del usuario → queda listo para revisión en la app.
>
> No diseñar solo "pantallas bonitas". Diseñar producto real con estados:
> vacío, cargando, error, éxito, sin conexión, sin permisos, procesamiento
> IA, documento guardado, documento firmado, sincronización con Drive.

## Identidad visual

Sensación general: tecnología útil, productividad, orden, precisión,
inteligencia, confianza, rapidez. Dark UI elegante, verde como color
héroe, iconografía outline uniforme, tipografía sans moderna.

### Colores (propuesta del brief — contrastar con `app/src/theme.js` antes de aplicar)

```
#18B875 — primary brand
#12A56A — primary pressed
#37D392 — primary light accent
#0F1720 — background deep
#151B24 — surface
#1D2430 — elevated surface
#2A3342 — borders/dividers
#F5F7FA — primary text on dark
#B6C0CC — secondary text
#7F8A98 — tertiary text
#22C55E — success
#F59E0B — warning
#EF4444 — error
#3B82F6 — info
```

> ✅ **Resuelto (2026-08-11):** el brief ejecutivo en PDF
> (`TapptScan_Brief_Ejecutivo_Producto_Diseno_Desarrollo.pdf`) confirma
> el fondo oscuro como "Dark background **principal**" — no es opcional.
> `app/src/theme.js` ya se migró a esta paleta.

### Tipografía

Inter / SF Pro / Plus Jakarta Sans / General Sans.

```
Display     32  semibold
H1          28  semibold
H2          24  semibold
H3          20  semibold
Title       18  medium
Body        16  regular
Body small  14  regular
Label       13  medium
Caption     12  regular
```

### Espaciado

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40`

### Radios

`8 · 12 · 16 · 20 · 24 · full pill`

### Sombras

Sobrias, suaves, oscuras, poca elevación — el efecto premium viene del
contraste y la composición, no de sombras pesadas.

## Prompts por pantalla

### 1 · Splash

Fondo oscuro profundo, logo centrado, patrón sutil de documentos casi
invisible de fondo, sin ruido visual, pulso discreto de carga. Estados:
carga normal, carga lenta, error de inicialización, sin conexión.

### 2 · Home / Dashboard

Header con saludo, buscador prominente, grid de accesos rápidos
(Escanear, Herramientas PDF, Importar imágenes, Importar archivos,
Documentos, Extraer texto, Identificaciones, Enviar por WhatsApp),
sección de recientes, bottom nav (Inicio · Documentos · Cámara ·
Herramientas · Yo).

Cada tarjeta de "recientes" muestra: miniatura, nombre inteligente,
fecha, páginas, tipo, estado de sincronización, etiqueta de IA
(Recibo/Contrato/ID/Factura/Oficio).

Módulo de diferenciador: "Escanea más rápido por WhatsApp" / "Conecta tu
Google Drive" / "IA organiza tus archivos automáticamente".

Estados: usuario nuevo/vacío, con recientes, sincronizando Drive, error
de conexión, sin archivos, procesamiento IA en curso.

### 3 · Cámara / Escaneo en vivo

Preview full screen, barra superior (cerrar, flash, calidad, ajustes,
más), overlay de detección en tiempo real, switch individual/lote, botón
de captura grande al centro.

**Tres estados de detección — el corazón de la mejora sobre lo que hay
hoy:**

- **Baja confianza**: marco tenue, contorno poco definido, color neutral
  o verde muy suave, hint "Alinea el documento".
- **Detección parcial**: algunas esquinas detectadas, líneas vivas
  intentando cerrar el polígono, feedback dinámico.
- **Alta confianza**: las 4 esquinas detectadas, polígono estable y
  brillante en verde TapptScan, mensaje "Listo para capturar", posible
  auto-captura.

Microinteracciones: flash breve al capturar, congelar preview un
instante, transición a resultado corregido, haptic feedback en captura
exitosa (nativo — no aplica en web).

Casos especiales: poca luz, reflejo, documento inclinado, múltiples
documentos, ningún documento detectado, permisos denegados.

Entrada secundaria clara: "Enviar por WhatsApp en lugar de escanear
aquí".

### 4 · Visor de documento

Header (back, nombre, acciones), documento paginado, indicador de
páginas, toolbar inferior (Editar PDF, Firmar, Anotaciones, Añadir
texto, Compartir, Extraer texto, Guardar en Drive, Procesar con IA).

Info contextual: tipo detectado, carpeta destino en Drive, última
modificación, si existe versión firmada/editada.

Estados: 1 página, multipágina, escaneado local, recibido por WhatsApp,
procesando OCR/IA, sin conexión, documento protegido/error.

### 5 · Editor PDF

Herramientas: anotaciones, subrayar, resaltar, texto, formas, insertar
imagen, ocultar/redactar, reordenar páginas, girar, recortar. El
documento ocupa la mayor parte de la pantalla; herramientas en barras
inferiores o modales contextuales, sin saturar.

**Regla clave: nunca sobrescribir en silencio.** Preguntar o manejar
versionado explícito: guardar como nueva versión / reemplazar versión
editada previa / mantener original intacto.

Estados: sin editar, edición activa, elemento seleccionado, guardando,
guardado, error al guardar.

### 6 · Firma / Biblioteca de firmas

Funciones: añadir firma nueva, guardar para uso futuro, ver biblioteca,
elegir firma guardada, insertar (mover/escalar/rotar/eliminar),
administrar firmas.

Layout: bottom sheet, pestañas Firma/Sello, miniaturas horizontales,
botón "Añadir" destacado, "Gestionar firmas".

Estados: sin firmas guardadas, una firma, varias, firma seleccionada,
insertada, biblioteca vacía, error al guardar.

### 7 · Colocación de firma

Documento visible con firma colocada encima, barra inferior contextual
(cambiar firmante, firma y sello, fecha, más, confirmar). Interacción:
drag & drop, pinch para escalar, rotación, snap sutil, CTA de confirmar
en verde.

**Regla crítica**: al confirmar, genera una **nueva versión** del
documento — el original sin firma se conserva.

### 8 · Menú "Más" / acciones secundarias

Hojas de acción (bottom sheet): gestionar firmas, eliminar, renombrar,
duplicar, guardar en otra carpeta, exportar, compartir, ver versiones.
Iconos outline consistentes, acciones destructivas en rojo, positivas en
verde.

## Diferencial TapptScan — dónde debe aparecer

WhatsApp + IA + Drive tienen que sentirse **parte central del sistema**,
no una ocurrencia externa. Presente en: onboarding, home/dashboard, visor
de documento, confirmación de guardado, detalles del archivo, centro de
actividad/procesamiento.

Mensajes sugeridos: "Escanea o mándalo por WhatsApp" · "IA lista para
organizar tu documento" · "Guardado en tu Drive" · "Clasificado
automáticamente" · "Nombre sugerido por IA" · "Original preservado,
versión firmada creada".

## Reglas de implementación / handoff

- Figma organizado por flujo, componentes reutilizables, variantes y
  estados, auto layout, tokens de color/texto.
- Exportables: SVG (iconos), PNG @1x/@2x/@3x, ícono de app 1024×1024,
  assets dark mode, estados vacío/loading/error/success.
- Componentes obligatorios: app bar, bottom nav, cards de recientes,
  grid de herramientas, action sheets, camera overlay, signature picker,
  document toolbar, page indicator, CTA buttons, chips de IA.
- Consistencia: iconografía outline uniforme, mismo grosor de trazo,
  mismo lenguaje de bordes/radios/sombras — no mezclar paquetes de
  íconos.
- Pensar en desarrollo real: iOS first pero adaptable a Android, safe
  areas, teclado, dark mode nativo, estados de permisos, offline,
  sincronización con Drive, procesamiento asíncrono de IA.

## Estado de esto en el código hoy (2026-08-11, para retomar)

- ✅ **Cámara — detección en vivo con 3 estados** (`EscanearScreen.js`):
  muestreo cada 1.4s contra `/api/documentos/detectar-bordes`, overlay
  tenue/blanco/verde según confianza, texto de estado, y si captura en
  "listo" pasa las esquinas directo a Recorte sin re-detectar.
- ✅ **Theme dark-first** (`app/src/theme.js`): migrado a la paleta del
  brief ejecutivo (`#0F1720` fondo, `#151B24` superficie, `#F5F7FA`
  texto, etc.). Los chips de categoría (`porSeccion`/`porTipo`/
  `porCategoriaGasto`) pasaron de pastel sólido a velo translúcido
  (`conAlfa(trazo, '20')`) sobre fondo oscuro, mismo trazo saturado de
  siempre. `app.json` y el manifest de PWA actualizados a juego
  (`userInterfaceStyle: dark`, splash y `theme-color` oscuros).
  **Pendiente de confirmar visualmente** — no hay forma de verlo
  renderizado desde este entorno, solo se auditó que ningún color de
  texto/fondo esté escrito a mano fuera de los tokens (sí lo está en
  páginas de documento/firma/cámara, que correctamente siguen blancas
  siempre — representan papel o son controles de cámara, no la app).
- `services/imagen.js` sigue con un solo intento por foto en el
  servidor (Otsu + homografía) — la detección "en vivo" de arriba es
  aparte, corre en el cliente contra el mismo endpoint, por muestreo.
- El editor (`EditorScreen.js`) hoy anota sobre el documento pero no
  tiene recorte/reordenar páginas ni el versionado explícito
  (original/editado/firmado) que pide el brief — sigue siendo la
  brecha más grande contra el pilar #4.
- Pendiente sin relación al diseño: el número de WhatsApp
  (`+52 1 56 4417 0712`) sigue registrado en **dos** WABAs de Meta a la
  vez (`Tappt` y `TapptScan`) — la migración no lo soltó de la vieja, y
  mensajes reales pueden estar cayendo en la lógica de agenda en vez de
  TapptScan. Confirmar y quitarlo de la WABA `Tappt`.

## Idea guardada para después del rediseño: cámara continua (celular ↔ web)

Propuesta del usuario (2026-08-11): cuando alguien usa la web app en
computadora y toca "Escanear con cámara", en vez de pedir la cámara
(mala) de la laptop, mostrar un **QR de emparejamiento temporal**. Se
escanea con la cámara normal del celular (sin abrir ninguna app), abre
una páginita web ligera ya autenticada por ese token de un solo uso,
usa ahí la cámara real del teléfono (misma detección en vivo que ya
existe), y el documento aparece en la sesión de escritorio casi al
instante para seguir organizando/editando/firmando en pantalla grande
— justo el caso de quien lleva las finanzas del negocio y necesita ver
bien las cifras, pero la cámara de la laptop no sirve para documentos.

Es una pieza de arquitectura nueva, no un ajuste de pantalla: tokens de
emparejamiento temporales, una ruta pública ligera para el celular, y
sincronización en tiempo real (WebSocket o polling) entre las dos
sesiones. Explícitamente **para después de terminar el rediseño
completo** — no priorizarlo antes sin que el usuario lo pida.

## Estado — segunda pasada, misma noche (2026-08-11, tarde)

Confirmado con el usuario que el dark theme se ve bien (capturas reales
del Dashboard). Seguido sin parar por:

- ✅ **Dashboard**: buscador (navega a Documentos), sección "Recientes"
  con chip de tipo, 3 colores fijos del tema claro corregidos (chip de
  WhatsApp, chip de Drive, texto del banner de upgrade).
- ✅ **Visor de documento**: bug real encontrado y arreglado (mostraba
  el *nombre* del ícono como texto gigante, `meta.color` no existía).
  Badge "Clasificado por IA como {tipo}" más visible, botón Compartir
  (Web Share API / Share nativo), menú "Más" con Eliminar conectado de
  verdad (el endpoint ya existía, nada lo llamaba).
- ✅ **Firma**: color (azul default) + grosor ajustables en FirmaPad
  (nativo y web) sin agregar dependencia de slider. **Nueva
  capacidad**: importar una firma de una foto — `services/imagen.js
  extraerFirma()` separa tinta/papel con Otsu, recorta al contorno,
  tiñe del color elegido, fondo transparente. Probado con imagen
  sintética (firma real + papel en blanco de control, rechazado
  correctamente).
- ✅ **Biblioteca de firmas** (brief prompt 6, "must-have"): tabla
  `scan_firmas` nueva (⚠️ **migración corrida por el usuario**, no
  pendiente), endpoints `/api/firmas`, `HojaFirmas` — elegir guardada,
  dibujar nueva o importar de foto; toda firma nueva se autoguarda.
- ✅ **Splash** (brief prompt 1): wordmark con pulso discreto en vez del
  spinner suelto de antes. `StatusBar` de `dark` a `light` (quedó del
  tema claro, invisible sobre fondo oscuro).
- ✅ **Menú "Más" genérico** (`HojaAcciones`, brief sección 8):
  reutilizable para cualquier pantalla, primer uso en Documento.

**Todo esto sigue sin confirmación visual del usuario** (solo el
Dashboard se vio con capturas reales) — es la tanda más grande de
cambios sin verificar de toda la sesión. Antes de seguir construyendo
encima (especialmente el versionado, que toca todo lo demás), conviene
que el usuario abra la app y navegue cámara → recorte → documento →
editor → firma de punta a punta.

## Siguiente paso

1. **🐛 Bug abierto — 502 al abrir "Editar y firmar" en móvil.** Mitigado
   2026-08-11 noche sin poder confirmar la causa exacta (no hubo acceso
   a Deploy Logs de Railway): se agregaron handlers `unhandledRejection`
   / `uncaughtException` a nivel de proceso en `server.js` — antes, una
   promesa sin capturar en cualquier request (sospecha: `pdf.renderizarPagina()`
   con `@napi-rs/canvas`) podía tumbar el proceso entero, y eso es lo que
   Railway mostraba como 502 intermitente. Ahora se loguea en vez de
   tumbar el servidor. Si vuelve a aparecer, revisar logs — ya quedan
   con el id del documento (`routes/documentos.js`).
2. **✅ Versionado original/editado/firmado** del editor — hecho
   2026-08-11 noche. Tabla nueva `scan_versiones` (documento_id,
   nombre_archivo, drive_file_id, drive_link, created_at); cada guardado
   en `POST /:id/editar` inserta una fila ahí, sin tocar el original.
   `DocumentoScreen` muestra el historial con acceso directo a cada
   versión en Drive, y se refresca solo al volver del editor
   (`useFocusEffect`). **Pendiente del usuario:** correr el SQL de
   `scan_versiones` en Supabase (ver `scan_schema.sql`) — sin eso el
   guardado en el editor sigue funcionando pero el historial no
   aparecerá.
3. Pendiente sin relación al diseño: el número de WhatsApp
   (`+52 1 56 4417 0712`) seguía registrado en dos WABAs de Meta a la
   vez la última vez que se confirmó — el login por WhatsApp falla al
   azar mientras no se quite de la WABA `Tappt` (la vieja) desde la Mac
   del usuario. Confirmado 2026-08-11: el login funcionó una vez y
   falló (expiró) otra, consistente con mensajes cayendo a veces en el
   webhook equivocado.
4. Idea guardada para **después** del rediseño completo: cámara
   continua celular↔web por QR (ver sección arriba).
