-- Tablero operativo privado de Tappt.
-- Ejecutar una vez en Supabase SQL Editor antes de desplegar el backend.
-- No almacena documentos, OCR, nombres, teléfonos ni correos.

create table if not exists scan_ops_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  status text not null check (status in ('ok', 'error')),
  origin text not null default 'unknown',
  user_hash text,
  document_id uuid references scan_documents(id) on delete set null,
  pages integer not null default 0,
  duration_ms integer not null default 0,
  ai_calls integer not null default 0,
  error_code text,
  error_message text,
  app_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_scan_ops_created on scan_ops_events(created_at desc);
create index if not exists idx_scan_ops_status on scan_ops_events(status, created_at desc);
create index if not exists idx_scan_ops_type on scan_ops_events(event_type, created_at desc);
alter table scan_ops_events enable row level security;

-- Resumen diario importado desde los reportes oficiales de Google Play.
-- Una fila por fecha/país permite consolidar el total y, más adelante,
-- segmentar el tablero sin guardar información individual de usuarios.
create table if not exists scan_play_daily_metrics (
  metric_date date not null,
  country_code text not null default 'ALL',
  installs integer not null default 0,
  uninstalls integer not null default 0,
  active_devices integer not null default 0,
  store_listing_visitors integer not null default 0,
  store_listing_acquisitions integer not null default 0,
  crashes integer not null default 0,
  anrs integer not null default 0,
  source text not null default 'google_play',
  synced_at timestamptz not null default now(),
  primary key (metric_date, country_code)
);

create index if not exists idx_scan_play_metrics_date
  on scan_play_daily_metrics(metric_date desc);
alter table scan_play_daily_metrics enable row level security;
