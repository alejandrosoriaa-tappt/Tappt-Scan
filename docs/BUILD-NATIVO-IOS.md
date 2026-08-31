# Build nativo de iOS — de este repo a TestFlight

_Última actualización: 2026-08-31_

Esta guía cubre **solo iOS nativo**: qué falta hoy en el repo, en qué orden
se resuelve, y qué comandos se corren. Para la web app, Expo Go y Android
ver `docs/DISTRIBUCION.md`; para el porqué del cobro por tienda ver
`docs/DIRECCION-DISENO.md` (decisión 2026-08-12).

## Lo primero: Expo Go ya NO alcanza

`app/package.json` trae **`react-native-iap`**, que es un módulo nativo y
**no viene dentro de Expo Go**. Cualquier pantalla que lo toque
(`AjustesScreen` → `compras.native.js`) revienta ahí. `docs/DISTRIBUCION.md`
nivel 1 se escribió antes de esa dependencia y ya no aplica al 100%.

Consecuencia práctica: para probar la app en un iPhone hay **dos** caminos,
y hay que saber cuál se está usando.

| | Qué es | Sirve para | No sirve para |
|---|---|---|---|
| **Expo Go** | app contenedora de Expo | cámara, recorte, editor, firmas, importación, idioma | IAP (crashea), ícono/nombre reales, rendimiento real |
| **Development build** | app propia con dev-client, compilada por EAS | todo lo anterior **+ IAP en sandbox**, con recarga en vivo | publicar |
| **Build de producción** | .ipa firmado | TestFlight y App Store | iterar rápido |

El repo está **managed** (no hay carpetas `ios/` ni `android/`): el proyecto
nativo lo genera `expo prebuild` dentro de EAS en cada build. No versionar
`ios/` — todo lo nativo se declara en `app/app.json`.

## Estado real hoy — lo que falta antes del primer build

Verificado contra el repo en esta rama. Nada de esto está hecho:

1. **No hay `extra.eas.projectId` en `app.json`.** Lo crea
   `eas build:configure` la primera vez (requiere `npx expo login`).
2. **No existe `expo-dev-client` en las dependencias**, así que el perfil
   `development` de `eas.json` no produce todavía una app con recarga en
   vivo. Se instala con `npx expo install expo-dev-client`.
3. **El perfil `production` de `eas.json` no tiene bloque `ios`** — solo
   Android (`app-bundle`). Para iOS basta con que exista el perfil, pero
   conviene dejarlo explícito.
4. **`submit.production` está vacío.** Para `eas submit` hacen falta
   `appleId`, `ascAppId` y `appleTeamId` (o pasarlos interactivo).
5. **Los productos de IAP no están dados de alta** en App Store Connect.
   Los IDs ya están fijados en el código y tienen que coincidir EXACTO en
   los tres lados:
   - `app/src/lib/compras.native.js` → `PRODUCTOS_IAP`
   - `services/iap.js` → `PRODUCTOS`
   - App Store Connect → `lat.tappt.scan.personal.anual`,
     `lat.tappt.scan.negocio.anual`
6. **`APPLE_SHARED_SECRET` no está configurada en Railway.**
   `services/iap.js` lanza `falta_apple_shared_secret` sin ella, así que la
   compra cobra y **no activa el plan**. Se saca en App Store Connect →
   App Information → App-Specific Shared Secret.
7. **Falta borrado de cuenta en la app** (ver "Bloqueadores de revisión").

## Prerrequisitos

- **Apple Developer Program**, 99 USD/año. Sin esto no hay iPhone físico ni
  TestFlight; el simulador sí corre gratis, pero el simulador **no cobra
  IAP**, así que no sirve para probar el canal de pago.
- Una Mac **no es necesaria**: EAS compila en la nube. Solo hace falta para
  el simulador local.
- Cuenta Expo gratuita (`npx expo login`).
- `npm install -g eas-cli`.
- Bundle ID **`lat.tappt.scan`** (ya declarado en `app.json`) registrado en
  el portal de Apple. EAS lo registra solo si le dejas manejar credenciales.

## Paso a paso

### 1. Configurar el proyecto en EAS

```bash
cd app
npx expo login
eas build:configure          # escribe extra.eas.projectId en app.json
npx expo install expo-dev-client
```

El `projectId` **sí se commitea**: identifica el proyecto, no es secreto.

### 2. Development build (donde se prueba IAP)

```bash
eas build --profile development --platform ios
```

EAS pide las credenciales de Apple y genera el perfil de aprovisionamiento.
Como es `distribution: internal`, hay que **registrar el UDID** de cada
iPhone donde se vaya a instalar (`eas device:create`). Al terminar sale un
link/QR; se instala y luego:

```bash
npx expo start --dev-client
```

Ahí ya corre el código con recarga en vivo **y con los módulos nativos
dentro** — es el único lugar donde se puede depurar `react-native-iap`
antes de TestFlight.

### 3. Build de producción y subida

```bash
eas build --profile production --platform ios
eas submit --platform ios --latest
```

