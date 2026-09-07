#!/usr/bin/env node
/**
 * Verifica un APK/AAB ANTES de instalarlo o subirlo.
 *
 * La auditoría de v5–v9 dejó una lección concreta: v8 compiló y se instaló
 * sin el módulo nativo dentro, y nadie lo supo hasta que el teléfono se
 * cerró al arrancar. Esa falla es visible en el artefacto: si la clase
 * Kotlin no está en el dex, no hace falta un dispositivo para saberlo.
 *
 * Uso:
 *   node scripts/verificar-apk.js build.apk
 *   node scripts/verificar-apk.js build.aab --version 0.1.1 --codigo 9
 *
 * Sale con código 1 si falla cualquier comprobación DURA. Las comprobaciones
 * informativas (manifiesto, bundle JS) avisan pero no tumban: leer un
 * manifiesto binario es best-effort y preferimos no bloquear por eso.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

// Descriptores tal como quedan escritos dentro del dex.
const CLASE_ESCANER = 'Llat/tappt/documentscanner/TapptDocumentScannerModule;';
const CLASE_MLKIT = 'Lcom/google/mlkit/vision/documentscanner/GmsDocumentScanning;';
const PAQUETE = 'lat.tappt.scan';
const API_PRODUCCION = 'scan.tappt.lat';

function parsearArgumentos(argv) {
  const opciones = { archivo: null, version: null, codigo: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--version') opciones.version = argv[++i];
    else if (arg === '--codigo') opciones.codigo = Number(argv[++i]);
    else if (!opciones.archivo) opciones.archivo = arg;
  }
  return opciones;
}

function listarEntradas(archivo) {
  const salida = execFileSync('unzip', ['-Z1', archivo], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return salida.split('\n').map((linea) => linea.trim()).filter(Boolean);
}

function leerEntrada(archivo, entrada) {
  return execFileSync('unzip', ['-p', archivo, entrada], { maxBuffer: 512 * 1024 * 1024 });
}

/** Busca una cadena literal dentro de los dex del artefacto. */
function buscarEnDex(archivo, entradas, aguja) {
  const dex = entradas.filter((entrada) => entrada.endsWith('.dex'));
  const encontrado = [];
  for (const entrada of dex) {
    if (leerEntrada(archivo, entrada).includes(aguja)) encontrado.push(entrada);
  }
  return { dex, encontrado };
}

// --- Manifiesto binario (AXML) -------------------------------------------
// Suficiente para leer package, versionCode, versionName y permisos. No
// pretende ser un parser completo: cualquier sorpresa se reporta como
// "no se pudo leer" en vez de romper.

const TIPO_STRING_POOL = 0x0001;
const TIPO_START_ELEMENT = 0x0102;

function leerStringPool(buffer, inicio) {
  const cantidad = buffer.readUInt32LE(inicio + 8);
  const flags = buffer.readUInt32LE(inicio + 16);
  const utf8 = (flags & (1 << 8)) !== 0;
  const stringsStart = buffer.readUInt32LE(inicio + 20);
  const cadenas = [];
  for (let i = 0; i < cantidad; i += 1) {
    const offset = inicio + stringsStart + buffer.readUInt32LE(inicio + 28 + i * 4);
    if (utf8) {
      let cursor = offset;
      // Dos longitudes (caracteres y bytes), cada una de 1 o 2 bytes.
      for (let n = 0; n < 2; n += 1) {
        cursor += (buffer[cursor] & 0x80) !== 0 ? 2 : 1;
      }
      const bytes = (buffer[cursor - 1] & 0x80) !== 0
        ? ((buffer[cursor - 2] & 0x7f) << 8) | buffer[cursor - 1]
        : buffer[cursor - 1];
      cadenas.push(buffer.toString('utf8', cursor, cursor + bytes));
    } else {
      const largo = buffer.readUInt16LE(offset) & 0x7fff;
      cadenas.push(buffer.toString('utf16le', offset + 2, offset + 2 + largo * 2));
    }
  }
  return cadenas;
}

function leerManifiesto(buffer) {
  const cadenas = [];
  let pool = null;
  let cursor = 8; // salta el encabezado del archivo
  const datos = { package: null, versionCode: null, versionName: null, permisos: [] };

  while (cursor + 8 <= buffer.length) {
    const tipo = buffer.readUInt16LE(cursor);
    const tamano = buffer.readUInt32LE(cursor + 4);
    if (tamano < 8 || cursor + tamano > buffer.length) break;

    if (tipo === TIPO_STRING_POOL && !pool) {
      pool = leerStringPool(buffer, cursor);
      cadenas.push(...pool);
    } else if (tipo === TIPO_START_ELEMENT && pool) {
      const nombre = pool[buffer.readUInt32LE(cursor + 20)];
      // El encabezado de un nodo XML mide 16 bytes; attributeStart cuenta desde ahí.
      const inicioAttrs = cursor + 16 + buffer.readUInt16LE(cursor + 24);
      const cantidad = buffer.readUInt16LE(cursor + 28);
      const attrs = {};
      for (let i = 0; i < cantidad; i += 1) {
        const base = inicioAttrs + i * 20;
        const clave = pool[buffer.readUInt32LE(base + 4)];
        const tipoDato = buffer[base + 15];
        const dato = buffer.readUInt32LE(base + 16);
        attrs[clave] = tipoDato === 0x03 ? pool[dato] : dato;
      }
      if (nombre === 'manifest') {
        datos.package = attrs.package ?? null;
        datos.versionCode = typeof attrs.versionCode === 'number' ? attrs.versionCode : null;
        datos.versionName = typeof attrs.versionName === 'string' ? attrs.versionName : null;
      } else if (nombre === 'uses-permission' && typeof attrs.name === 'string') {
        datos.permisos.push(attrs.name);
      }
    }
    cursor += tamano;
  }
  if (!pool) throw new Error('sin string pool');
  return datos;
}

