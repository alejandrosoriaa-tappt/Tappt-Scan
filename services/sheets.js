const { google } = require('googleapis');
const supabase = require('./supabase');
const drive = require('./drive');

/**
 * Hoja de gastos en el Drive del usuario.
 *
 * Mismo principio de privacidad que los documentos: el archivo de control
 * vive en SU Drive, no en nuestros servidores. Nosotros solo guardamos su id.
 *
 * Se usa el scope `drive.file` que ya tenemos — alcanza para la API de
 * Sheets porque la hoja la creamos nosotros. No hace falta pedir el scope
 * de spreadsheets, que nos metería en el carril de revisión de Google
 * (ver `docs/GOOGLE-DRIVE.md`).
 */

const NOMBRE_HOJA = 'TapptScan · Gastos';

const ENCABEZADOS = [
  'Fecha',
  'Comercio',
  'Concepto',
  'Categoría',
  'Monto',
  'Moneda',
  'Proyecto',
  'Archivo',
  'Link',
];

function clientes(tokens) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials(tokens);

  return {
    sheets: google.sheets({ version: 'v4', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

async function crearHoja(usuario) {
  const { sheets, drive: driveApi } = clientes(usuario.drive_tokens);

  const { data: hoja } = await sheets.spreadsheets.create({
    resource: {
      properties: { title: NOMBRE_HOJA },
      sheets: [{ properties: { title: 'Gastos' } }],
    },
    fields: 'spreadsheetId',
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: hoja.spreadsheetId,
    range: 'Gastos!A1',
    valueInputOption: 'RAW',
    resource: { values: [ENCABEZADOS] },
  });

  // La hoja nace en la raíz del Drive; se mueve dentro de TapptScan/.
  const raizId = usuario.drive_raiz_id || (await drive.ensureRaiz(usuario.drive_tokens));
  const { data: archivo } = await driveApi.files.get({
    fileId: hoja.spreadsheetId,
    fields: 'parents',
  });

  await driveApi.files.update({
    fileId: hoja.spreadsheetId,
    addParents: raizId,
    removeParents: (archivo.parents || []).join(','),
    fields: 'id',
  });

  await supabase
    .from('scan_users')
    .update({ gastos_sheet_id: hoja.spreadsheetId })
    .eq('id', usuario.id);

  return hoja.spreadsheetId;
}

async function idDeHoja(usuario) {
  return usuario.gastos_sheet_id || crearHoja(usuario);
}

/**
 * Agrega un renglón por cada gasto escaneado.
 *
 * Se llama sin `await` desde la tubería: que falle la hoja no debe impedir
 * que el documento se guarde. Por eso los errores se registran y se tragan.
 */
async function registrarGasto(usuario, documento) {
  if (!documento?.es_gasto || documento.monto == null) return null;

  try {
    const hojaId = await idDeHoja(usuario);
    const { sheets } = clientes(usuario.drive_tokens);

    await sheets.spreadsheets.values.append({
      spreadsheetId: hojaId,
      range: 'Gastos!A:I',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [
          [
            documento.fecha || '',
            documento.emisor || '',
            documento.concepto || '',
            documento.categoria_gasto || '',
            documento.monto,
            documento.moneda || '',
            documento.proyecto || '',
            documento.nombre_archivo || '',
            documento.drive_link || '',
          ],
        ],
      },
    });

    return hojaId;
  } catch (err) {
    console.error('[sheets] no se pudo registrar el gasto', err.message);
    return null;
  }
}

module.exports = { registrarGasto, crearHoja, idDeHoja, NOMBRE_HOJA };
