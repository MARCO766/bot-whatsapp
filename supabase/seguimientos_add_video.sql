-- Opcional: ejecutar en Supabase si vas a usar mensajes tipo "video" en seguimientos.
-- Sin esto, el worker sigue funcionando con texto/imagen/audio/pdf.

alter table public.seguimientos_programados
  drop constraint if exists seguimientos_mensaje_tipo_valido;

alter table public.seguimientos_programados
  add constraint seguimientos_mensaje_tipo_valido check (
    mensaje_tipo in ('texto', 'imagen', 'audio', 'pdf', 'video')
  );
