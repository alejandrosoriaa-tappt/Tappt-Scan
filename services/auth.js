const supabase = require('./supabase');
const sesiones = require('./sesiones');

/**
 * La app manda un token propio de TapptScan en Authorization.
 *
 * No se usa Supabase Auth: la identidad del usuario es su número de
 * WhatsApp, verificado al entrar (ver `services/sesiones.js`). Supabase
 * queda solo como base de datos.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'falta_token' });

    const usuarioId = sesiones.verificarToken(token);
    if (!usuarioId) return res.status(401).json({ error: 'token_invalido' });

    const { data: usuario, error } = await supabase
      .from('scan_users')
      .select('*')
      .eq('id', usuarioId)
      .maybeSingle();
    if (error) throw error;

    // El token es válido pero el usuario ya no existe: sesión huérfana.
    if (!usuario) return res.status(401).json({ error: 'usuario_no_encontrado' });

    req.usuario = usuario;
    next();
  } catch (err) {
    console.error('[auth] error validando sesión', err);
    // Una sesión de versiones antiguas puede contener como `sub` el número
    // de teléfono en vez del UUID actual. Postgres responde 22P02 al intentar
    // compararlo con scan_users.id. Para la app esto es una sesión inválida,
    // no una falla interna: el 401 hace que borre el token y vuelva al acceso.
    if (err?.code === '22P02') {
      return res.status(401).json({ error: 'token_invalido' });
    }
    res.status(500).json({ error: 'error_auth' });
  }
}

module.exports = { requireAuth };
