-- TapptScan — esquema completo.
--
-- Proyecto de Supabase PROPIO: no compartir con Tappt ni con el bróker.
-- Se corre entero de una vez en el SQL Editor de Supabase; es idempotente,
-- así que volver a correrlo no rompe nada.
--
-- `scan_users.id` coincide con el id de Supabase Auth (`auth.users.id`):
-- el backend da de alta la fila la primera vez que el usuario entra.

-- ---------------------------------------------------------------- usuarios
create table if not exists scan_users (
  id uuid primary key,
  email text unique,
  whatsapp_phone text unique,

  -- Preferencias. El idioma lo sincroniza la app para que el bot de
  -- WhatsApp hable igual; la moneda decide en qué cobra Stripe.
  idioma text,
  moneda text,

  plan text not null default 'gratis' check (plan in ('gratis', 'personal', 'negocio')),
  plan_vence timestamptz,

  -- Tokens OAuth de Google del propio usuario. Aquí NO se guardan archivos:
  -- los documentos viven en su Drive.
  drive_tokens jsonb,
  drive_raiz_id text,

  -- Hoja de gastos dentro de su Drive (plan Negocio).
  gastos_sheet_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------- documentos
create table if not exists scan_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references scan_users(id) on delete cascade,

  tipo text,

  -- Dónde vive el documento: sección y subcarpeta del árbol de
  -- `services/taxonomia.js`. Nulos = el clasificador no supo, y el archivo
  -- cayó en "99 · Por revisar".
  seccion text,
  subcarpeta text,

  emisor text,
  fecha date,
  monto numeric,
  moneda text,

  -- Eje de gasto, INDEPENDIENTE de la carpeta: un ticket de gasolina vive
  -- en Vehículos pero se contabiliza como `gasolina`. Es lo que permite
  -- responder "¿cuánto gasté en restaurantes el mes pasado?".
  es_gasto boolean not null default false,
  categoria_gasto text,
  concepto text,
  proyecto text,

  nombre_archivo text,
  nombre_original text,
  ruta text,
  carpeta_id text,
  mime_type text default 'application/pdf',
  paginas integer not null default 1,

  drive_file_id text not null,
  drive_link text,

  created_at timestamptz not null default now()
);

-- --------------------------------------------- vinculación de WhatsApp
-- Código de un solo uso que amarra número <-> cuenta.
create table if not exists scan_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references scan_users(id) on delete cascade,
  code text not null,
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ pagos
-- Una fila por intento de cobro. El webhook de Stripe la marca `pagado` y
-- sube el plan del usuario.
create table if not exists scan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references scan_users(id) on delete cascade,
  plan text not null check (plan in ('personal', 'negocio')),
  monto numeric not null,
  moneda text not null default 'mxn',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'cancelado')),
  session_id text,
  payment_id text,
  link text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------- índices
create index if not exists idx_scan_documents_user
  on scan_documents(user_id, created_at desc);

-- Sostiene las consultas de gasto por rango de fechas.
create index if not exists idx_scan_documents_gastos
  on scan_documents(user_id, es_gasto, fecha desc);

create index if not exists idx_scan_links_code on scan_links(code);
create index if not exists idx_scan_payments_user on scan_payments(user_id);

-- --------------------------------------------------------------- seguridad
-- Todo el acceso pasa por el backend con la service-role key, que ignora
-- RLS. Se activa igual para que una anon key filtrada no pueda leer nada:
-- sin politicas, RLS niega por defecto.
alter table scan_users enable row level security;
alter table scan_documents enable row level security;
alter table scan_links enable row level security;
alter table scan_payments enable row level security;

-- ------------------------------------------------------------- sesiones
-- Acceso sin correo ni contraseña: la identidad es el número de WhatsApp.
-- La app genera un código, el usuario lo manda por WhatsApp de un toque, y
-- el webhook amarra la sesión a ese número. Ver `services/sesiones.js`.
create table if not exists scan_sesiones (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'verificado', 'consumido')),
  user_id uuid references scan_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_scan_sesiones_codigo on scan_sesiones(codigo);
alter table scan_sesiones enable row level security;

-- El id del usuario ya no viene de Supabase Auth: lo genera la base.
alter table scan_users alter column id set default gen_random_uuid();

-- `scan_links` era el flujo viejo de vinculación por código de 6 dígitos.
drop table if exists scan_links;

-- Suscripciones de Stripe (agosto 2026): el cobro pasa de pago único a
-- suscripción anual, así que hay que poder identificar al cliente en las
-- renovaciones y cancelaciones.
alter table scan_users add column if not exists stripe_customer_id text;
alter table scan_users add column if not exists stripe_subscription_id text;

create index if not exists idx_scan_users_stripe_customer on scan_users(stripe_customer_id);
create index if not exists idx_scan_users_stripe_sub on scan_users(stripe_subscription_id);

-- La pestaña de Favoritos filtraba sobre una columna que no existía.
alter table scan_documents add column if not exists favorito boolean not null default false;

-- Biblioteca de firmas reutilizables (agosto 2026, rediseño benchmark
-- CamScanner): dibujar o importar una firma la deja guardada para no
-- repetir el trazo cada vez. `datos` es el PNG completo en data URL —
-- son archivos chicos (unos KB) y así no hace falta tocar Drive para
-- algo que vive en la cuenta, no en los documentos del usuario.
create table if not exists scan_firmas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references scan_users(id) on delete cascade,
  datos text not null,
  color text not null default '#2563EB',
  created_at timestamptz not null default now()
);

create index if not exists idx_scan_firmas_user on scan_firmas(user_id, created_at desc);
alter table scan_firmas enable row level security;
