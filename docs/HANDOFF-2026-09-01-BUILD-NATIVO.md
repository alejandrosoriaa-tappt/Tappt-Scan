# Handoff — build nativo iOS/Android (2026-09-01)

_Última actualización: 2026-09-01_

> Para las pruebas funcionales actuales, seguir
> [`CHECKLIST-QA-USUARIO.md`](./CHECKLIST-QA-USUARIO.md) en orden y registrar
> cada fallo con hora y captura. Este checklist reemplaza las pruebas ad hoc.

Estado exacto al cerrar la sesión de Claude Code. Rama
**`claude/build-nativo-ios-docs-jud3zt`**, 5 commits, todo pusheado.

## Qué se hizo, y por qué

Cinco commits, del más viejo al más nuevo:

1. **`b32c09c` docs(ios)** — nace `docs/BUILD-NATIVO-IOS.md`.
2. **`f77f260` feat(cuenta)** — **borrado de cuenta** (`DELETE /api/cuenta` +
   botón en Ajustes). Era rechazo seguro de la App Store: la guía 5.1.1(v)
   exige que una app que crea cuentas deje borrarlas desde adentro, y aquí
   la cuenta nace sola con el primer mensaje de WhatsApp.
3. **`5d47a76` feat(iap)** — **restaurar compras**. Lo exige la guía 3.1.1 y
   además resuelve un hueco real: quien reinstala o cambia de teléfono ya
   pagó y la app lo dejaba en gratis sin salida.
4. **`1947fd3` docs(android)** — `docs/BUILD-NATIVO-ANDROID.md` y
   `public/eliminar-cuenta.html` (Google Play exige una **URL pública** de
   borrado de cuenta, además del borrado in-app).
5. **`bc68fa5` chore(app)** — **Expo SDK 51 → 57**. Era el bloqueador duro de
   Play: SDK 51 compila contra API 34 y Play ya no acepta apps nuevas tan
   abajo.
6. **`00fa07e` fix(iap)** — tres bugs encontrados releyendo el propio diff.

### El bug que más importa de esa lista

`POST /api/pagos/iap/verificar` escribía `plan` y `plan_vence` **antes** de
comprobar si la compra seguía vigente. Al agregar "restaurar compras" ese
endpoint dejó de recibir solo compras recién hechas: si alguien con plan
activo tocaba restaurar y la tienda devolvía un recibo viejo, esa fecha
pasada lo dejaba en gratis. **Le quitábamos el plan a quien sí paga.** Ya no
se escribe nada si la compra no está vigente.

Los otros dos: el guardia contra duplicados usaba `maybeSingle()`, que
revienta con más de una fila (justo en las cuentas que ya traen duplicados)
— lleva `limit(1)`; y `fetchProducts` puede devolver `null`, no solo lista
vacía, así que desestructurarlo tiraba un `TypeError`.

## Lo que rompió el salto de SDK, y cómo se resolvió

| Antes | Ahora |
|---|---|
| Expo 51 | 57 |
| React Native 0.74.5 | 0.86.3 |
| React 18.2 | 19.2 |
| React Navigation 6 | 7 |
| react-native-iap 16.3 | 16.5 |

1. **`expo-file-system`** — `readAsStringAsync` y `EncodingType` salieron del
   export principal en SDK 52. `src/lib/importar.js` usa la API nueva
   (`new File(uri).base64()`), no `expo-file-system/legacy` (deprecado).
2. **`react-native-iap` cambió de API entera** al pasarse a Nitro Modules:
   `getSubscriptions` → `fetchProducts({skus, type:'subs'})`,
   `requestSubscription` → `requestPurchase({request:{apple,google}, type})`.
   `src/lib/compras.native.js` está reescrito. Agrega el peer
   `react-native-nitro-modules`.
3. **El recibo de iOS ya no viene en la compra.** Desde 16.5 `purchaseToken`
   es el **JWS** de la transacción, y el backend valida con `verifyReceipt`,
   que espera el **recibo base64 de la app** — otra cosa. Se pide aparte con
   `getReceiptDataIOS()`.

`expo-image-manipulator` NO hizo falta tocarlo: `manipulateAsync` sigue
exportado, así que la cámara quedó igual.

## Verificado / no verificado

**Verificado en el Mac mini (2026-09-01):**

