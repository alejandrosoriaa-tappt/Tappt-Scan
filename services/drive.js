const { google } = require('googleapis');
const taxonomia = require('./taxonomia');

const ROOT_FOLDER_NAME = 'TapptScan';

function oauthClient(tokens) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  if (tokens) client.setCredentials(tokens);
  return client;
}

function authUrl(state) {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state,
  });
}

async function exchangeCode(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

async function findOrCreateFolder(drive, name, parentId) {
  const q = [
    `name = '${name.replace(/'/g, "\\'")}'`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
    parentId ? `'${parentId}' in parents` : "'root' in parents",
  ].join(' and ');

  const { data } = await drive.files.list({ q, fields: 'files(id, name)' });
  if (data.files?.length) return data.files[0].id;

  const { data: created } = await drive.files.create({
    resource: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });
  return created.id;
}

// Carpeta madre TapptScan/ en la raíz del Drive del usuario.
async function ensureRaiz(tokens) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });
  return findOrCreateFolder(drive, ROOT_FOLDER_NAME);
}

/**
 * Crea el árbol completo de `services/taxonomia.js` al conectar Drive, para
 * que el usuario vea sus carpetas listas desde el primer momento en lugar
 * de una carpeta vacía que se va llenando sola.
 *
 * Las secciones se crean en paralelo, y las subcarpetas de cada sección
 * también, pero las subcarpetas esperan a que exista su padre. Es
 * idempotente: si el usuario ya tiene el árbol, no duplica nada.
 */
async function ensureEstructura(tokens) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });

  const raizId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);

  await Promise.all(
    taxonomia.ESTRUCTURA.map(async (seccion) => {
      const seccionId = await findOrCreateFolder(drive, seccion.carpeta, raizId);
      await Promise.all(
        seccion.sub.map((sub) => findOrCreateFolder(drive, sub.carpeta, seccionId))
      );
    })
  );

  return raizId;
}

/**
 * Crea (o reutiliza) una ruta anidada bajo TapptScan/ y devuelve el id de
 * la última carpeta.
 *
 *   ensureRuta(tokens, ['Casa', 'Servicios', 'CFE', '2026'])
 *   →  TapptScan/Casa/Servicios/CFE/2026
 *
 * Va nivel por nivel porque la API de Drive no crea rutas de un golpe.
 */
async function ensureRuta(tokens, tramos = []) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });

  let padreId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
  for (const tramo of tramos) {
    padreId = await findOrCreateFolder(drive, tramo, padreId);
  }
  return padreId;
}

// Contenido de una carpeta: subcarpetas y archivos, para el explorador.
async function listarCarpeta(tokens, carpetaId) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });

  const { data } = await drive.files.list({
    q: `'${carpetaId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
    orderBy: 'folder,name',
    pageSize: 200,
  });

  return (data.files || []).map((archivo) => ({
    id: archivo.id,
    nombre: archivo.name,
    esCarpeta: archivo.mimeType === 'application/vnd.google-apps.folder',
    modificado: archivo.modifiedTime,
    link: archivo.webViewLink,
  }));
}

// Cuota de almacenamiento del usuario, para la barra de "6.2 GB de 15 GB".
// `about.get` está permitido con el scope drive.file.
async function usoDeAlmacenamiento(tokens) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });

  const { data } = await drive.about.get({ fields: 'storageQuota' });
  const cuota = data.storageQuota || {};

  const limite = Number(cuota.limit) || null;
  const usado = Number(cuota.usage) || 0;

  return {
    usado,
    limite,
    porcentaje: limite ? Math.round((usado / limite) * 100) : null,
  };
}

async function uploadFile(tokens, { folderId, name, mimeType, buffer }) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });

  const { Readable } = require('stream');
  const { data } = await drive.files.create({
    resource: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });
  return data;
}

/**
 * Mueve y/o renombra un archivo ya subido. Se usa cuando el usuario corrige
 * la clasificación por WhatsApp ("es otra cosa"): el archivo NO se vuelve a
 * subir, solo cambia de carpeta y de nombre, así que conserva su
 * `drive_file_id` y cualquier link que ya se haya compartido.
 *
 * Drive exige mandar el padre viejo en `removeParents` para sacarlo de ahí;
 * si solo se agrega el nuevo, el archivo queda en las DOS carpetas.
 */
async function moverArchivo(tokens, { fileId, carpetaDestinoId, nuevoNombre, carpetaOrigenId }) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });

  // Si no nos dijeron de dónde sale, se lo preguntamos a Drive: un archivo
  // puede tener varios padres y quitarlos todos es lo que deja el estado
  // limpio.
  let origen = carpetaOrigenId;
  if (!origen) {
    const { data } = await drive.files.get({ fileId, fields: 'parents' });
    origen = (data.parents || []).join(',');
  }

  const { data } = await drive.files.update({
    fileId,
    addParents: carpetaDestinoId,
    removeParents: origen || undefined,
    resource: nuevoNombre ? { name: nuevoNombre } : {},
    fields: 'id, webViewLink',
  });
  return data;
}

async function downloadFile(tokens, fileId) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });

  const { data } = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(data);
}

/**
 * Revoca el acceso a Drive que el usuario nos dio.
 *
 * Se usa al borrar la cuenta: dejar de guardar los tokens no basta, porque
 * el permiso sigue vivo del lado de Google y el usuario lo ve listado en su
 * cuenta. Revocar de este lado lo quita de verdad.
 *
 * No lanza: es cortesía, no puede impedir que la cuenta se borre. Si el
 * token ya expiró o ya estaba revocado, Google responde 400 y da igual.
 */
async function revocarAcceso(tokens) {
  const token = tokens?.refresh_token || tokens?.access_token;
  if (!token) return false;

  try {
    await oauthClient().revokeToken(token);
    return true;
  } catch (err) {
    console.warn('[drive] no se pudo revocar el acceso:', err.message);
    return false;
  }
}

module.exports = {
  authUrl,
  exchangeCode,
  ensureRaiz,
  ensureEstructura,
  ensureRuta,
  listarCarpeta,
  usoDeAlmacenamiento,
  uploadFile,
  moverArchivo,
  downloadFile,
  revocarAcceso,
  ROOT_FOLDER_NAME,
};
