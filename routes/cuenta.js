const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const linking = require('../services/linking');
const planes = require('../services/planes');
const mercadopago = require('../services/mercadopago');
const whatsapp = require('../services/whatsapp');

// Perfil + estado de conexiones y consumo del mes.
router.get('/', requireAuth, async (req, res) => {
  try {
    const usados = await planes.escaneosDelMes(req.usuario.id);
    const limite = planes.limiteDe(req.usuario.plan);

    res.json({
      id: req.usuario.id,
      email: req.usuario.email,
      whatsapp: req.usuario.whatsapp_phone,
      driveConectado: Boolean(req.usuario.drive_tokens),
      plan: req.usuario.plan,
      escaneosUsados: usados,
      escaneosLimite: limite === Infinity ? null : limite,
    });
  } catch (err) {
    console.error('[cuenta] error', err);
    res.status(500).json({ error: 'error_cuenta' });
  }
});

// Paso 1 de vincular WhatsApp: la app pide un código y el usuario lo manda
// por WhatsApp desde el número que quiere conectar.
router.post('/codigo-whatsapp', requireAuth, async (req, res) => {
  try {
    const { code, expiresAt } = await linking.createLinkCode(req.usuario.id);
    res.json({ codigo: code, expira: expiresAt });
  } catch (err) {
    console.error('[cuenta] error generando código', err);
    res.status(500).json({ error: 'error_codigo' });
  }
});

// Genera el link de pago y lo manda por WhatsApp (nunca cobro in-app).
router.post('/upgrade', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['personal', 'negocio'].includes(plan)) {
      return res.status(400).json({ error: 'plan_invalido' });
    }

    const link = await mercadopago.crearLinkDePago(req.usuario, plan);

    if (req.usuario.whatsapp_phone) {
      await whatsapp.sendText(
        req.usuario.whatsapp_phone,
        `Aquí está tu link para activar el plan ${plan}:\n${link}`
      );
    }

    res.json({ link, enviadoPorWhatsapp: Boolean(req.usuario.whatsapp_phone) });
  } catch (err) {
    console.error('[cuenta] error generando pago', err);
    res.status(500).json({ error: 'error_pago' });
  }
});

module.exports = router;
