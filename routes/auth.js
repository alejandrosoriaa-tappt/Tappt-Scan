const express = require('express');
const router = express.Router();

const sesiones = require('../services/sesiones');
const otpSms = require('../services/otpSms');

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
 * Acceso alterno por SMS (solo iOS). La app manda nombre + teléfono; el
 * backend crea el reto y dispara el SMS. Nunca regresa el código, ni
 * siquiera para la cuenta reservada de Apple.
 */
router.post('/sms/iniciar', async (req, res) => {
  try {
    const { nombre, telefono } = req.body || {};
    const resultado = await otpSms.iniciar(nombre, telefono, req.ip);
    res.json(resultado);
  } catch (err) {
    const codigo = err.codigo || 'error_sms_iniciar';
    const status = codigo === 'telefono_invalido' ? 400 : codigo === 'demasiados_intentos' ? 429 : 500;
    if (status === 500) console.error('[auth] error iniciando acceso por sms', err);
    res.status(status).json({ error: codigo });
  }
});

// La app manda los 6 dígitos. Va sin autenticación por lo mismo que
// `/estado/:codigo`: es el paso previo a tenerla.
router.post('/sms/verificar', async (req, res) => {
  try {
    const { telefono, codigo } = req.body || {};
    res.json(await otpSms.verificar(telefono, codigo));
  } catch (err) {
    console.error('[auth] error verificando acceso por sms', err);
    res.status(500).json({ error: 'error_sms_verificar' });
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
