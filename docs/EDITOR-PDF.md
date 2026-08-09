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

## Cómo entra un documento

Tres caminos, todos a la misma tubería (`services/procesarDocumento.js`):

| Camino | Para qué | Formatos |
|---|---|---|
| Foto por WhatsApp | El atajo rápido: escanear al vuelo | imagen |
| **PDF reenviado por WhatsApp** | Te llega un PDF en otro chat y lo reenvías a TapptScan para firmarlo | PDF |
| **Importar desde la app** | Trabajo con calma: archivos del teléfono, iCloud, Drive, la galería | PDF e imagen |

El archivo se sube a Drive **tal como llegó**: si es PDF se conserva el PDF,
no se aplasta a imagen. Para clasificarlo con Claude se rasteriza la primera
página, porque el modelo necesita ver algo.

## Qué hace el editor

1. La app pide una página al backend (`GET /api/documentos/:id/pagina/:n`).
   Si el original es PDF, el backend lo rasteriza con `pdf.js` y devuelve un
   PNG; si es imagen, la manda tal cual. El backend no guarda copia: baja de
   Drive, convierte y responde.
2. El usuario coloca elementos tocando el documento. Cada anotación guarda
   su página y **coordenadas fraccionarias (0-1) con origen
   arriba-izquierda**, así que no dependen del tamaño de pantalla.
3. Al guardar (`POST /api/documentos/:id/editar`), el backend baja el
   original otra vez y hornea las anotaciones **sobre el PDF original** con
   `pdf-lib` — no sobre la imagen rasterizada. Eso conserva la calidad y la
   capa de texto del documento. Si el original era imagen, se envuelve en un
   PDF de una página. El resultado se sube al Drive del usuario.

La rasterización es solo para *mostrar*. Lo que se firma es el original.

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
- **Reemplazar texto existente de un PDF nativo.** No implementado. Se puede
  tapar y escribir encima (`tapar` + `texto`), que es lo que hacen las apps
  del mercado, pero no editar el texto en su sitio con su misma fuente —
  por las razones de la sección anterior.
- **Mover un elemento ya puesto.** Se coloca al tocar y se puede deshacer,
  pero todavía no se arrastra.
- **Peso de los PDF grandes.** Las páginas viajan en base64 dentro de JSON
  (límite de 25 MB en Express). Un PDF de muchas páginas o muy pesado puede
  ir lento; falta paginar o pasar a subida binaria.
- **Recorte y enderezado de la foto.** Sin implementar: la captura se sube
  tal cual sale de la cámara.
