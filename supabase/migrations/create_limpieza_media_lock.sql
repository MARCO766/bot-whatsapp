-- Candado global de la limpieza de multimedia.
-- No aplicar desde el proceso de limpieza. Una sola fila, distinta del worker de Seguimientos V2.

create table if not exists public.limpieza_media_lock (
  id text primary key,
  locked_until timestamptz not null default '1970-01-01T00:00:00Z',
  locked_by text,
  updated_at timestamptz not null default now()
);

insert into public.limpieza_media_lock (id, locked_until, locked_by)
values ('global', '1970-01-01T00:00:00Z', null)
on conflict (id) do nothing;

alter table public.limpieza_media_lock enable row level security;

revoke all on table public.limpieza_media_lock from public;
revoke all on table public.limpieza_media_lock from anon;
revoke all on table public.limpieza_media_lock from authenticated;

grant select, insert, update on table public.limpieza_media_lock to service_role;

comment on table public.limpieza_media_lock is
  'Un solo recorrido de limpieza de multimedia a la vez. TTL 30 minutos, renovado por el mismo locked_by.';
