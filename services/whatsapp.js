const axios = require('axios');
const { AsyncLocalStorage } = require('async_hooks');
const GRAPH_BASE = 'https://graph.facebook.com/v19.0';
const AGENDA_INTERNAL_BASE = 'https://tappt-backend-production.up.railway.app/internal/scan/whatsapp';
const transportContext = new AsyncLocalStorage();

function currentTransport() {
  return transportContext.getStore() || { proxy: false };
}

function withTransport(transport, work) {
  return transportContext.run(transport, work);
}

async function postMessage(payload) {
  if (currentTransport().proxy) {
    return axios.post(`${AGENDA_INTERNAL_BASE}/messages`, payload, {
      headers: { 'x-tappt-router-secret': process.env.TAPPT_ROUTER_SECRET },
      timeout: 30000,
    });
  }
  return client().post('/messages', payload);
}
function client() {
  return axios.create({
    baseURL: `${GRAPH_BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`,
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
}
async function sendText(to, body) {
  return postMessage({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  });
}
async function sendButtons(to, bodyText, buttons) {
  try {
    return await postMessage({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: buttons.map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          })),
        },
      },
    });
  } catch (err) {
    // La confirmación de guardado no puede depender de que Meta acepte el
    // formato interactivo. Si los botones son rechazados por la cuenta,
    // sesión o capacidades del número, enviamos el mismo contenido como
    // texto simple para que el usuario siempre sepa que el archivo se guardó.
    console.warn('[whatsapp] mensaje interactivo rechazado; fallback a texto', {
      status: err.response?.status,
      data: err.response?.data,
    });
    return sendText(to, bodyText);
  }
}

async function sendUrlButton(to, bodyText, buttonText, url) {
  try {
    return await postMessage({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: bodyText },
        action: {
          name: 'cta_url',
          parameters: { display_text: buttonText, url },
        },
      },
    });
  } catch (err) {
    console.warn('[whatsapp] botón URL rechazado; fallback a enlace', {
      status: err.response?.status,
      data: err.response?.data,
    });
    return sendText(to, `${bodyText}\n${url}`);
  }
}

// Marca un mensaje entrante como leído (palomitas azules).
// Si showTyping = true, además activa el indicador de "escribiendo..."
// por hasta 25s o hasta que mandes la siguiente respuesta, lo que ocurra primero.
async function markAsRead(messageId, showTyping = false) {
  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };
  if (showTyping) {
    payload.typing_indicator = { type: 'text' };
  }
  return postMessage(payload);
}

async function getMediaUrl(mediaId) {
  if (currentTransport().proxy) return `tappt-internal-media:${mediaId}`;
  const { data } = await axios.get(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  return data.url;
}
async function downloadMedia(mediaUrl) {
  if (currentTransport().proxy && mediaUrl.startsWith('tappt-internal-media:')) {
    const mediaId = mediaUrl.slice('tappt-internal-media:'.length);
    const { data } = await axios.get(`${AGENDA_INTERNAL_BASE}/media/${encodeURIComponent(mediaId)}`, {
      headers: { 'x-tappt-router-secret': process.env.TAPPT_ROUTER_SECRET },
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    return data;
  }
  const { data } = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    responseType: 'arraybuffer',
  });
  return data;
}
module.exports = { withTransport, sendText, sendButtons, sendUrlButton, markAsRead, getMediaUrl, downloadMedia };
