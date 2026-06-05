-- Seguimiento CRM V2 — nombre de archivo opcional para documentos
alter table public.seguimientos_v2
  add column if not exists media_filename text;

comment on column public.seguimientos_v2.media_filename is
  'Nombre de archivo opcional al enviar documentos (Seguimiento V2).';
