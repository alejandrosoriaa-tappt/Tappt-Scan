const canvasLib = require('@napi-rs/canvas');

const ANCHO_ANALISIS = 400; // el detector trabaja en chico: más rápido y menos ruido

async function cargar(buffer) {
  return canvasLib.loadImage(buffer);
}

function pixelesDe(imagen, ancho, alto) {
  const canvas = canvasLib.createCanvas(ancho, alto);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  return ctx.getImageData(0, 0, ancho, alto).data;
}

function aGrises(datos, total) {
  const grises = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const j = i * 4;
    // Luma perceptual (Rec. 601).
    grises[i] = (datos[j] * 0.299 + datos[j + 1] * 0.587 + datos[j + 2] * 0.114) | 0;
  }
  return grises;
}

// Otsu: parte el histograma en dos maximizando la varianza entre clases.
// Sirve para separar "papel" (claro) de "mesa" (oscuro) sin fijar un umbral.
function umbralOtsu(grises) {
  const histograma = new Array(256).fill(0);
  for (const valor of grises) histograma[valor]++;

  const total = grises.length;
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * histograma[i];

  let sumaFondo = 0;
  let pesoFondo = 0;
  let mejorVarianza = -1;
  let mejorUmbral = 128;

  for (let t = 0; t < 256; t++) {
    pesoFondo += histograma[t];
    if (pesoFondo === 0) continue;

    const pesoFrente = total - pesoFondo;
    if (pesoFrente === 0) break;

    sumaFondo += t * histograma[t];
    const mediaFondo = sumaFondo / pesoFondo;
    const mediaFrente = (suma - sumaFondo) / pesoFrente;
    const varianza = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) ** 2;

    if (varianza > mejorVarianza) {
      mejorVarianza = varianza;
      mejorUmbral = t;
    }
  }

  return mejorUmbral;
}

/**
 * Detecta las cuatro esquinas del documento dentro de la foto.
 *
 * Es una heurística, no visión por computadora seria: separa claro/oscuro
 * con Otsu y toma los extremos de x+y y x−y sobre la región clara. Funciona
 * bien en el caso normal (papel claro sobre superficie más oscura) y se
 * cae con fondos claros o documentos oscuros — por eso la app siempre deja
 * ajustar las esquinas a mano.
 *
 * Devuelve fracciones 0-1 en orden: superior-izq, superior-der,
 * inferior-der, inferior-izq.
 */
async function detectarDocumento(buffer) {
  const imagen = await cargar(buffer);
  const escala = ANCHO_ANALISIS / imagen.width;
  const ancho = Math.max(1, Math.round(imagen.width * escala));
  const alto = Math.max(1, Math.round(imagen.height * escala));

  const grises = aGrises(pixelesDe(imagen, ancho, alto), ancho * alto);
  const umbral = umbralOtsu(grises);

  let minSuma = Infinity;
  let maxSuma = -Infinity;
  let minResta = Infinity;
  let maxResta = -Infinity;
  let supIzq = null;
  let infDer = null;
  let supDer = null;
  let infIzq = null;
  let claros = 0;

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (grises[y * ancho + x] <= umbral) continue;
      claros++;

      const suma = x + y;
      const resta = x - y;

      if (suma < minSuma) (minSuma = suma), (supIzq = { x, y });
      if (suma > maxSuma) (maxSuma = suma), (infDer = { x, y });
      if (resta > maxResta) (maxResta = resta), (supDer = { x, y });
      if (resta < minResta) (minResta = resta), (infIzq = { x, y });
    }
  }

  // Si el documento ocupa casi todo o casi nada, la detección no aporta:
  // mejor devolver la imagen completa que un recorte inventado.
  const proporcion = claros / (ancho * alto);
  if (!supIzq || proporcion < 0.15 || proporcion > 0.97) {
    return {
      esquinas: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      confiable: false,
    };
  }

  const aFraccion = (p) => ({ x: p.x / ancho, y: p.y / alto });
  const esquinas = [aFraccion(supIzq), aFraccion(supDer), aFraccion(infDer), aFraccion(infIzq)];

  // Si el cuadrilátero es prácticamente la foto entera, no detectamos el
  // documento: detectamos el fondo (pasa cuando el documento es oscuro y la
  // superficie clara, al revés de lo que asume la heurística). Devolvemos el
  // marco pero sin presumir que es correcto, para que la app pida ajuste.
  return { esquinas, confiable: area(esquinas) < 0.95 };
}

