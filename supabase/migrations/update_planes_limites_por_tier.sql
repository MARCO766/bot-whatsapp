-- Límites SaaS MacBot por tier de plan (Fase 3 — WhatsApp, contactos, flujos).
-- Ejecutar en Supabase → SQL Editor.
-- Actualiza usuarios existentes según su columna plan y ajusta defaults de columnas.

-- Defaults para nuevos usuarios (free)
alter table public.crm_usuarios
  alter column max_whatsapp set default 1,
  alter column max_contactos set default 100,
  alter column max_flujos set default 1;

-- free
update public.crm_usuarios
set
  max_whatsapp = 1,
  max_contactos = 100,
  max_flujos = 1,
  updated_plan_at = now()
where plan = 'free';

-- starter
update public.crm_usuarios
set
  max_whatsapp = 2,
  max_contactos = 2000,
  max_flujos = 10,
  updated_plan_at = now()
where plan = 'starter';

-- pro
update public.crm_usuarios
set
  max_whatsapp = 5,
  max_contactos = 10000,
  max_flujos = 20,
  updated_plan_at = now()
where plan = 'pro';

-- agency (ilimitado)
update public.crm_usuarios
set
  max_whatsapp = -1,
  max_contactos = -1,
  max_flujos = -1,
  updated_plan_at = now()
where plan = 'agency';

-- Verificación rápida
-- select plan, count(*) as usuarios,
--        min(max_whatsapp) as min_wa, max(max_whatsapp) as max_wa,
--        min(max_contactos) as min_ct, max(max_contactos) as max_ct,
--        min(max_flujos) as min_fl, max(max_flujos) as max_fl
-- from public.crm_usuarios
-- group by plan
-- order by plan;
