-- =============================================================================
-- MacBot — Habilitar Supabase Realtime en tablas CRM
-- Ejecutar en Supabase → SQL Editor (después de fix_missing_tables.sql)
-- El CRM React usa principalmente Socket.IO; esto habilita postgres_changes
-- si más adelante conectas @supabase/supabase-js con RLS por usuario.
-- =============================================================================

-- Añadir tablas a la publicación realtime (idempotente)
do $$
declare
  t text;
  tables text[] := array[
    'mensajes',
    'clientes',
    'conversaciones',
    'activadores',
    'etiquetas',
    'crm_conversiones',
    'seguimientos_programados',
    'clientes_etiquetas',
    'flujos_builder'
  ];
begin
  foreach t in array tables loop
    begin
      execute format(
        'alter publication supabase_realtime add table public.%I',
        t
      );
    exception
      when duplicate_object then null;
      when undefined_table then
        raise notice 'Tabla public.% no existe — omitida', t;
      when others then
        raise notice 'No se pudo añadir %: %', t, sqlerrm;
    end;
  end loop;
end $$;

-- Replica identity FULL ayuda a recibir el row completo en UPDATE/DELETE
do $$
declare
  t text;
  tables text[] := array[
    'mensajes',
    'clientes',
    'conversaciones',
    'activadores',
    'etiquetas',
    'crm_conversiones',
    'seguimientos_programados'
  ];
begin
  foreach t in array tables loop
    begin
      execute format('alter table public.%I replica identity full', t);
    exception
      when undefined_table then null;
      when others then
        raise notice 'replica identity %: %', t, sqlerrm;
    end;
  end loop;
end $$;
