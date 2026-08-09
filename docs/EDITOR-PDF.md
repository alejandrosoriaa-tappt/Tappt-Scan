# Editor de PDF — cómo funciona y qué se puede editar

_Última actualización: 2026-08-09_

## De qué depende poder "modificar el texto" de un PDF

Es la pregunta que más confunde de este tipo de apps (CamScanner incluido),
y la respuesta es que hay **dos clases de PDF** que se ven igual pero no
tienen nada que ver por dentro.

### 1. PDF nativo (tiene capa de texto)

Exportado desde Word, un banco, el SAT. El texto son caracteres de verdad
con su fuente incrustada. Aquí **sí** se puede reemplazar texto… con dos
condiciones que fallan seguido:

- **La fuente suele venir *subsetada*.** Para ahorrar peso, el PDF incrusta
  solo los glifos que se usaron. Si el documento nunca escribió una "ñ", esa
  "ñ" no existe en el archivo y no hay con qué dibujarla.
- **El texto no fluye.** No hay párrafos ni renglones: hay instrucciones de
  "dibuja estas letras en estas coordenadas". Si el texto nuevo es más largo
  que el viejo, se encima con lo que sigue. No hay reflow.

Por eso las apps que ofrecen "editar texto" lo permiten solo en algunos
documentos y con resultados disparejos.

### 2. PDF escaneado (sin capa de texto)

Una foto metida en un PDF. No hay texto: hay píxeles. Lo que hacen las apps
es **OCR + tapar con blanco + redibujar encima**. El resultado depende de qué
tan bien salió el OCR y de qué tan parecido sea el tipo de letra que se usa
al redibujar. Es la razón de que a veces se note el parche.

## Qué hace TapptScan

En TapptScan casi todo nace de una **foto** por WhatsApp, así que el caso 2
es el normal. El editor por lo tanto trabaja **sobre la imagen**, no sobre
una capa de texto que no existe:

1. La app baja el original desde el Drive del usuario
   (`GET /api/documentos/:id/imagen`) — el backend no guarda copia.
2. El usuario coloca elementos tocando el documento. Todo se guarda en
   **coordenadas fraccionarias (0-1) con origen arriba-izquierda**, así que
   no depende del tamaño de pantalla.
3. Al guardar, el backend hornea la imagen y las anotaciones en un PDF con
   `pdf-lib` (`POST /api/documentos/:id/editar`) y lo sube al Drive.

### Tipos de anotación

| Tipo | Qué hace |
|---|---|
| `texto` | Escribe texto en la posición dada |
| `firma` | Incrusta el PNG del trazo hecho a dedo |
| `imagen` | Incrusta una imagen de la galería |
| `emoji` | Igual que imagen (ver abajo) |
| `tapar` | Rectángulo blanco — para ocultar antes de reescribir |

Con `tapar` + `texto` se reproduce el patrón de "editar" un escaneo: se
oculta lo viejo y se escribe encima.

## Límites conocidos

- **Emojis a color.** `pdf-lib` no rasteriza fuentes de color, así que un
  emoji puesto como texto sale en negro. Para que salga a color hay que
  mandarlo como imagen PNG (tipo `imagen`).
- **Caracteres fuera de WinAnsi.** Sin `assets/fuente-unicode.ttf`, las
  fuentes estándar solo cubren latín con acentos. Las anotaciones con
  caracteres fuera de ese rango se **omiten** (no rompen el PDF) y vuelven
  en el campo `omitidas` de la respuesta para avisarle al usuario. Ver
  `assets/README.md`.
- **PDFs de varias páginas subidos por el usuario.** Hoy el editor asume un
  documento de una página que nació como imagen. Editar un PDF ajeno
  requiere renderizar sus páginas para mostrarlas, que es trabajo aparte.
- **Mover un elemento ya puesto.** Se coloca al tocar y se puede deshacer,
  pero todavía no se arrastra.
- **Recorte y enderezado de la foto.** Sin implementar: la captura se sube
  tal cual sale de la cámara.
