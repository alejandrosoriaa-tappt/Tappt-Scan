const supabase = require('./supabase');

// La app se autentica con Supabase Auth y manda el JWT en Authorization.
// Aquí lo validamos y dejamos el usuario de TapptScan en req.usuario.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'falta_token' });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'token_invalido' });

    const authUser = data.user;

    // Alta perezosa: la primera vez que entra, se crea su fila.
    let { data: usuario } = await supabase
      .from('scan_users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();

    if (!usuario) {
      const { data: creado, error: errorAlta } = await supabase
        .from('scan_users')
        .insert({ id: authUser.id, email: authUser.email })
        .select()
        .single();
      if (errorAlta) throw errorAlta;
      usuario = creado;
    }

    req.usuario = usuario;
    next();
  } catch (err) {
    console.error('[auth] error validando sesión', err);
    res.status(500).json({ error: 'error_auth' });
  }
}

module.exports = { requireAuth };
