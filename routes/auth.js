const express = require('express');
const router = express.Router();

const sesiones = require('../services/sesiones');

// La app pide un código y el enlace de WhatsApp con el mensaje ya escrito.
router.post('/iniciar', async (req, res) => {
  try {
    res.json(await sesiones.iniciar());
  } catch (err) {
    console.error('[auth] error iniciando sesión', err);
    res.status(500).json({ error: 'error_iniciar' });
  }
});

/**
 * La app pregunta si el usuario ya mandó el mensaje.
 *
 * Va sin autenticación a propósito: es justo el paso previo a tenerla. Lo
 * que la protege es el código — 8 caracteres aleatorios, válido 10 minutos
 * y de un solo uso.
 */
router.get('/estado/:codigo', async (req, res) => {
  try {
    res.json(await sesiones.reclamar(req.params.codigo));
  } catch (err) {
    console.error('[auth] error consultando estado', err);
    res.status(500).json({ error: 'error_estado' });
  }
});

module.exports = router;
