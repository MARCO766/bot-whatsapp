-- Seguimiento CRM V2 — tabla principal (aislada de seguimientos_programados).
-- Ejecutar en Supabase → SQL Editor → Run

create table if not exists public.seguimientos_v2 (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null,
  conexion_whatsapp_id uuid not null,
  cliente_numero text not null,
  flujo_id text,
  nodo_id text,
  campana_id uuid not null,
  paso_index int not null default 0,
  paso_id text,
  tipo text not null default 'texto',
  contenido text,
  media_url text,
  media_type text,
  estado text not null default 'pendiente',
  run_at timestamptz not null,
  checkpoint_at timestamptz not null default now(),
  enviado_en timestamptz,
  cancelado_en timestamptz,
  respondido_en timestamptz,
  error_detalle text,
  meta_message_id text,
  cancelar_si_responde boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seguimientos_v2_estado_check check (
    estado in (
      'pendiente',
      'procesando',
      'enviado',
      'cancelado',
      'respondido',
      'fallido',
      'omitido_duplicado'
    )
  )
);

create index if not exists seguimientos_v2_worker_idx
  on public.seguimientos_v2 (estado, run_at)
  where estado = 'pendiente';

create index if not exists seguimientos_v2_clave_triple_idx
  on public.seguimientos_v2 (usuario_id, cliente_numero, conexion_whatsapp_id);

create index if not exists seguimientos_v2_campana_idx
  on public.seguimientos_v2 (campana_id);

create index if not exists seguimientos_v2_nodo_linea_idx
  on public.seguimientos_v2 (usuario_id, flujo_id, nodo_id, conexion_whatsapp_id);

comment on table public.seguimientos_v2 is
  'Seguimiento CRM V2 — un paso programado por fila. Aislado de seguimientos_programados (legacy).';

comment on column public.seguimientos_v2.conexion_whatsapp_id is
  'Línea WhatsApp obligatoria — clave triple con usuario_id y cliente_numero.';
