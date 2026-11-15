-- ============================================================
-- PYROCORE — Subida de logos/póster desde el admin a Storage
-- (sin Edge Function y sin base64). Ejecutar en el SQL Editor.
-- Se puede ejecutar varias veces. Solo toca objetos prc_* y el
-- bucket "pyrocore"; no afecta a DFS ni a otros proyectos.
--
-- Cómo funciona:
--   1. El admin (con sesión de staff) pide un "permiso" de subida:
--      prc_staff_upload_ticket() valida el token y reserva una ruta
--      aleatoria (sponsors/<uuid>.webp) válida por 10 minutos.
--   2. El navegador sube el archivo a esa ruta exacta. La política de
--      Storage solo deja subir a rutas reservadas y sin sobrescribir.
--   3. En la base de datos se guarda solo el enlace público.
-- ============================================================

-- Bucket público (lectura libre, máx. 2 MB, solo imágenes)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pyrocore', 'pyrocore', true, 2097152, array['image/webp','image/png','image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Permisos de subida (solo accesibles vía funciones security definer)
create table if not exists prc_upload_tickets (
  path       text        primary key,
  expires_at timestamptz not null default (now() + interval '10 minutes')
);
alter table prc_upload_tickets enable row level security;

create or replace function prc_staff_upload_ticket(p_token text, p_folder text, p_ext text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_path text;
begin
  perform prc_staff_me(p_token);
  if p_folder not in ('sponsors', 'hero') then raise exception 'Carpeta no válida'; end if;
  if p_ext not in ('webp', 'png', 'jpg') then raise exception 'Formato no permitido'; end if;
  delete from prc_upload_tickets where expires_at < now();
  v_path := p_folder || '/' || gen_random_uuid()::text || '.' || p_ext;
  insert into prc_upload_tickets(path) values (v_path);
  return v_path;
end;
$$;

create or replace function prc_upload_allowed(p_bucket text, p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_bucket = 'pyrocore'
     and exists (select 1 from prc_upload_tickets where path = p_name and expires_at > now());
$$;

-- Subir: solo a una ruta reservada por el staff
drop policy if exists "prc_upload_with_ticket" on storage.objects;
create policy "prc_upload_with_ticket" on storage.objects
  for insert to anon, authenticated
  with check (prc_upload_allowed(bucket_id, name));

-- Leer metadatos del bucket pyrocore (las imágenes ya son públicas;
-- Storage lo necesita para responder a la subida)
drop policy if exists "prc_read_pyrocore" on storage.objects;
create policy "prc_read_pyrocore" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'pyrocore');
