#!/usr/bin/env node
'use strict';

/**
 * Banco de pruebas del scanner contra ground truth (paso 1.6).
 *
 * Corre el detector compuesto de producto sobre cada fixture y compara el
 * quad devuelto con el perímetro real anotado a mano, midiendo IoU.
 *
 *   node scripts/scanner-fixtures.js
 *
 * Además del veredicto, imprime el diagnóstico de DocQuad por separado
 * (su propio quad, su IoU y sus z por esquina) aunque sus guardrails lo
 * hayan descartado. Eso es a propósito: es el dato que hace falta para
 * recalibrar `PEAK_SIGMA_THRESHOLD` con evidencia en vez de a ojo, y no
 * se puede juntar si el CI solo dice "pasó / no pasó".
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const { FIXTURES } = require('../scanner/fixtures/manifest');
const { iou } = require('../scanner/fixtures/iou');
const { derivarDocumentoChico } = require('../scanner/fixtures/derivar');
const scanner = require('../services/docquad');
const { DocQuadDetector } = require('../scanner/docquad/detector');

const CACHE = path.join(process.cwd(), '.cache', 'scanner-fixtures');

function descargar(url, redirecciones = 0) {
  if (redirecciones > 5) return Promise.reject(new Error('demasiados_redirects'));
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'TapptScan-Fixtures/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          resolve(descargar(new URL(res.headers.location, url).toString(), redirecciones + 1));
          return;
        }
        if (res.statusCode !== 200) {
          const status = res.statusCode;
          res.resume();
          reject(new Error(`http_${status}`));
          return;
        }
        const trozos = [];
        res.on('data', (c) => trozos.push(c));
        res.on('end', () => resolve(Buffer.concat(trozos)));
      })
      .on('error', reject);
  });
}

async function asegurarFixture(fixture, yaResueltos) {
  // Fixture derivado: se construye a partir de otro ya resuelto, junto con
  // su ground truth transformado. No se descarga nada.
  if (fixture.derivadoDe) {
    const base = yaResueltos.get(fixture.derivadoDe);
    if (!base) throw new Error(`fixture base no resuelto: ${fixture.derivadoDe}`);
    const { buffer, groundTruth } = await derivarDocumentoChico(
      base.buffer,
      base.groundTruth,
      fixture.factor
    );
    return { buffer, groundTruth };
  }

  const destino = path.join(CACHE, fixture.archivo);
  if (fs.existsSync(destino) && fs.statSync(destino).size > 0) {
    return { buffer: fs.readFileSync(destino), groundTruth: fixture.groundTruth };
  }
  fs.mkdirSync(CACHE, { recursive: true });
  const buffer = await descargar(fixture.url);
  fs.writeFileSync(destino, buffer);
  return { buffer, groundTruth: fixture.groundTruth };
}

function fmt(n, d = 3) {
  return Number.isFinite(n) ? n.toFixed(d) : '—';
}

let detectorDocQuad = null;

// DocQuad crudo, saltándose los guardrails del compuesto: interesa ver su
// quad aunque el producto lo haya descartado.
async function diagnosticoDocQuad(buffer) {
  try {
    if (!detectorDocQuad) detectorDocQuad = await new DocQuadDetector().init();
    return await detectorDocQuad.detectarBuffer(buffer);
  } catch (err) {
    return { error: err.message };
  }
}

(async () => {
  await scanner.prepararMotores();

  const filas = [];
  const resueltos = new Map();
  let fallos = 0;

  for (const fixture of FIXTURES) {
    const { buffer, groundTruth } = await asegurarFixture(fixture, resueltos);
    resueltos.set(fixture.id, { buffer, groundTruth });
    const resultado = await scanner.detectarDocumento(buffer);
    const dq = await diagnosticoDocQuad(buffer);

    const valorIoU = resultado.esquinas ? iou(resultado.esquinas, groundTruth) : 0;
    const iouDocQuad = dq?.corners ? iou(dq.corners, groundTruth) : null;

    // En un fixture ya recortado el documento ES el cuadro completo, así que
    // "no recortar" es la respuesta correcta del producto: vale tanto
    // devolver el marco entero como no devolver quad. Exigirle un quad más
    // chico —como hacía el CI viejo— es pedirle que se equivoque.
    const ok =
      fixture.tipo === 'recortado'
        ? !resultado.confiable || valorIoU >= fixture.minIoU
        : valorIoU >= fixture.minIoU && resultado.confiable;

    if (!ok) fallos++;

    filas.push({
      id: fixture.id,
      tipo: fixture.tipo,
      ok,
      fuente: resultado.fuente,
      iou: valorIoU,
      confiable: resultado.confiable,
      acuerdo: resultado.acuerdoIoU,
      esquinas: Boolean(resultado.esquinas),
      iouDocQuad,
      zDocQuad: dq?.confidenceZ || null,
      razonDocQuad: dq?.suspiciousReason || null,
      maskProb: dq?.mask?.meanProb ?? null,
      maskArea: dq?.mask?.areaGt05 ?? null,
      iouCornersMask:
        dq?.candidates?.corners && dq?.candidates?.mask
          ? iou(dq.candidates.corners, dq.candidates.mask)
          : null,
      areaDocQuad: dq?.area ?? null,
    });
  }

  console.log('\n== Banco de fixtures del scanner ==\n');
  for (const f of filas) {
    console.log(
      `${f.ok ? 'OK  ' : 'FALLA'} ${f.id.padEnd(24)} tipo=${f.tipo.padEnd(9)} ` +
        `fuente=${String(f.fuente).padEnd(15)} IoU=${fmt(f.iou)} ` +
        `confiable=${f.confiable} acuerdo=${fmt(f.acuerdo)}`
    );
    console.log(
      `      docquad: IoU=${fmt(f.iouDocQuad)} ` +
        `z=[${(f.zDocQuad || []).map((z) => fmt(z, 2)).join(', ')}] ` +
        `descartado_por=${f.razonDocQuad || '—'}`
    );
    console.log(
      `      mask: meanProb=${fmt(f.maskProb)} areaGt05=${f.maskArea ?? '—'} ` +
        `IoU(corners,mask)=${fmt(f.iouCornersMask)} areaQuad=${fmt(f.areaDocQuad)}`
    );
  }

  console.log(
    `\n${filas.length - fallos}/${filas.length} fixtures OK` +
      (fallos ? ` — ${fallos} con fallo\n` : '\n')
  );

  process.exit(fallos ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
