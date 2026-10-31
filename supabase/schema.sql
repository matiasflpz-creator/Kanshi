-- =====================================================================
-- Kanshi · base de datos para Supabase
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegá TODO este archivo
-- → Run. Se puede volver a ejecutar sin perder datos (no borra nada).
--
-- Qué crea:
--   perfiles        un registro por usuario con su rol: 'lector' o 'editor'
--   cuentas         Cuenta 1, Cuenta 2…
--   publicaciones   las publicaciones de cada cuenta
--   semanas         los acumulados cargados cada semana
--   favoritos       las publicaciones favoritas de cada editor
--
-- Seguridad (Row Level Security):
--   - Sin login no se puede leer ni escribir nada.
--   - Cualquier usuario logueado puede LEER todo (es una app de equipo).
--   - Sólo los usuarios con rol 'editor' pueden crear, modificar o borrar.
--   - Nadie puede cambiarse el rol desde la app: sólo desde el panel de
--     Supabase (Table Editor o SQL Editor).
--   - Todo usuario nuevo empieza como 'lector'.
--   - Favoritos: cada editor ve, agrega y quita sólo los suyos. Los
--     lectores no pueden usarlos.
-- =====================================================================


-- ---------- Perfiles y roles ----------

create table if not exists public.perfiles (
  id     uuid primary key references auth.users (id) on delete cascade,
  email  text,
  rol    text not null default 'lector' check (rol in ('lector', 'editor')),
  creado timestamptz not null default now()
);

-- Crea el perfil (como lector) cada vez que se agrega un usuario.
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Usuarios que ya existían antes de ejecutar este archivo.
insert into public.perfiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- ¿El usuario logueado es editor?
create or replace function public.es_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = (select auth.uid()) and rol = 'editor'
  );
$$;


-- ---------- Datos ----------

create table if not exists public.cuentas (
  id     uuid primary key default gen_random_uuid(),
  nombre text not null,
  orden  integer not null default 0,
  creado timestamptz not null default now()
);

create table if not exists public.publicaciones (
  id                    uuid primary key default gen_random_uuid(),
  cuenta_id             uuid not null references public.cuentas (id) on delete cascade,
  nombre                text not null,
  semana1_punto_partida boolean not null default false,
  orden                 integer not null default 0,
  creado                timestamptz not null default now()
);
create index if not exists publicaciones_cuenta_idx on public.publicaciones (cuenta_id);

create table if not exists public.semanas (
  id             uuid primary key default gen_random_uuid(),
  publicacion_id uuid not null references public.publicaciones (id) on delete cascade,
  fecha          date not null,
  vistas         bigint not null default 0 check (vistas >= 0),
  clicks         bigint not null default 0 check (clicks >= 0),
  ventas         bigint not null default 0 check (ventas >= 0),
  precio         numeric(14, 2) not null default 0 check (precio >= 0),
  creado         timestamptz not null default now()
);
create index if not exists semanas_publicacion_idx on public.semanas (publicacion_id);

-- Favoritos: una fila por (usuario, publicación).
create table if not exists public.favoritos (
  usuario_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  publicacion_id uuid not null references public.publicaciones (id) on delete cascade,
  creado         timestamptz not null default now(),
  primary key (usuario_id, publicacion_id)
);
create index if not exists favoritos_publicacion_idx on public.favoritos (publicacion_id);

-- Las dos cuentas iniciales (sólo si todavía no hay ninguna).
insert into public.cuentas (nombre, orden)
select v.nombre, v.orden
from (values ('Cuenta 1', 1), ('Cuenta 2', 2)) as v (nombre, orden)
where not exists (select 1 from public.cuentas);


-- ---------- Row Level Security ----------

alter table public.perfiles      enable row level security;
alter table public.cuentas       enable row level security;
alter table public.publicaciones enable row level security;
alter table public.semanas       enable row level security;
alter table public.favoritos     enable row level security;

-- perfiles: cada uno ve el suyo; un editor ve todos. Sin políticas de
-- insert/update/delete: nadie puede cambiar roles desde la app.
drop policy if exists "perfiles: ver" on public.perfiles;
create policy "perfiles: ver" on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.es_editor()));

-- cuentas, publicaciones y semanas: leer = logueado; escribir = editor.
do $$
declare
  t text;
