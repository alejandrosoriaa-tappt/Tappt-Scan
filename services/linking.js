const crypto = require('crypto');
const supabase = require('./supabase');

const CODE_TTL_MINUTES = 15;

function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

// Se llama desde la app al conectar el número por OTP. Genera un código de
// un solo uso que el usuario confirma por WhatsApp para amarrar
// número <-> cuenta.
async function createLinkCode(userId) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

  const { error } = await supabase.from('scan_links').insert({
    user_id: userId,
    code,
    expires_at: expiresAt,
    used: false,
  });
  if (error) throw error;

  return { code, expiresAt };
}

// Se llama desde el webhook cuando el usuario manda el código por WhatsApp.
async function redeemLinkCode(code, phone) {
  const { data: link, error } = await supabase
    .from('scan_links')
    .select('*')
    .eq('code', code)
    .eq('used', false)
    .gte('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  if (!link) return null;

  await supabase.from('scan_links').update({ used: true }).eq('id', link.id);
  await supabase.from('scan_users').update({ whatsapp_phone: phone }).eq('id', link.user_id);

  return link.user_id;
}

module.exports = { createLinkCode, redeemLinkCode };