- `expo export --platform web` compila; los 44 archivos de `src/` parsean.
- **`xcodebuild` → `Build Succeeded`, 0 errores, 1 warning.** El proyecto
  nativo compila con RN 0.86 + Nitro Modules. `pod install` resolvió sin
  conflictos.
- App instalada y **corriendo en el simulador iPhone 17 Pro (iOS 26.5)**.
  `iOS Bundled 5919ms index.js (1204 modules)`.
- **La pantalla de Login renderizó** y el botón de WhatsApp disparó
  `Linking.openURL` (abrió Safari a whatsapp.com, correcto: el simulador no
  tiene WhatsApp). O sea React 19 + Navigation 7 corren, no solo compilan.

**NO verificado — es lo que sigue:**

- Nada en **dispositivo físico** (bloqueado, ver abajo).
- **Cámara y contorno en vivo** — el salto de `expo-camera` 15→57 es lo más
  frágil que queda, y el simulador no tiene cámara.
- Importar archivo/galería (donde cambió `expo-file-system`).
- Editor y firma (WebView subió de versión).
- **IAP contra tienda real** — la reescritura de `compras.native.js` nunca
  se ha ejecutado contra App Store Connect.

## 🔴 Dónde quedó atorado, exactamente

Compilar al **iPhone físico** ("iPhone ASA", iOS 26.6, UDID
`00008140-000865443647001C`).

En Xcode → target TapptScan → Signing & Capabilities:
- `Automatically manage signing` ✓
- Team = **Alejandro Soria (Personal Team)** ✓
- Bundle Identifier = `lat.tappt.scan`
- ⚠️ `Your team has no devices from which to generate a provisioning profile`
- ⚠️ `No profiles for 'lat.tappt.scan' were found`

**El siguiente paso es mecánico:** conectar el iPhone por cable,
desbloquearlo, aceptar "Confiar en esta computadora", **seleccionarlo como
destino en Xcode** (arriba dice `iPhone 17 Pro`, o sea el simulador) y
presionar **Try Again**. Un Personal Team solo genera el perfil contra un
dispositivo registrado. Después:

```bash
cd ~/Documents/tappt-scan-ios/app
npx expo run:ios --device "iPhone ASA"
```

Y en el iPhone: Ajustes → Privacidad y Seguridad → **Modo Desarrollador**
encendido.

## El entorno de la Mac (para no repetir la pelea)

Se fue medio día en esto. Queda anotado:

```
Mac mini M1 · macOS 26.6.2 · Xcode 26.6 · CLT 26.6 · CocoaPods 1.17.0
```

- **La cadena de versiones es rígida:** iPhone con iOS 26.6 → exige Xcode 26.x
  → exige macOS 26.2+. Un Xcode 16.2 bajado a mano NO sirve.
- **Xcode 26 pesa solo ~3.5 GB** porque el SDK de iOS se baja aparte. Si
  `xcodebuild` se queja de librerías, faltan estos dos:
  ```bash
  sudo xcodebuild -runFirstLaunch
  xcodebuild -downloadPlatform iOS
  ```
- **CocoaPods: instalar con `sudo gem install cocoapods`, NO con brew.** El
  Homebrew de esta Mac está en `~/homebrew` (prefijo no estándar), así que no
  puede usar binarios precompilados y **compila llvm, rust, python y ruby
  desde fuente** — horas. Por gem tarda 2 segundos.
- Hubo que liberar **35 GB** para que cupieran macOS y Xcode (cachés, la VM
  local de Claude en `~/Library/Application Support/Claude/vm_bundles`,
  `OptGuideOnDeviceModel` de Chrome, `~/Library/Developer`).

### Dónde vive el código en esa Mac

- **Clon limpio, el bueno:** `~/Documents/tappt-scan-ios`
- ⚠️ Hay otra copia vieja en
  `~/Documents/Codex/2026-08-20/https-chatgpt-com-c-.../work/Tappt-Scan`,
  en otra rama y **con cambios sin commitear** (`app/package.json`,
  `app/package-lock.json`, `session-memory.md`) más una carpeta `app/ios/`
  de un intento anterior contra SDK 51. **No trabajar ahí y no borrarla**
  sin revisar antes qué son esos cambios.
- `app/.env` **no viene en el repo** (gitignored). Se creó a mano:
  ```
  EXPO_PUBLIC_API_URL=https://scan.tappt.lat
  ```

## Pendientes, por bloqueador

