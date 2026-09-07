const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const {
  verificar,
  leerManifiesto,
  CLASE_ESCANER,
  CLASE_MLKIT,
} = require('../scripts/verificar-apk.js');

// --- Generador de AndroidManifest binario para las pruebas ----------------
// El manifiesto de un APK va en AXML, no en texto. Para probar el lector sin
// depender de un APK real se arma uno mínimo aquí.

function poolDeCadenas(cadenas) {
  const datos = [];
  const offsets = [];
  let cursor = 0;
  for (const cadena of cadenas) {
    offsets.push(cursor);
    const buffer = Buffer.alloc(2 + cadena.length * 2 + 2);
    buffer.writeUInt16LE(cadena.length, 0);
    buffer.write(cadena, 2, 'utf16le');
    datos.push(buffer);
    cursor += buffer.length;
  }
  const cuerpo = Buffer.concat(datos);
  const encabezado = Buffer.alloc(28 + offsets.length * 4);
  const stringsStart = encabezado.length;
  const tamano = encabezado.length + cuerpo.length;
  encabezado.writeUInt16LE(0x0001, 0);
  encabezado.writeUInt16LE(28, 2);
  encabezado.writeUInt32LE(tamano, 4);
  encabezado.writeUInt32LE(cadenas.length, 8);
  encabezado.writeUInt32LE(0, 12);
  encabezado.writeUInt32LE(0, 16); // sin UTF8_FLAG → UTF-16
  encabezado.writeUInt32LE(stringsStart, 20);
  encabezado.writeUInt32LE(0, 24);
  offsets.forEach((offset, i) => encabezado.writeUInt32LE(offset, 28 + i * 4));
  return Buffer.concat([encabezado, cuerpo]);
}

function elemento(indiceNombre, atributos) {
  const buffer = Buffer.alloc(36 + atributos.length * 20);
  buffer.writeUInt16LE(0x0102, 0);
  buffer.writeUInt16LE(16, 2);
  buffer.writeUInt32LE(buffer.length, 4);
  buffer.writeUInt32LE(1, 8); // línea
  buffer.writeUInt32LE(0xffffffff, 12); // comentario
  buffer.writeUInt32LE(0xffffffff, 16); // namespace
  buffer.writeUInt32LE(indiceNombre, 20);
  buffer.writeUInt16LE(20, 24); // attributeStart
  buffer.writeUInt16LE(20, 26); // attributeSize
  buffer.writeUInt16LE(atributos.length, 28);
  atributos.forEach(({ nombre, tipo, dato }, i) => {
    const base = 36 + i * 20;
    buffer.writeUInt32LE(0xffffffff, base);
    buffer.writeUInt32LE(nombre, base + 4);
    buffer.writeUInt32LE(0xffffffff, base + 8);
    buffer.writeUInt16LE(8, base + 12);
    buffer[base + 14] = 0;
    buffer[base + 15] = tipo;
    buffer.writeUInt32LE(dato, base + 16);
  });
  return buffer;
}

function manifiestoBinario({ paquete, versionName, versionCode, permisos }) {
  const cadenas = ['package', 'versionCode', 'versionName', 'name', 'manifest', 'uses-permission', paquete, versionName, ...permisos];
  const indice = (valor) => cadenas.indexOf(valor);
  const TIPO_CADENA = 0x03;
  const TIPO_ENTERO = 0x10;

  const cuerpo = [
    poolDeCadenas(cadenas),
    elemento(indice('manifest'), [
      { nombre: indice('package'), tipo: TIPO_CADENA, dato: indice(paquete) },
      { nombre: indice('versionCode'), tipo: TIPO_ENTERO, dato: versionCode },
      { nombre: indice('versionName'), tipo: TIPO_CADENA, dato: indice(versionName) },
    ]),
    ...permisos.map((permiso) => elemento(indice('uses-permission'), [
      { nombre: indice('name'), tipo: TIPO_CADENA, dato: indice(permiso) },
    ])),
  ];

  const contenido = Buffer.concat(cuerpo);
  const encabezado = Buffer.alloc(8);
  encabezado.writeUInt16LE(0x0003, 0);
  encabezado.writeUInt16LE(8, 2);
  encabezado.writeUInt32LE(8 + contenido.length, 4);
  return Buffer.concat([encabezado, contenido]);
}

function apkFalso({ conEscaner = true, conMlkit = true, versionCode = 9, versionName = '0.1.1', permisos = ['android.permission.CAMERA'] } = {}) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'apk-falso-'));
  const dex = [
    'dex\n035\0',
    conEscaner ? CLASE_ESCANER : 'Lalgo/Otro;',
    conMlkit ? CLASE_MLKIT : 'Lotro/Mas;',
  ].join('\0');
  fs.writeFileSync(path.join(carpeta, 'classes.dex'), dex);
  fs.writeFileSync(
    path.join(carpeta, 'AndroidManifest.xml'),
    manifiestoBinario({ paquete: 'lat.tappt.scan', versionName, versionCode, permisos })
  );
  fs.mkdirSync(path.join(carpeta, 'assets'));
  fs.writeFileSync(
    path.join(carpeta, 'assets/index.android.bundle'),
    'var API="https://scan.tappt.lat";requireNativeModule("TapptDocumentScanner");'
  );

  const apk = path.join(carpeta, 'app.apk');
  execFileSync('zip', ['-qr', apk, 'classes.dex', 'AndroidManifest.xml', 'assets'], { cwd: carpeta });
  return apk;
}

test('lee paquete, versión y permisos de un AndroidManifest binario', () => {
  const manifiesto = leerManifiesto(manifiestoBinario({
    paquete: 'lat.tappt.scan',
    versionName: '0.1.1',
    versionCode: 9,
    permisos: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'],
  }));

  assert.equal(manifiesto.package, 'lat.tappt.scan');
  assert.equal(manifiesto.versionName, '0.1.1');
  assert.equal(manifiesto.versionCode, 9);
  assert.deepEqual(manifiesto.permisos, ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO']);
});

test('un artefacto correcto pasa las comprobaciones duras', () => {
  const apk = apkFalso();
  const { duros, informe } = verificar({ archivo: apk, version: '0.1.1', codigo: 9 });

  assert.deepEqual(duros, []);
  assert.match(informe.join('\n'), /escáner {4}✅/);
  assert.match(informe.join('\n'), /scan\.tappt\.lat/);
});

test('detecta la falla de v8: el dex sin la clase del escáner', () => {
  const apk = apkFalso({ conEscaner: false });
  const { duros } = verificar({ archivo: apk });

  assert.equal(duros.length, 1);
  assert.match(duros[0], /FALTA la clase nativa del escáner/);
});

test('detecta ML Kit ausente y versiones que no corresponden', () => {
  const apk = apkFalso({ conMlkit: false, versionCode: 8, versionName: '0.1.0' });
  const { duros } = verificar({ archivo: apk, version: '0.1.1', codigo: 9 });

  assert.equal(duros.length, 3);
  assert.match(duros.join('\n'), /ML Kit/);
  assert.match(duros.join('\n'), /versionName 0\.1\.0 ≠ 0\.1\.1/);
  assert.match(duros.join('\n'), /versionCode 8 ≠ 9/);
});

test('avisa de los permisos sin uso conocido en el código', () => {
  const apk = apkFalso({ permisos: ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'] });
  const { avisos, duros } = verificar({ archivo: apk });

  assert.deepEqual(duros, []);
  assert.match(avisos.join('\n'), /RECORD_AUDIO/);
});
