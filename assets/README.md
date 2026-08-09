# assets

## `fuente-unicode.ttf` (no incluida — hay que ponerla)

`services/pdf.js` busca aquí un TTF Unicode para incrustarlo en los PDF.

**Por qué hace falta.** Las fuentes estándar de PDF (Helvetica y compañía)
usan la codificación WinAnsi: cubren el alfabeto latino con acentos
(`áéíóú ñ ¿¡`) pero nada más. Cualquier carácter fuera de ese rango —
emojis, comillas tipográficas, símbolos de moneda poco comunes, alfabetos
no latinos — hace que `pdf-lib` falle al guardar.

Mientras el archivo no exista, `aplicarAnotaciones` **omite** esas
anotaciones en vez de romper el PDF, y las devuelve en `omitidas` para que
la app pueda avisarle al usuario.

**Qué poner.** Un TTF con buena cobertura Unicode, por ejemplo
[Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans) (licencia
SIL OFL, se puede redistribuir). Descargar `NotoSans-Regular.ttf` y
guardarlo aquí con el nombre `fuente-unicode.ttf`.

**Los emojis a color son otra cosa.** Ni con Noto Sans se pintan a color:
`pdf-lib` no rasteriza fuentes de color (COLR/CBDT), así que un emoji sale
en negro como glifo plano. Para que salga a color hay que mandarlo como
imagen PNG desde la app — el tipo de anotación `imagen` ya sirve para eso.