### Bloqueado por el D-U-N-S (Apple y Google a la vez)

El mismo trámite de verificación de organización desbloquea las dos
plataformas — no son dos esperas, es una.

- Apple Developer Program (99 USD/año) y Google Play Developer (25 USD, pago
  único). Conviene **organización**: una cuenta personal de Play exige 12
  testers durante 14 días antes de publicar.
- Con cuenta gratuita: la app **caduca a los 7 días** y **no hay IAP** (los
  productos viven en App Store Connect, que requiere membresía activa).

### No bloqueado — se puede hacer ya

- `eas build:configure` (necesita `npx expo login`) → crea el `projectId`
  que falta en `app.json`. Es lo único de configuración que no se pudo dejar
  listo desde el repo.
- **APK de Android por EAS**, que se reparte por link **sin cuenta de
  desarrollador**: `eas build --profile preview --platform android`. En iOS
  no existe ese atajo.

### Cuando existan las cuentas

- Productos IAP con los IDs exactos: `lat.tappt.scan.personal.anual` y
  `lat.tappt.scan.negocio.anual`. Deben coincidir en tres lados:
  `app/src/lib/compras.native.js`, `services/iap.js` y la tienda.
- `APPLE_SHARED_SECRET` en Railway — **sin esto la compra cobra y no activa
  el plan** (`services/iap.js` lanza `falta_apple_shared_secret`).
- Android: service account de Play en **dos formatos distintos** — ruta a
  archivo para `eas submit` (`app/credenciales-play.json`, gitignored) y
  **JSON en línea** en `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` de Railway.
  Más `ANDROID_PACKAGE_NAME`.
- Sustituir los placeholders de `submit.production.ios` en `eas.json`
  (`appleId`, `ascAppId`, `appleTeamId`).

## Riesgos abiertos, anotados y sin tocar

1. **`purchases.subscriptions.get` vs `subscriptionsv2`.** `services/iap.js`
   valida con la API v3 clásica de Play. Las suscripciones creadas con el
   modelo nuevo (subscription + base plan) responden por `subscriptionsv2`.
   No se cambió porque **depende de cómo se den de alta los productos**, y
   eso no ha pasado. Al crear el primero, probar el endpoint con un token
   real; si viene sin `expiryTimeMillis` o da error de producto, migrar.
2. **`verifyReceipt` está deprecado** por Apple a favor de la App Store
   Server API (JWS). Hoy funciona. Si lo apagan, la migración cambia
   `services/iap.js` entero y usa llave `.p8` en vez de shared secret.
3. **Ícono adaptativo de Android** sin definir en `app.json`. No se hizo a
   ojo: el foreground pierde ~25% al enmascararse y meter el ícono completo
   suele salir peor. Necesita arte con zona segura.
4. **El ícono de iOS se vio genérico** en el simulador (un documento, no el
   verde de TapptScan). Cosmético, pero Apple lo mira en revisión.
   `app/assets/icon.png` es 1024×1024 **con canal alfa**, y Apple rechaza
   íconos con transparencia (Expo normalmente lo aplana solo).
5. **Warning de Metro:** `Unable to resolve manifest assets. Icons and fonts
   might not work. unable to get local issuer certificate.` Huele a
   proxy/antivirus interceptando TLS. Solo afecta desarrollo, pero puede ser
   la causa del punto 4.
6. **El Apple ID `alexsoria1@gmail.com` pertenece a un segundo equipo**,
   "Juan Olivo Rodriguez / Marketing". El rol Marketing **no puede firmar ni
   registrar dispositivos** — usar siempre el Personal Team para pruebas
   locales.

## Orden sugerido para retomar

1. Cerrar la firma en Xcode (Try Again con el iPhone conectado) y correr
   `expo run:ios --device "iPhone ASA"`.
2. Probar en el teléfono, en este orden de fragilidad: **cámara y contorno en
   vivo** → importar archivo y galería → editor y firma → borrado de cuenta
   (con cuenta de prueba: **borra de verdad**).
3. Los botones de IAP deben fallar con `producto_no_encontrado_en_tienda`.
   Eso **no es bug**. Sí lo sería un crash o un error de módulo nativo
   (`NitroModules`, `initConnection`) — eso significaría que la reescritura
   está mal enganchada.
4. En paralelo, `eas build --profile preview --platform android` para tener
   la beta de Android repartible hoy.