`production` tiene `autoIncrement: true`, así que el `buildNumber` sube
solo; el `version` (`0.1.0`) se cambia a mano en `app.json` cuando toque.
`appVersionSource: "local"` significa que **manda `app.json`**, no el
servidor de Expo.

### 4. Variables de build

`EXPO_PUBLIC_API_URL` se **hornea en el bundle** al compilar. `app/.env` no
viaja a EAS (está en `.gitignore`), así que hay que declararla en el perfil
de `eas.json` o el build sale apuntando a nada:

```json
"production": {
  "env": { "EXPO_PUBLIC_API_URL": "https://scan.tappt.lat" }
}
```

Es la falla silenciosa más típica: la app compila, abre, y ninguna llamada
responde.

## Bloqueadores de revisión de Apple

Ordenados por probabilidad de rechazo, con el estado en este repo.

### 🔴 Borrado de cuenta — guía 5.1.1(v)

Una app que **crea cuentas** debe dejar **borrarlas desde adentro**. Aquí se
crea una cuenta en el primer mensaje de WhatsApp (`services/sesiones.js`),
y hoy no existe ni endpoint ni pantalla: `routes/cuenta.js` solo tiene
`GET /`, `PUT /preferencias` y `POST /upgrade`. **Es rechazo seguro.**
Falta `DELETE /api/cuenta` (borrar `scan_users` + sus `scan_documents` y
`scan_sesiones`; los archivos viven en el Drive del usuario y son suyos) y
su botón en `AjustesScreen`.

### 🟡 Guía 3.1.1 — no mandar a comprar afuera

Ya está atendido a propósito: `AjustesScreen` solo muestra los botones de
compra si `iapDisponible`, y el `wa.me` de esa pantalla no se usa para
contratar (ver el comentario en el archivo). **No agregar** links a Stripe,
precios en otra moneda ni "contrátalo en la web" dentro de la app nativa.

### 🟡 Login por WhatsApp

El acceso abre WhatsApp con un código ya escrito. Dos cosas que preguntan
en revisión:

- **Qué pasa si el revisor no tiene WhatsApp instalado.** Hay que darle una
  cuenta de demo en las notas de revisión (número + sesión ya ligada), o el
  flujo es intransitable para él.
- No se requiere Sign in with Apple: solo aplica cuando hay login social de
  terceros (Google/Facebook). WhatsApp como canal de OTP no lo dispara.

### 🟡 Permisos y privacidad

- Los textos de cámara y fotos ya están en `app.json` (`expo-camera`,
  `expo-image-picker`) y están en español, bien.
- **Privacy manifest** (`PrivacyInfo.xcprivacy`): obligatorio desde 2024.
  Expo SDK 51 lo genera para sus propios módulos; hay que revisar que
  `react-native-iap` quede declarado y llenar las *nutrition labels* en App
  Store Connect: se recolecta número de teléfono (identificador), correo si
  el usuario lo da, y metadatos de documentos.
- **El archivo no se guarda en nuestros servidores** — vale la pena decirlo
  en la ficha, es cierto y ayuda.
- `ITSAppUsesNonExemptEncryption: false` ya está declarado: evita el trámite
  de exportación en cada subida.

### 🟢 Ícono

`app/assets/icon.png` es 1024×1024 con canal alfa. Apple **rechaza** íconos
con transparencia; Expo aplana el alfa contra el fondo al hacer prebuild, así
que normalmente sale bien, pero conviene abrir el `.ipa` (o mirar el ícono en
TestFlight) la primera vez en vez de confiar.

## Lo que el build nativo desbloquea, y lo que no

**Desbloquea:**

- IAP real (sandbox en dev/TestFlight, producción en tienda).
- Cámara nativa con enfoque y calidad de verdad — la brecha que
  `docs/DISTRIBUCION.md` señala contra `getUserMedia`.
- Ícono, nombre y arranque reales.

**No desbloquea, y conviene no confundirlo:** el detector de documentos
sigue corriendo **en el servidor** (`POST /api/documentos/detectar-bordes`),
así que el build nativo **no** mejora la latencia de ~300-560 ms por ciclo.
Eso es el paso 3 del plan (DocQuad en el dispositivo), documentado en
`docs/ARQUITECTURA-SCANNER.md`. Compilar nativo no lo arregla solo.

## Orden recomendado

1. Cerrar el **borrado de cuenta** (backend + pantalla). Es el único
   bloqueador duro y no depende de Apple.
2. `eas build:configure` + `expo-dev-client` + `env` en `eas.json`.
3. **Development build** y probar el flujo entero en un iPhone real.
4. Alta de la app y de los dos productos en **App Store Connect**;
   `APPLE_SHARED_SECRET` en Railway.
5. Probar la compra en sandbox contra `POST /api/pagos/iap/verificar` —
   confirmar que el plan **sí** queda activado antes de que
   `finishTransaction` cierre la compra.
6. Publicar la pantalla de consentimiento de **Google Cloud a producción**
   antes de meter testers (si no, el Drive se les desconecta cada 7 días —
   ver `docs/GOOGLE-DRIVE.md`).
7. Build de producción → `eas submit` → **TestFlight**.
