const express = require('express');
const router = express.Router();

const whatsapp = require('../services/whatsapp');
const procesarDocumento = require('../services/procesarDocumento');
const linking = require('../services/linking');
const planes = require('../services/planes');
const mercadopago = require('../services/mercadopago');
const supabase = require('../services/supabase');

// Verificación del webhook (Meta llama a esto al configurar la app).
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Eventos entrantes: imagen, texto, botones.
router.post('/', async (req, res) => {
  res.sendStatus(200); // ack inmediato, Meta reintenta si tardamos

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg) return;

    const from = msg.from;

    if (msg.type === 'image') {
      await handleImage(from, msg.image);
    } else if (msg.type === 'text') {
      await handleText(from, msg.text.body);
    } else if (msg.type === 'interactive') {
      await handleButton(from, msg.interactive);
    }
  } catch (err) {
    console.error('[webhook] error procesando mensaje', err);
  }
});

async function handleImage(from, image) {
  const { data: user } = await supabase
    .from('scan_users')
    .select('*')
    .eq('whatsapp_phone', from)
    .maybeSingle();

  if (!user || !user.drive_tokens) {
    await whatsapp.sendText(
      from,
      'Todavía no tienes tu Google Drive conectado. Baja la app de TapptScan para conectarlo y guardar tus documentos automáticamente.'
    );
    return;
  }

  const cupo = await planes.puedeEscanear(user);
  if (!cupo.permitido) {
    await whatsapp.sendText(
      from,
      `Ya usaste tus ${cupo.limite} escaneos gratis de este mes. Pásate al plan Personal ` +
        `y escanea sin límite — escríbeme "quiero personal" y te mando el link.`
    );
    return;
  }

  const mediaUrl = await whatsapp.getMediaUrl(image.id);
  const buffer = await whatsapp.downloadMedia(mediaUrl);

  const { nombreArchivo: fileName, nombreCarpeta: folderName } = await procesarDocumento.procesarImagen(
    user,
    buffer,
    image.mime_type || 'image/jpeg'
  );

  await whatsapp.sendButtons(from, `Guardé tu documento como "${fileName}" en ${folderName}. ¿Todo bien?`, [
    { id: 'ok', title: 'Guardar' },
    { id: 'app', title: 'Ver en la app' },
    { id: 'otra_cosa', title: 'Es otra cosa' },
  ]);
}

async function handleText(from, text) {
  const limpio = text.trim();

  if (/quiero (el plan )?(personal|negocio)/i.test(limpio)) {
    const plan = /negocio/i.test(limpio) ? 'negocio' : 'personal';
    const { data: user } = await supabase
      .from('scan_users')
      .select('*')
      .eq('whatsapp_phone', from)
      .maybeSingle();

    if (!user) {
      await whatsapp.sendText(from, 'Primero conecta tu cuenta desde la app de TapptScan.');
      return;
    }

    const link = await mercadopago.crearLinkDePago(user, plan);
    await whatsapp.sendText(from, `Aquí está tu link para activar el plan ${plan}:\n${link}`);
    return;
  }

  if (/^\d{6}$/.test(limpio)) {
    const userId = await linking.redeemLinkCode(text.trim(), from);
    if (userId) {
      await whatsapp.sendText(from, 'Listo, tu WhatsApp quedó conectado a tu cuenta de TapptScan.');
    } else {
      await whatsapp.sendText(from, 'Ese código no es válido o ya expiró.');
    }
    return;
  }

  await whatsapp.sendText(
    from,
    'Hola, soy TapptScan. Mándame la foto de un documento y lo guardo directo en tu Google Drive.'
  );
}

async function handleButton(from, interactive) {
  const id = interactive?.button_reply?.id;
  if (id === 'app') {
    await whatsapp.sendText(from, 'Ábrelo en la app de TapptScan para verlo, editarlo o firmarlo.');
  } else if (id === 'otra_cosa') {
    await whatsapp.sendText(from, 'Ok, dime qué tipo de documento es o mándame otra foto.');
  }
}

module.exports = router;
