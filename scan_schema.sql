-- TapptScan — schema propio de Supabase (no compartido con Tappt/Bróker).
-- scan_users.id coincide con el id de Supabase Auth (auth.users).

create table if not exists scan_users (
  id uuid primary key,
  email text unique,
  whatsapp_phone text unique,
  plan text not null default 'gratis' check (plan in ('gratis', 'personal', 'negocio')),
  plan_vence timestamptz,
  drive_tokens jsonb,
  drive_folders jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scan_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references scan_users(id) on delete cascade,
  tipo text not null check (tipo in ('identificacion', 'recibo', 'contrato', 'otro')),
  emisor text,
  fecha date,
  monto numeric,
  moneda text,
  nombre_archivo text,
  drive_file_id text not null,
  drive_link text,
  created_at timestamptz not null default now()
);

create table if not exists scan_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references scan_users(id) on delete cascade,
  code text not null,
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists scan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references scan_users(id) on delete cascade,
  plan text not null check (plan in ('personal', 'negocio')),
  monto numeric not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'pagado', 'cancelado')),
  preference_id text,
  payment_id text,
  link text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scan_documents_user on scan_documents(user_id);
create index if not exists idx_scan_documents_creado on scan_documents(user_id, created_at desc);
create index if not exists idx_scan_links_code on scan_links(code);
create index if not exists idx_scan_payments_user on scan_payments(user_id);
