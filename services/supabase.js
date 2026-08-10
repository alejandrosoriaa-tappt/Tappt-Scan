const { createClient } = require('@supabase/supabase-js');

// Node 18 no trae WebSocket nativo (llegó hasta Node 22); supabase-js
// inicializa su cliente de Realtime al crear el cliente aunque no se use,
// y sin este global truena el arranque completo del server.
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

module.exports = supabase;
