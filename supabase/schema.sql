-- Food Logger — Supabase schema
-- Run in Supabase Dashboard → SQL Editor (one shot, idempotent-ish).

-- ============ entries table ============

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  eaten_at    timestamptz not null default now(),
  meal        text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  tags        text[] not null default '{}',
  note        text not null default '',
  image_path  text,
  thumb_path  text,
  analysis    jsonb not null default '{"status": "pending"}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists entries_user_eaten_idx
  on public.entries (user_id, eaten_at desc);

alter table public.entries enable row level security;

drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own" on public.entries
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries
  for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "entries_delete_own" on public.entries;
create policy "entries_delete_own" on public.entries
  for delete to authenticated using (auth.uid() = user_id);

-- ============ storage bucket ============
-- Private bucket; files live under <user_id>/<entry_id>.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meals', 'meals', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "meals_select_own" on storage.objects;
create policy "meals_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'meals' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "meals_insert_own" on storage.objects;
create policy "meals_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'meals' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "meals_update_own" on storage.objects;
create policy "meals_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'meals' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'meals' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "meals_delete_own" on storage.objects;
create policy "meals_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'meals' and (storage.foldername(name))[1] = auth.uid()::text);
