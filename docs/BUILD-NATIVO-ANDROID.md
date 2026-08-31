# Build nativo de Android — de este repo a Play Internal Testing

_Última actualización: 2026-08-31_

Hermana de `docs/BUILD-NATIVO-IOS.md`. Casi todo el trabajo es compartido
—el mismo código, el mismo `eas.json`, el mismo development build— así que
aquí solo va **lo que cambia en Android**.

## Lo que ya es común con iOS

Estas piezas se resolvieron una sola vez y sirven para las dos plataformas:

- ✅ `expo-dev-client` instalado — `react-native-iap` es módulo nativo y no
  corre en Expo Go, en ninguna de las dos.
- ✅ `EXPO_PUBLIC_API_URL` en los tres perfiles de `eas.json`.
- ✅ Borrado de cuenta (`DELETE /api/cuenta` + Ajustes). **Google Play lo
  exige igual que Apple**, y además pide algo que Apple no: una **URL
  pública** donde se pueda pedir la baja sin tener la app instalada. Es
  `public/eliminar-cuenta.html` → `https://scan.tappt.lat/eliminar-cuenta.html`.
  Esa URL se pega en Play Console → Data safety.
- ✅ Restaurar compras — `getAvailablePurchases()` funciona igual en Play.

## 🔴 El bloqueador de Android: el target API

Google Play sube cada año el nivel de API mínimo que puede tener una app
**nueva**, y deja de aceptar builds por debajo. Este repo está en **Expo SDK
51 / React Native 0.74**, que compila contra **API 34**.

Para agosto de 2026 eso ya está por debajo del mínimo de Play (el corte de
API 35 entró el 31-ago-2025, y hay otro cada año en la misma fecha). O sea:
**el .aab de este repo no se puede publicar tal cual** — Play lo rechaza al
subirlo, antes de cualquier revisión.

Se arregla subiendo el SDK de Expo, no tocando `app.json`: el `targetSdk` lo
fija la versión de React Native que trae el SDK. Es un upgrade de varias
versiones (51 → la actual), así que **hay que presupuestarlo como trabajo
propio**, no como un paso del release:

```bash
cd app
npx expo install expo@latest --fix
npx expo-doctor
```

Y después revalidar lo que más se rompe en estos saltos: `expo-camera`
(cambió de API entre versiones), `expo-file-system` (API nueva a partir de
SDK 52) y `react-native-iap`.

> **Confirmar el número exacto en Play Console antes de empezar** — la
> política se mueve cada año y esta nota se escribió sin poder consultarla.
> El mensaje de rechazo al subir el .aab dice el nivel requerido.

Nada de esto bloquea iOS: Apple no tiene un corte equivalente que impida a
la SDK 51 subir a TestFlight hoy.

## Qué falta en el repo (aparte del SDK)

1. ⬜ **Cuenta de Google Play Developer** — 25 USD, pago único. Igual que en
   Apple, conviene darla de alta como **organización**: una cuenta personal
   nueva exige **12 testers durante 14 días seguidos** antes de poder
   publicar en producción; la de organización no.
2. ⬜ **Los dos productos de suscripción** en Play Console, con los IDs
   exactos: `lat.tappt.scan.personal.anual` y `lat.tappt.scan.negocio.anual`.
3. ⬜ **Service account de Google Play**, que se usa en **dos lugares
   distintos y con formatos distintos** — es la confusión típica:
   - `eas submit` quiere **la ruta a un archivo**:
     `submit.production.android.serviceAccountKeyPath` (ya está apuntando a
     `app/credenciales-play.json`, que está en `.gitignore` — **no
     commitear ese archivo**).
   - El backend quiere **el JSON en línea**, en la env
     `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` de Railway
     (`services/iap.js` → `androidPublisher()`).
4. ⬜ **`ANDROID_PACKAGE_NAME`** en Railway. Hoy `services/iap.js` cae a
   `lat.tappt.scan` por defecto, que es correcto — declararla igual, para
   que no dependa de un default escondido.
5. ⬜ **Ícono adaptativo.** `app.json` no declara `android.adaptiveIcon`, así
   que Android recorta `icon.png` con la máscara del sistema y puede comerse
   los bordes. No lo toqué a ciegas: el foreground de un ícono adaptativo
   pierde ~25% al enmascararse, y meter el ícono completo ahí suele salir
   peor que no ponerlo. Hay que hacer el arte con su zona segura.
6. ⬜ **Data safety** en Play Console: se recolecta número de teléfono
   (identificador), correo si el usuario lo da, y metadata de documentos.
   Ahí va también la URL de borrado de cuenta de arriba.

## 🟡 Riesgo a verificar: la API con la que validamos las compras

`services/iap.js` valida contra `purchases.subscriptions.get` (Android
Publisher **v3 clásica**). Google reemplazó ese modelo por
*subscription + base plan*, y para suscripciones creadas con el modelo nuevo
lo que responde es `purchases.subscriptionsv2.get` — la vieja puede fallar o
devolver vacío.

No lo cambié porque **depende de cómo se den de alta los productos**, y eso
todavía no pasa. Al crear la primera suscripción en Play Console hay que
probar `POST /api/pagos/iap/verificar` con un token real: si responde error
de producto o viene sin `expiryTimeMillis`, hay que migrar esa llamada a
`subscriptionsv2` (cambia también la forma de leer el vencimiento y el
estado de pago).

## Paso a paso

Los tres primeros son idénticos a iOS y se hacen una sola vez:

```bash
cd app
npx expo login
eas build:configure                 # crea extra.eas.projectId
```

De ahí en adelante, Android:

```bash
# Para probar en un teléfono con recarga en vivo (incluye IAP)
eas build --profile development --platform android
npx expo start --dev-client

# APK suelto, se instala con un link — no requiere cuenta de Play
eas build --profile preview --platform android

# .aab para la tienda
eas build --profile production --platform android
eas submit --platform android --latest
```

El APK del perfil `preview` es la ventaja grande de Android: **reparte la
app real sin tienda y sin cuenta de desarrollador**. En iOS no existe ese
atajo. Sirve para poner la app en manos de alguien hoy mismo — aunque el
IAP ahí tampoco funciona sin los productos dados de alta.

## Permisos

`app.json` declara `CAMERA` y `READ_EXTERNAL_STORAGE`. El permiso de cobro
(`com.android.vending.BILLING`) **no hay que declararlo a mano**: lo aporta
`react-native-iap` en su propio manifiesto y Gradle lo fusiona. Declararlo
duplicado no rompe, pero tampoco hace falta.

## Orden recomendado

1. **Subir el SDK de Expo** y revalidar cámara, archivos e IAP. Es el
   bloqueador duro y no depende de Google.
2. Cuenta de Play Developer (como organización) + `eas build:configure`.
3. **APK `preview`** para repartir la beta mientras lo demás avanza.
4. Alta de los dos productos + service account (archivo para EAS, JSON en
   Railway) + `ANDROID_PACKAGE_NAME`.
5. Probar compra y restaurar contra `POST /api/pagos/iap/verificar`, y de
   paso confirmar si hace falta migrar a `subscriptionsv2`.
6. Ícono adaptativo y ficha de Data safety.
7. `.aab` de producción → `eas submit` → pista **Internal testing**.
