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

-- Importación de archivos y PDFs (agosto 2026): el original puede ser PDF
-- de varias páginas, no solo una foto.
alter table scan_documents add column if not exists mime_type text default 'image/jpeg';
alter table scan_documents add column if not exists paginas integer not null default 1;
alter table scan_documents add column if not exists nombre_original text;

-- Stripe e internacionalización (agosto 2026): se reemplaza MercadoPago por
-- Stripe Checkout y se guarda idioma/moneda por usuario.
alter table scan_users add column if not exists idioma text;
alter table scan_users add column if not exists moneda text;

alter table scan_payments add column if not exists session_id text;
alter table scan_payments add column if not exists moneda text not null default 'mxn';
alter table scan_payments drop column if exists preference_id;

-- Clasificación jerárquica (agosto 2026): el documento ya no cae en una de
-- cuatro carpetas fijas, sino en una ruta que arma el clasificador
-- (ámbito/categoría/emisor/año). Todo se guarda como PDF.
alter table scan_documents add column if not exists ambito text;
alter table scan_documents add column if not exists categoria text;
alter table scan_documents add column if not exists ruta text;
alter table scan_documents add column if not exists carpeta_id text;
alter table scan_documents drop constraint if exists scan_documents_tipo_check;

alter table scan_users add column if not exists drive_raiz_id text;
alter table scan_users drop column if exists drive_folders;

-- Taxonomía fija (agosto 2026): el andamiaje de carpetas se crea completo al
-- conectar Drive y el clasificador elige contra ese catálogo cerrado.
alter table scan_documents add column if not exists seccion text;
alter table scan_documents add column if not exists subcarpeta text;
alter table scan_documents drop column if exists ambito;
alter table scan_documents drop column if exists categoria;

-- Control de gastos / TapptMoney (agosto 2026): eje de gasto independiente
-- del árbol de carpetas, más la hoja de cálculo en el Drive del usuario.
alter table scan_documents add column if not exists es_gasto boolean not null default false;
alter table scan_documents add column if not exists categoria_gasto text;
alter table scan_documents add column if not exists concepto text;
alter table scan_documents add column if not exists proyecto text;

alter table scan_users add column if not exists gastos_sheet_id text;

create index if not exists idx_scan_documents_gastos
  on scan_documents(user_id, es_gasto, fecha desc);
