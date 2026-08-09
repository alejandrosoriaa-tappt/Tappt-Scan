-- TapptScan — schema propio de Supabase (no compartido con Tappt/Bróker).

create table if not exists scan_users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  whatsapp_phone text unique,
  plan text not null default 'gratis' check (plan in ('gratis', 'personal', 'negocio')),
  drive_tokens jsonb,
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

create index if not exists idx_scan_documents_user on scan_documents(user_id);
create index if not exists idx_scan_links_code on scan_links(code);
