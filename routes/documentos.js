const express = require('express');
const router = express.Router();

const { requireAuth } = require('../services/auth');
const supabase = require('../services/supabase');

// Lista de documentos del usuario, opcionalmente filtrada por tipo.
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = supabase
      .from('scan_documents')
      .select('*')
      .eq('user_id', req.usuario.id)
      .order('created_at', { ascending: false });

    if (req.query.tipo) query = query.eq('tipo', req.query.tipo);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error('[documentos] error', err);
    res.status(500).json({ error: 'error_documentos' });
  }
});

// Resumen de gastos del mes (gancho de upsell y pestaña del plan Negocio).
router.get('/gastos', requireAuth, async (req, res) => {
  try {
    const ahora = new Date();
    const desde = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString();

    const { data, error } = await supabase
      .from('scan_documents')
      .select('monto, emisor, fecha')
      .eq('user_id', req.usuario.id)
      .eq('tipo', 'recibo')
      .gte('created_at', desde);
    if (error) throw error;

    const total = data.reduce((suma, d) => suma + (Number(d.monto) || 0), 0);
    res.json({ total, cantidad: data.length, recibos: data });
  } catch (err) {
    console.error('[documentos] error gastos', err);
    res.status(500).json({ error: 'error_gastos' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('scan_documents')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.usuario.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('[documentos] error borrando', err);
    res.status(500).json({ error: 'error_borrar' });
  }
});

module.exports = router;
