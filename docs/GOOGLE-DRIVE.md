# Google Cloud Console — alta y autorización de Drive

_Última actualización: 2026-08-09_

## Lo que decide todo: el scope

TapptScan pide **un solo scope**, en `services/drive.js`:

```js
scope: ['https://www.googleapis.com/auth/drive.file']
```

`drive.file` da acceso **únicamente a los archivos que la app crea** (o que
el usuario elige explícitamente con el Picker). No puede leer el resto del
Drive. Google lo clasifica como scope **recomendado y no restringido**, y de
ahí viene la ventaja: los scopes *restringidos* (`drive`, `drive.readonly`,
`drive.metadata`) obligan a una **evaluación de seguridad anual con un
tercero (CASA)** — semanas de proceso y varios miles de dólares. Con
`drive.file` no aplica.

> **Regla que no hay que romper:** en cuanto alguien agregue `drive` o
> `drive.readonly` "para poder ver todo el Drive del usuario", el proyecto
> cae en el carril restringido y el lanzamiento se atrasa meses. Si hace
> falta abrir un archivo que la app no creó, la vía correcta es el **Google
> Picker**, que otorga permiso archivo por archivo sin cambiar de scope.

## Pasos en la consola

1. **Proyecto**: crear uno nuevo en console.cloud.google.com, dedicado a
   TapptScan (no reutilizar el de Tappt ni el del bróker — misma regla de
   verticales separadas que aplica al resto).
2. **Habilitar la API**: *APIs & Services → Library → Google Drive API →
   Enable*.
3. **Pantalla de consentimiento** (*OAuth consent screen*):
   - User type: **External**.
   - Nombre de la app: `TapptScan`. No puede contener "Google".
   - Correo de soporte y correo del desarrollador.
   - **Dominios autorizados**: el dominio propio (p. ej. `tappt.lat`). Hay
     que ser dueño verificado del dominio en Google Search Console.
   - **Política de privacidad** y **términos** en URLs públicas del mismo
     dominio. Son obligatorias para publicar.
4. **Scopes**: agregar solo `.../auth/drive.file`. Nada más.
5. **Credenciales**: *Create credentials → OAuth client ID → **Web
   application***.
   - Tipo *Web*, no iOS/Android: la app abre el navegador contra **nuestro
     backend**, y es el backend quien habla con Google. Un solo cliente
     sirve para iOS, Android y web.
   - **Authorized redirect URI**: exactamente el valor de
     `GOOGLE_REDIRECT_URI`, que debe apuntar a
     `https://<tu-railway>/api/drive/callback`.
   - El `client_id` y `client_secret` van a `GOOGLE_CLIENT_ID` y
     `GOOGLE_CLIENT_SECRET`.
6. **Publicar**: pasar la app de *Testing* a **In production**.

## Sobre la verificación

- En modo **Testing** la app funciona ya, sin revisión, pero con un tope de
  **100 usuarios de prueba** que hay que dar de alta a mano. Sirve para
  desarrollo y beta cerrada.
- Para producción con `drive.file`, al ser scope no restringido, **no aplica
  la evaluación de seguridad de terceros**. Puede pedirse verificación de
  marca (logo, dominio, pantalla de consentimiento), que es de días, no de
  meses.
- Si se sube un **logo**, se dispara la revisión de marca. Si urge salir,
  publicar primero sin logo y agregarlo después.

> Las políticas de Google cambian; conviene confirmar la clasificación
> vigente en la pantalla de scopes de la consola antes de planear fechas.

## Consecuencia de `drive.file` en el producto

`drive.file` **no ve archivos que TapptScan no creó**. Eso tiene un efecto
concreto en el explorador de la app (`GET /api/drive/carpetas`, que usa
`drive.files.list`):

- Se ven las carpetas y documentos creados por TapptScan. ✅
- **No** se ve un PDF que el usuario haya arrastrado a mano a
  `TapptScan/Casa/…` desde su computadora. ❌

No es un bug, es el precio de no pedir acceso a todo el Drive — y es
justamente lo que sostiene la promesa de privacidad del producto. Si algún
día se quiere que el usuario meta archivos propios, el camino es el Google
Picker, no ampliar el scope.

## Refresh tokens

`authUrl` pide `access_type: 'offline'` y `prompt: 'consent'`, así que el
primer intercambio devuelve un `refresh_token` que se guarda en
`scan_users.drive_tokens`. El cliente de `googleapis` renueva el access
token solo cuando expira, siempre que el refresh token esté presente.

Dos cosas que rompen esto y conviene tener presentes:

- Un refresh token **sin usar 6 meses** se invalida.
- Mientras la app esté en **Testing**, los refresh tokens caducan a los
  **7 días**. Es motivo suficiente para publicar a producción antes de la
  beta con usuarios reales.

Si el usuario revoca el acceso, las llamadas empiezan a fallar con
`invalid_grant`; hay que mandarlo a reconectar su Drive desde la app.