// Área del cuadrilátero por la fórmula del cordón (shoelace), en fracción
// de la foto.
function area(esquinas) {
  let suma = 0;
  for (let i = 0; i < esquinas.length; i++) {
    const actual = esquinas[i];
    const siguiente = esquinas[(i + 1) % esquinas.length];
    suma += actual.x * siguiente.y - siguiente.x * actual.y;
  }
  return Math.abs(suma) / 2;
}

// Resuelve un sistema lineal por eliminación gaussiana con pivoteo parcial.
function resolver(matriz, vector) {
  const n = vector.length;
  const a = matriz.map((fila, i) => [...fila, vector[i]]);

  for (let col = 0; col < n; col++) {
    let pivote = col;
    for (let fila = col + 1; fila < n; fila++) {
      if (Math.abs(a[fila][col]) > Math.abs(a[pivote][col])) pivote = fila;
    }
    [a[col], a[pivote]] = [a[pivote], a[col]];

    if (Math.abs(a[col][col]) < 1e-12) continue;

    for (let fila = 0; fila < n; fila++) {
      if (fila === col) continue;
      const factor = a[fila][col] / a[col][col];
      for (let k = col; k <= n; k++) a[fila][k] -= factor * a[col][k];
    }
  }

  return a.map((fila, i) => fila[n] / fila[i]);
}

// Homografía que lleva los puntos `desde` a los puntos `hasta`.
function homografia(desde, hasta) {
  const matriz = [];
  const vector = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = desde[i];
    const { x: u, y: v } = hasta[i];
    matriz.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    vector.push(u);
    matriz.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    vector.push(v);
  }

  const h = resolver(matriz, vector);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function distancia(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Recorta y endereza: toma las cuatro esquinas del documento en la foto y
 * las estira a un rectángulo recto (corrección de perspectiva).
 *
 * Se hace por mapeo inverso — para cada píxel del resultado se calcula de
 * dónde viene en el original y se interpola — porque el mapeo directo deja
 * huecos.
 */
async function corregirPerspectiva(buffer, esquinasFraccion) {
  const imagen = await cargar(buffer);
  const origen = esquinasFraccion.map((e) => ({
    x: e.x * imagen.width,
    y: e.y * imagen.height,
  }));

  const [supIzq, supDer, infDer, infIzq] = origen;
  const ancho = Math.round(Math.max(distancia(supIzq, supDer), distancia(infIzq, infDer)));
  const alto = Math.round(Math.max(distancia(supIzq, infIzq), distancia(supDer, infDer)));

  if (ancho < 8 || alto < 8) throw new Error('recorte_demasiado_chico');

  const destino = [
    { x: 0, y: 0 },
    { x: ancho - 1, y: 0 },
    { x: ancho - 1, y: alto - 1 },
    { x: 0, y: alto - 1 },
  ];

  // Del destino hacia el origen: es el sentido que necesita el muestreo.
  const h = homografia(destino, origen);

  const fuente = canvasLib.createCanvas(imagen.width, imagen.height);
  const ctxFuente = fuente.getContext('2d');
  ctxFuente.drawImage(imagen, 0, 0);
  const datosFuente = ctxFuente.getImageData(0, 0, imagen.width, imagen.height).data;

  const salida = canvasLib.createCanvas(ancho, alto);
  const ctxSalida = salida.getContext('2d');
  const datosSalida = ctxSalida.createImageData(ancho, alto);

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const w = h[6] * x + h[7] * y + h[8];
      const sx = (h[0] * x + h[1] * y + h[2]) / w;
      const sy = (h[3] * x + h[4] * y + h[5]) / w;

      const destinoIndice = (y * ancho + x) * 4;

      if (sx < 0 || sy < 0 || sx >= imagen.width - 1 || sy >= imagen.height - 1) {
        datosSalida.data[destinoIndice + 3] = 255; // negro opaco fuera de rango
        continue;
      }

      // Interpolación bilineal entre los cuatro vecinos.
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;

      for (let canal = 0; canal < 3; canal++) {
        const p = (fila, columna) => datosFuente[(fila * imagen.width + columna) * 4 + canal];
        const arriba = p(y0, x0) * (1 - fx) + p(y0, x0 + 1) * fx;
        const abajo = p(y0 + 1, x0) * (1 - fx) + p(y0 + 1, x0 + 1) * fx;
        datosSalida.data[destinoIndice + canal] = (arriba * (1 - fy) + abajo * fy) | 0;
      }
      datosSalida.data[destinoIndice + 3] = 255;
    }
  }

  ctxSalida.putImageData(datosSalida, 0, 0);
  return salida.toBuffer('image/png');
}

