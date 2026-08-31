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

## ✅ El bloqueador de Android: el target API — RESUELTO

Google Play sube cada año el nivel de API mínimo que puede tener una app
**nueva**, y deja de aceptar builds por debajo. El repo estaba en **Expo SDK
51 / React Native 0.74**, que compila contra **API 34** — por debajo del
corte, o sea que el `.aab` se rechazaba al subirlo, antes de cualquier
revisión.

**Ya se subió a Expo SDK 57 / React Native 0.86.** Fue un salto de seis
majors y arrastró todo lo demás:

| | Antes | Ahora |
|---|---|---|
| Expo | 51 | 57 |
| React Native | 0.74.5 | 0.86.3 |
| React | 18.2 | 19.2 |
| React Navigation | 6 | 7 |
| react-native-iap | 16.3 | 16.5 |

### Lo que hubo que cambiar en el código

1. **`expo-file-system`** — `readAsStringAsync` y `EncodingType` salieron del
   export principal en SDK 52. `src/lib/importar.js` usa la API nueva
   (`new File(uri).base64()`) en vez de `expo-file-system/legacy`, que está
   deprecado y avisa en consola.
2. **`react-native-iap` cambió de API entera** al pasarse a Nitro Modules.
   `getSubscriptions` → `fetchProducts({skus, type:'subs'})`,
   `requestSubscription` → `requestPurchase({request:{apple,google}, type})`.
   `src/lib/compras.native.js` está reescrito contra la nueva.
3. **El recibo de iOS ya no viene en la compra.** Desde 16.5 `purchaseToken`
   es el **JWS** de la transacción (API moderna de Apple), y nuestro backend
   valida con `verifyReceipt`, que espera el **recibo de la app** en base64 —
   otra cosa. Por eso ahora se pide aparte con `getReceiptDataIOS()`. Ver el
   riesgo anotado abajo.

`expo-image-manipulator` **no** hizo falta tocarlo: `manipulateAsync` sigue
exportado (deprecado, pero presente), así que la cámara quedó igual.

### Lo que se verificó y lo que NO

Verificado aquí: el bundle web compila entero (`expo export --platform web`),
los 44 archivos de `src/` parsean con el Babel del SDK nuevo, y
`expo config --type prebuild` resuelve los plugins sin error.

**NO verificado, y es lo que falta:** ningún build nativo. No hay Mac ni EAS
en el entorno donde se hizo el upgrade. En particular **la reescritura de
`compras.native.js` no se ha ejecutado nunca contra una tienda real** — es
código nuevo contra una API que cambió de raíz. Es lo primero a probar en el
development build.

> **Confirmar el nivel de API que pide Play hoy** — la política se mueve cada
> año. SDK 57 va muy por encima del corte de API 34 que bloqueaba, pero el
> número exacto lo dice el mensaje de rechazo al subir el `.aab`.

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

## 🟡 Riesgo a verificar: `verifyReceipt` está deprecado

`services/iap.js` valida los recibos de Apple contra `verifyReceipt`, el
endpoint clásico. Apple lo dio por deprecado a favor de la **App Store Server
API** (transacciones firmadas en JWS), y `react-native-iap` 16.5 ya se mudó a
ese modelo — por eso el recibo viejo hay que pedirlo aparte con
`getReceiptDataIOS()`.

Hoy funciona y no se toca. Pero si Apple apaga `verifyReceipt`, la migración
es de verdad: la App Store Server API no usa el shared secret, sino una llave
`.p8` firmada, así que cambia `services/iap.js` entero y las variables de
Railway. Vale tenerlo anotado antes de que sea una urgencia.

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

1. ~~**Subir el SDK de Expo**~~ ✅ hecho (51 → 57). Falta **revalidar en
   dispositivo** cámara, importación de archivos e IAP: nada de eso se pudo
   probar sin un build nativo.
2. Cuenta de Play Developer (como organización) + `eas build:configure`.
3. **APK `preview`** para repartir la beta mientras lo demás avanza.
4. Alta de los dos productos + service account (archivo para EAS, JSON en
   Railway) + `ANDROID_PACKAGE_NAME`.
5. Probar compra y restaurar contra `POST /api/pagos/iap/verificar`, y de
   paso confirmar si hace falta migrar a `subscriptionsv2`.
6. Ícono adaptativo y ficha de Data safety.
7. `.aab` de producción → `eas submit` → pista **Internal testing**.
