-- Fase 3: historial de versiones de flujos (snapshots al guardar en builder).
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.flujos_builder_versiones (
  id uuid primary key default gen_random_uuid(),
  flujo_id uuid not null,
  usuario_id uuid not null,
  conexion_whatsapp_id uuid,
  nombre text not null,
  data_snapshot jsonb not null,
  motivo text not null default 'guardado_builder',
  creado_en timestamptz not null default now()
);

do $$ begin
  alter table public.flujos_builder_versiones
    add constraint flujos_builder_versiones_flujo_fk
    foreign key (flujo_id) references public.flujos_builder (id) on delete cascade;
exception
  when duplicate_object then null;
  when undefined_table then
    raise notice 'Omitida FK flujo: flujos_builder no encontrada.';
end $$;

do $$ begin
  alter table public.flujos_builder_versiones
    add constraint flujos_builder_versiones_conexion_fk
    foreign key (conexion_whatsapp_id) references public.conexiones_whatsapp (id) on delete set null;
exception
  when duplicate_object then null;
  when undefined_table then
    raise notice 'Omitida FK conexion: conexiones_whatsapp no encontrada.';
end $$;

create index if not exists flujos_builder_versiones_flujo_creado_idx
  on public.flujos_builder_versiones (flujo_id, creado_en desc);

create index if not exists flujos_builder_versiones_usuario_flujo_idx
  on public.flujos_builder_versiones (usuario_id, flujo_id);

create index if not exists flujos_builder_versiones_scope_idx
  on public.flujos_builder_versiones (usuario_id, flujo_id, conexion_whatsapp_id);

comment on table public.flujos_builder_versiones is
  'Snapshots del diseño del flujo (máx. 20 por flujo, poda en aplicación).';

alter table public.flujos_builder_versiones enable row level security;

drop policy if exists flujos_builder_versiones_service_role_all on public.flujos_builder_versiones;

create policy flujos_builder_versiones_service_role_all
  on public.flujos_builder_versiones
  for all
  to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.flujos_builder_versiones to service_role;