const ANCHO_FIRMA = 900; // suficiente para el trazo de una firma, sin cargar el proceso

function hexARgb(hex) {
  const limpio = hex.replace('#', '');
  return {
    r: parseInt(limpio.slice(0, 2), 16),
    g: parseInt(limpio.slice(2, 4), 16),
    b: parseInt(limpio.slice(4, 6), 16),
  };
}

/**
 * De una foto de una firma en papel (cualquier fondo) saca solo el trazo:
 * lo recorta a su propio contorno y lo deja con fondo transparente, ya
 * teñido del color elegido — listo para pegarse sobre cualquier documento
 * sin importar de qué color sea el papel de fondo.
 *
 * Mismo principio que `detectarDocumento` (Otsu separa claro/oscuro) pero
 * al revés: aquí lo oscuro es la tinta que sí queremos conservar, no el
 * fondo.
 */
async function extraerFirma(buffer, colorHex = '#2563EB') {
  const original = await cargar(buffer);
  const escala = Math.min(1, ANCHO_FIRMA / original.width);
  const ancho = Math.max(1, Math.round(original.width * escala));
  const alto = Math.max(1, Math.round(original.height * escala));

  const datos = pixelesDe(original, ancho, alto);
  const grises = aGrises(datos, ancho * alto);
  const umbral = umbralOtsu(grises);

  const { r, g, b } = hexARgb(colorHex);
  const alfa = new Uint8ClampedArray(ancho * alto);

  let minX = ancho;
  let minY = alto;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = y * ancho + x;
      // Tinta = más oscuro que el umbral. Un margen chico evita que el
      // grano del papel o una sombra leve se cuelen como trazo.
      const esTinta = grises[i] < umbral - 10;
      alfa[i] = esTinta ? 255 : 0;
      if (esTinta) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) throw new Error('firma_no_detectada');

  // Encuadre ajustado al trazo con un margen chico, para que no quede
  // pegada al borde del PNG.
  const margen = Math.round(Math.max(ancho, alto) * 0.03);
  const recX = Math.max(0, minX - margen);
  const recY = Math.max(0, minY - margen);
  const recAncho = Math.min(ancho, maxX + margen) - recX;
  const recAlto = Math.min(alto, maxY + margen) - recY;

  const salida = canvasLib.createCanvas(recAncho, recAlto);
  const ctxSalida = salida.getContext('2d');
  const imagenSalida = ctxSalida.createImageData(recAncho, recAlto);

  for (let y = 0; y < recAlto; y++) {
    for (let x = 0; x < recAncho; x++) {
      const iOrigen = (y + recY) * ancho + (x + recX);
      const iDestino = (y * recAncho + x) * 4;
      imagenSalida.data[iDestino] = r;
      imagenSalida.data[iDestino + 1] = g;
      imagenSalida.data[iDestino + 2] = b;
      imagenSalida.data[iDestino + 3] = alfa[iOrigen];
    }
  }

  ctxSalida.putImageData(imagenSalida, 0, 0);
  return salida.toBuffer('image/png');
}

module.exports = { detectarDocumento, corregirPerspectiva, extraerFirma };
