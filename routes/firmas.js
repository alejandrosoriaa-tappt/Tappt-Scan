const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const supabase = require('../services/supabase');

// Biblioteca de firmas del usuario — dibujadas o importadas de una foto,
// da igual: ambas terminan como el mismo PNG transparente en `datos`.

router.get('/', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scan_firmas')
      .select('id, datos, color, created_at')
      .eq('user_id', req.usuario.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('[firmas] error listando', err);
    res.status(500).json({ error: 'error_firmas' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { datos, color } = req.body;
    if (!datos) return res.status(400).json({ error: 'faltan_datos' });

    const { data, error } = await supabase
      .from('scan_firmas')
      .insert({ user_id: req.usuario.id, datos, color: color || '#2563EB' })
      .select('id, datos, color, created_at')
      .single();
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('[firmas] error guardando', err);
    res.status(500).json({ error: 'error_firmas' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('scan_firmas')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.usuario.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[firmas] error borrando', err);
    res.status(500).json({ error: 'error_firmas' });
  }
});

module.exports = router;
