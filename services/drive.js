const { google } = require('googleapis');

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

async function downloadFile(tokens, fileId) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });

  const { data } = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(data);
}

module.exports = {
  authUrl,
  exchangeCode,
  ensureRaiz,
  ensureRuta,
  listarCarpeta,
  uploadFile,
  downloadFile,
  ROOT_FOLDER_NAME,
};
