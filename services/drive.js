const { google } = require('googleapis');

const ROOT_FOLDER_NAME = 'TapptScan';
const SUBFOLDERS = ['Identificaciones', 'Recibos', 'Contratos', 'Otros'];

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

// Crea (o reutiliza) TapptScan/ y sus subcarpetas iniciales. Devuelve un mapa
// { TapptScan: id, Identificaciones: id, ... }
async function ensureFolderStructure(tokens) {
  const auth = oauthClient(tokens);
  const drive = google.drive({ version: 'v3', auth });

  const rootId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME);
  const ids = { [ROOT_FOLDER_NAME]: rootId };
  for (const name of SUBFOLDERS) {
    ids[name] = await findOrCreateFolder(drive, name, rootId);
  }
  return ids;
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

module.exports = { authUrl, exchangeCode, ensureFolderStructure, uploadFile, ROOT_FOLDER_NAME, SUBFOLDERS };
