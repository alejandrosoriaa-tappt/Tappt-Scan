const axios = require('axios');
const GRAPH_BASE = 'https://graph.facebook.com/v19.0';
function client() {
  return axios.create({
    baseURL: `${GRAPH_BASE}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`,
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
}
async function sendText(to, body) {
  return client().post('/messages', {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  });
}
async function sendButtons(to, bodyText, buttons) {
  try {
    return await client().post('/messages', {
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
  return client().post('/messages', payload);
}

async function getMediaUrl(mediaId) {
  const { data } = await axios.get(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
  });
  return data.url;
}
async function downloadMedia(mediaUrl) {
  const { data } = await axios.get(mediaUrl, {
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    responseType: 'arraybuffer',
  });
  return data;
}
module.exports = { sendText, sendButtons, markAsRead, getMediaUrl, downloadMedia };
