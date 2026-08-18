-- Ledger de bloques de contactos MacBot (Fase 2.1).
-- Ejecutar en Supabase → SQL Editor SOLO tras revisión.
--
-- Esta migración SOLO crea la tabla.
-- NO inserta bloques.
-- NO migra saldos de Starter/Pro.
-- NO modifica crm_usuarios.max_contactos.
-- NO cambia el CHECK de plan.
-- NO toca clientes, campañas, seguimientos ni WhatsApp.

create table if not exists public.macbot_contactos_bloques (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.crm_usuarios (id),
  sku text not null,
  cantidad integer not null,
  precio_usd numeric(10, 2) not null,
  estado text not null,
  origen text not null,
  proveedor_pago text,
  referencia_pago text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  constraint macbot_contactos_bloques_catalogo_check
    check (
      (sku = 'blk_1000' and cantidad = 1000 and precio_usd = 12)
      or
      (sku = 'blk_2000' and cantidad = 2000 and precio_usd = 20)
    ),
  constraint macbot_contactos_bloques_estado_check
    check (estado in ('pendiente', 'pagado', 'anulado', 'reembolsado')),
  constraint macbot_contactos_bloques_origen_check
    check (origen in ('admin', 'checkout', 'migracion_legacy'))
);

comment on table public.macbot_contactos_bloques is
  'Ledger append-only de bloques de contactos comprados/acreditados. Capacidad futura = SUM(cantidad) WHERE estado = pagado. No reemplaza max_contactos en Fase 2.1.';

comment on column public.macbot_contactos_bloques.usuario_id is
  'FK a crm_usuarios.id. Un usuario puede tener múltiples bloques acumulables.';

comment on column public.macbot_contactos_bloques.sku is
  'blk_1000 = +1.000 por $12 USD; blk_2000 = +2.000 por $20 USD.';

comment on column public.macbot_contactos_bloques.estado is
  'pendiente | pagado | anulado | reembolsado. Los pagados no se eliminan; un reembolso cambia el estado.';

comment on column public.macbot_contactos_bloques.origen is
  'admin (Fase 2.1) | checkout (futuro) | migracion_legacy (Fase 2.2, no ejecutar aún).';

create index if not exists macbot_contactos_bloques_usuario_id_idx
  on public.macbot_contactos_bloques (usuario_id);

create index if not exists macbot_contactos_bloques_usuario_estado_idx
  on public.macbot_contactos_bloques (usuario_id, estado);

alter table public.macbot_contactos_bloques enable row level security;

drop policy if exists macbot_contactos_bloques_service_role_all
  on public.macbot_contactos_bloques;

create policy macbot_contactos_bloques_service_role_all
  on public.macbot_contactos_bloques
  for all
  to service_role
  using (true)
  with check (true);

-- Sin GRANT DELETE: los bloques pagados no deben borrarse físicamente.
grant select, insert, update on public.macbot_contactos_bloques to service_role;