// --- Comprobaciones -------------------------------------------------------

function verificar(opciones) {
  const archivo = opciones.archivo;
  const bytes = fs.statSync(archivo).size;
  const sha = crypto.createHash('sha256').update(fs.readFileSync(archivo)).digest('hex');
  const entradas = listarEntradas(archivo);
  const esAab = path.extname(archivo).toLowerCase() === '.aab';

  const duros = [];
  const avisos = [];
  const informe = [];

  informe.push(`artefacto  ${path.basename(archivo)} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
  informe.push(`sha256     ${sha}`);
  informe.push(`entradas   ${entradas.length}`);

  // 1. La clase del escáner tiene que estar en el dex. Es la falla de v8.
  const escaner = buscarEnDex(archivo, entradas, CLASE_ESCANER);
  if (escaner.dex.length === 0) {
    duros.push('el artefacto no contiene ningún .dex — ¿es realmente un APK/AAB?');
  } else if (escaner.encontrado.length === 0) {
    duros.push(`FALTA la clase nativa del escáner (${CLASE_ESCANER}) — es exactamente la falla de v8`);
  } else {
    informe.push(`escáner    ✅ ${CLASE_ESCANER} en ${escaner.encontrado.join(', ')}`);
  }

  // 2. Sin ML Kit la clase existe pero no abre nada.
  const mlkit = buscarEnDex(archivo, entradas, CLASE_MLKIT);
  if (escaner.dex.length > 0 && mlkit.encontrado.length === 0) {
    duros.push(`FALTA la dependencia de ML Kit (${CLASE_MLKIT})`);
  } else if (mlkit.encontrado.length > 0) {
    informe.push(`ml kit     ✅ ${mlkit.encontrado.join(', ')}`);
  }

  // 3. Manifiesto: paquete, versión y permisos. Informativo.
  const entradaManifiesto = entradas.find((entrada) => entrada === 'AndroidManifest.xml' || entrada === 'base/manifest/AndroidManifest.xml');
  if (!entradaManifiesto) {
    avisos.push('no se encontró AndroidManifest.xml dentro del artefacto');
  } else if (esAab) {
    avisos.push('el manifiesto de un .aab va en protobuf: se omite. Verificar versión con bundletool o sobre el APK universal');
  } else {
    try {
      const manifiesto = leerManifiesto(leerEntrada(archivo, entradaManifiesto));
      informe.push(`paquete    ${manifiesto.package}`);
      informe.push(`versión    ${manifiesto.versionName} (${manifiesto.versionCode})`);
      informe.push(`permisos   ${manifiesto.permisos.join(', ') || '—'}`);

      if (manifiesto.package && manifiesto.package !== PAQUETE) {
        duros.push(`el paquete es ${manifiesto.package}, se esperaba ${PAQUETE}`);
      }
      if (opciones.version && manifiesto.versionName !== opciones.version) {
        duros.push(`versionName ${manifiesto.versionName} ≠ ${opciones.version}`);
      }
      if (opciones.codigo && manifiesto.versionCode !== opciones.codigo) {
        duros.push(`versionCode ${manifiesto.versionCode} ≠ ${opciones.codigo}`);
      }
      const sobrantes = manifiesto.permisos.filter((permiso) => /RECORD_AUDIO|READ_EXTERNAL_STORAGE/.test(permiso));
      if (sobrantes.length > 0) {
        avisos.push(`permisos sin uso conocido en el código: ${sobrantes.join(', ')}`);
      }
    } catch (error) {
      avisos.push(`no se pudo leer el manifiesto binario (${error.message}); usar aapt2 dump badging si hace falta`);
    }
  }

  // 4. Bundle JS: que el backend embebido sea el de producción y que el
  //    puente al módulo nativo siga presente después de minificar.
  const bundle = entradas.find((entrada) => entrada.endsWith('index.android.bundle'));
  if (!bundle) {
    avisos.push('no se encontró index.android.bundle (¿build de desarrollo con Metro?)');
  } else {
    const contenido = leerEntrada(archivo, bundle).toString('utf8');
    if (contenido.includes(API_PRODUCCION)) informe.push(`backend    ✅ ${API_PRODUCCION} embebido`);
    else avisos.push(`el bundle no menciona ${API_PRODUCCION}: revisar EXPO_PUBLIC_API_URL del perfil de EAS`);
    if (!contenido.includes('TapptDocumentScanner')) {
      avisos.push('el bundle no menciona TapptDocumentScanner: el JS del escáner podría no haberse incluido');
    }
  }

  return { informe, avisos, duros };
}

function principal() {
  const opciones = parsearArgumentos(process.argv.slice(2));
  if (!opciones.archivo) {
    console.error('uso: node scripts/verificar-apk.js <archivo.apk|archivo.aab> [--version 0.1.1] [--codigo 9]');
    process.exit(2);
  }
  if (!fs.existsSync(opciones.archivo)) {
    console.error(`no existe: ${opciones.archivo}`);
    process.exit(2);
  }

  const { informe, avisos, duros } = verificar(opciones);
  console.log(informe.join('\n'));
  for (const aviso of avisos) console.log(`⚠️  ${aviso}`);
  for (const fallo of duros) console.log(`❌ ${fallo}`);
  console.log(duros.length === 0 ? '\n✅ el artefacto pasa las comprobaciones duras' : '\n❌ NO instalar ni publicar este artefacto');
  process.exit(duros.length === 0 ? 0 : 1);
}

if (require.main === module) principal();

module.exports = { verificar, leerManifiesto, CLASE_ESCANER, CLASE_MLKIT };
