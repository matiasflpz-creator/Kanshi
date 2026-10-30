-- Kanshi · esquema para Supabase
-- Ejecutar en Supabase → SQL Editor.
--
-- La app guarda todo su estado (cuentas, publicaciones y semanas) como un
-- documento JSON. Es la forma más simple de sincronizar entre dispositivos
-- sin cambiar la lógica de la app.

create table if not exists public.kanshi_estado (
  id          text primary key,
  datos       jsonb not null,
  actualizado timestamptz not null default now()
);

alter table public.kanshi_estado enable row level security;

-- ⚠ Política abierta para empezar rápido: cualquiera con la URL y la clave
-- "anon" puede leer y escribir. Antes de usarlo en serio, activá Supabase Auth
-- y reemplazá estas políticas por unas que filtren por auth.uid().
create policy "kanshi lectura" on public.kanshi_estado
  for select using (true);
create policy "kanshi escritura" on public.kanshi_estado
  for insert with check (true);
create policy "kanshi actualizacion" on public.kanshi_estado
  for update using (true) with check (true);
