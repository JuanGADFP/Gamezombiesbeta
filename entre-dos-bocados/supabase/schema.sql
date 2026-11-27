-- Entre dos bocados: base de datos en Supabase.
-- Copien todo este archivo en Supabase > SQL Editor > New query y toquen "Run".

-- 1) Tabla de reseñas
create table if not exists public.resenas (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  nombre        text not null check (char_length(nombre) between 1 and 120),
  categoria     text not null,
  estilos       text[] not null default '{}',
  direccion     text,
  lat           double precision not null,
  lng           double precision not null,
  precio        smallint check (precio between 1 and 4),
  fecha_visita  date,
  pedimos       text,
  imperdible    text,
  nota_1        numeric(3,1) check (nota_1 between 0 and 10),
  opinion_1     text,
  nota_2        numeric(3,1) check (nota_2 between 0 and 10),
  opinion_2     text,
  volveriamos   boolean not null default true,
  fotos         text[] not null default '{}'
);

alter table public.resenas enable row level security;

-- Cualquiera puede leer las reseñas (el sitio es público).
drop policy if exists "resenas: lectura publica" on public.resenas;
create policy "resenas: lectura publica" on public.resenas
  for select using (true);

-- Solo usuarios con sesión iniciada (ustedes dos) pueden escribir.
drop policy if exists "resenas: escribir con sesion" on public.resenas;
create policy "resenas: escribir con sesion" on public.resenas
  for all to authenticated using (true) with check (true);

-- 2) Carpeta pública para las fotos
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "fotos: subir con sesion" on storage.objects;
create policy "fotos: subir con sesion" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos');

drop policy if exists "fotos: borrar con sesion" on storage.objects;
create policy "fotos: borrar con sesion" on storage.objects
  for delete to authenticated using (bucket_id = 'fotos');
