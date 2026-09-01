# Cómo probar y repartir la app antes de las tiendas

_Última actualización: 2026-08-31_

> **iOS nativo tiene su propia guía:** `docs/BUILD-NATIVO-IOS.md` — qué falta
> en el repo, IAP, y los bloqueadores de revisión de Apple.

> ⚠️ **Desactualizado para iOS (2026-08-31).** Lo de abajo asume que todo se
> compila con EAS en la nube y que no hace falta Xcode. **Ya no aplica**:
> desde que la app incluye el módulo nativo propio `TapptDocumentScanner`,
> no corre en Expo Go y necesita prebuild + compilación nativa.
> Ver **`docs/BUILD-NATIVO-IOS.md`** para el estado real del build de iOS.
> Los niveles 0 (web app) y 3 (tiendas) siguen vigentes.

Cuatro caminos, de menos a más ceremonia. Los dos primeros se pueden hacer
hoy sin pagar nada ni abrir cuentas de tienda.

## Nivel 0 · La web app espejo

La app corre también en el navegador con **React Native Web**, desde el
mismo código:

```bash
cd app && npm run web        # desarrollo
npx expo export --platform web --output-dir dist   # build estático
```

Sale un sitio estático (`dist/`) que se publica en cualquier lado: Railway,
Vercel, Netlify o el hosting que ya uses. Está declarada como PWA
(`display: standalone`), así que desde el navegador se puede "agregar a la
pantalla de inicio" y se comporta como app.

**Sirve para dos cosas concretas:**

1. Repartir la beta a quien sea, sin tiendas, sin cuentas, sin Expo Go —
   solo un link.
2. Es el camino natural para el caso de **"escanear desde la Mac o la PC"**:
   arrastras el PDF que te llegó por correo y lo importas ahí mismo.

### Lo que cambia en web

El código es el mismo salvo dos piezas que no existen en el navegador. Se
resuelven con la convención `.web.js` de React Native, que sustituye el
archivo automáticamente al compilar para web:

| Pieza | Móvil | Web |
|---|---|---|
| Firma | `FirmaPad.js` — canvas dentro de un WebView | `FirmaPad.web.js` — canvas directo, Pointer Events (mouse, dedo y lápiz) |
| Leer archivos | `importar.js` — `expo-file-system` | `importar.web.js` — `<input type=file>` y `FileReader` |

Verificado: en el bundle web no queda rastro de `react-native-webview` ni
de `expo-file-system`.

**Diferencia real que no se puede tapar:** la cámara en el navegador usa
`getUserMedia`, sin el control de enfoque ni la calidad de la cámara
nativa. Para escanear con el teléfono, la app nativa siempre va a dar mejor
foto. En la web el camino natural es importar un archivo, no fotografiar.

## Nivel 1 · Expo Go — hoy, gratis, sin cuentas

Casi todo lo que usa la app son paquetes del SDK de Expo (`expo-camera`,
`expo-document-picker`, `expo-image-picker`, `expo-file-system`,
`expo-localization`, `expo-web-browser`) más `react-native-webview`,
`async-storage`, `safe-area-context` y `screens`. Esos **sí vienen dentro de
Expo Go**, así que no hace falta compilar nada para probarlos.

> ⚠️ **La excepción es `react-native-iap`**, que se agregó después de
> escribir esto: es un módulo nativo y **no existe en Expo Go**. La compra de
> planes (`AjustesScreen` → `compras.native.js`) falla ahí. Para probar el
> cobro hace falta un *development build* — ver `docs/BUILD-NATIVO-IOS.md`.

```bash
cd app && npm install && npm start
```

Sale un QR. Se escanea con la cámara (iOS) o con la app Expo Go (Android),
descargando antes **Expo Go** de la App Store o Google Play. El teléfono y
la computadora deben estar en la misma red; si no, `npx expo start --tunnel`.

Sirve para probar el flujo completo: login, onboarding, cámara, recorte,
editor, firmas, importación y cambio de idioma.

**Lo que NO se puede validar aquí:** el ícono y el nombre reales en la
pantalla de inicio, el rendimiento de una build optimizada, el
comportamiento de la app cerrada y **la compra dentro de la app**. Para eso,
nivel 2.

## Nivel 2 · EAS Build con distribución interna

Genera la app de verdad y la reparte por link, sin pasar por tiendas.
Requiere una cuenta gratuita de Expo (`npx expo login`).

```bash
npm install -g eas-cli
cd app
eas build:configure          # una vez: crea el projectId
eas build --profile preview --platform android
```

El perfil `preview` de `eas.json` produce un **APK** de Android. Al
terminar, EAS devuelve un link: quien lo abra en su teléfono la instala.
Es la forma más rápida de poner la app en manos de alguien.

En **iOS no hay equivalente sencillo**: Apple no permite instalar fuera de
la tienda sin registrar el UDID de cada dispositivo en una cuenta de
desarrollador de pago. En la práctica, para iOS se salta al nivel 3.

## Nivel 3 · TestFlight y Google Play Internal Testing

Estos **son** el "simulador de tienda": el canal oficial de preproducción de
cada plataforma. Es donde debe correr la beta.

### iOS — TestFlight

- Requiere **Apple Developer Program, 99 USD/año**.
- `eas build --profile production --platform ios` y luego
  `eas submit --platform ios`.
- **Testers internos** (hasta 100, deben ser miembros de tu equipo en App
  Store Connect): sin revisión, disponible en minutos.
- **Testers externos** (hasta 10,000, por correo o link público): pasan una
  revisión ligera de Apple, normalmente 24-48 h.
- Cada build caduca a los **90 días**.

### Android — Internal Testing

- Requiere **cuenta de Google Play Developer, 25 USD una sola vez**.
- `eas build --profile production --platform android` y
  `eas submit --platform android`.
- Pista **Internal testing**: hasta 100 testers por correo, sin revisión,
  disponible en minutos.
- Ojo: una cuenta de desarrollador **personal** nueva exige 12 testers
  durante 14 días seguidos antes de poder publicar en producción. Si la
  cuenta es de **organización**, ese requisito no aplica. Conviene abrirla
  como organización desde el principio.

## Cuidado con esto en la beta

Dos cosas van a morder si se saltan, y ninguna es de la app:

1. **Los refresh tokens de Google caducan a los 7 días mientras la
   pantalla de consentimiento OAuth esté en modo *Testing*.** A los beta
   testers se les va a desconectar el Drive cada semana. Hay que publicar la
   app de Google Cloud a producción antes de repartir. Ver
   `docs/GOOGLE-DRIVE.md`.
2. **En modo *Testing*, Google limita a 100 usuarios de prueba** y hay que
   dar de alta cada correo a mano en la consola.

Además, `EXPO_PUBLIC_API_URL` debe apuntar al backend desplegado en Railway,
no a `localhost`: el teléfono de un tester no ve tu máquina.

## Orden recomendado

1. **Expo Go** para afinar el producto contigo y con quien tengas cerca.
2. Publicar la app de Google Cloud a producción — antes de meter testers, o
   se les desconectará el Drive cada semana.
3. **Web app** desplegada: es el link que puedes mandarle a cualquiera, sin
   cuentas ni instalaciones. La beta más barata que existe.
4. **APK por EAS** para los beta testers de Android que quieran la app real.
5. **Cuenta de Apple + TestFlight** cuando el flujo ya esté estable: ahí
   empieza el reloj de los 99 USD y la revisión.