begin
  foreach t in array array['cuentas', 'publicaciones', 'semanas'] loop
    execute format('drop policy if exists "%1$s: leer" on public.%1$I', t);
    execute format('drop policy if exists "%1$s: crear" on public.%1$I', t);
    execute format('drop policy if exists "%1$s: modificar" on public.%1$I', t);
    execute format('drop policy if exists "%1$s: borrar" on public.%1$I', t);

    execute format('create policy "%1$s: leer" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s: crear" on public.%1$I for insert to authenticated with check ((select public.es_editor()))', t);
    execute format('create policy "%1$s: modificar" on public.%1$I for update to authenticated using ((select public.es_editor())) with check ((select public.es_editor()))', t);
    execute format('create policy "%1$s: borrar" on public.%1$I for delete to authenticated using ((select public.es_editor()))', t);
  end loop;
end;
$$;


-- favoritos: sólo los editores, y cada uno únicamente con sus propias filas.
drop policy if exists "favoritos: ver" on public.favoritos;
drop policy if exists "favoritos: agregar" on public.favoritos;
drop policy if exists "favoritos: quitar" on public.favoritos;
create policy "favoritos: ver" on public.favoritos
  for select to authenticated
  using (usuario_id = (select auth.uid()) and (select public.es_editor()));
create policy "favoritos: agregar" on public.favoritos
  for insert to authenticated
  with check (usuario_id = (select auth.uid()) and (select public.es_editor()));
create policy "favoritos: quitar" on public.favoritos
  for delete to authenticated
  using (usuario_id = (select auth.uid()) and (select public.es_editor()));


-- ---------- Restaurar copia / subir datos del navegador ----------
-- Reemplaza todos los datos por los del JSON recibido, en una sola
-- transacción (si algo falla, no se pierde nada). Sólo la puede usar un
-- editor. Conserva los favoritos de todos los editores para las
-- publicaciones que siguen existiendo.

create or replace function public.reemplazar_todo(datos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  favs jsonb;
begin
  if not public.es_editor() then
    raise exception 'Sólo un editor puede reemplazar los datos' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) into favs from public.favoritos f;

  delete from public.cuentas where true;  -- borra también publicaciones, semanas y favoritos (cascade)

  insert into public.cuentas (id, nombre, orden)
  select (c.value ->> 'id')::uuid, c.value ->> 'name', c.ordinality
  from jsonb_array_elements(datos -> 'accounts') with ordinality as c;

  insert into public.publicaciones (id, cuenta_id, nombre, semana1_punto_partida, orden)
  select (p.value ->> 'id')::uuid,
         (c.value ->> 'id')::uuid,
         p.value ->> 'name',
         coalesce((p.value ->> 'firstIsBaseline')::boolean, false),
         p.ordinality
  from jsonb_array_elements(datos -> 'accounts') as c,
       jsonb_array_elements(c.value -> 'posts') with ordinality as p;

  insert into public.semanas (id, publicacion_id, fecha, vistas, clicks, ventas, precio)
  select (w.value ->> 'id')::uuid,
         (p.value ->> 'id')::uuid,
         (w.value ->> 'date')::date,
         coalesce((w.value ->> 'views')::numeric, 0)::bigint,
         coalesce((w.value ->> 'clicks')::numeric, 0)::bigint,
         coalesce((w.value ->> 'sales')::numeric, 0)::bigint,
         coalesce((w.value ->> 'price')::numeric, 0)
  from jsonb_array_elements(datos -> 'accounts') as c,
       jsonb_array_elements(c.value -> 'posts') as p,
       jsonb_array_elements(p.value -> 'weeks') as w;

  insert into public.favoritos (usuario_id, publicacion_id, creado)
  select f.usuario_id, f.publicacion_id, f.creado
  from jsonb_to_recordset(favs) as f (usuario_id uuid, publicacion_id uuid, creado timestamptz)
  where exists (select 1 from public.publicaciones p where p.id = f.publicacion_id)
  on conflict do nothing;
end;
$$;


-- ---------- Permisos de la Data API ----------
-- Sin login (rol "anon") no hay acceso a nada. Los usuarios logueados
-- ("authenticated") pasan siempre por las políticas de arriba.

revoke all on public.perfiles, public.cuentas, public.publicaciones, public.semanas, public.favoritos from anon;
revoke execute on function public.reemplazar_todo(jsonb) from public, anon;
revoke execute on function public.es_editor() from public, anon;
revoke execute on function public.crear_perfil() from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.perfiles to authenticated;
grant select, insert, update, delete on public.cuentas, public.publicaciones, public.semanas to authenticated;
grant select, insert, delete on public.favoritos to authenticated;
grant execute on function public.es_editor() to authenticated;
grant execute on function public.reemplazar_todo(jsonb) to authenticated;
