-- Profiles (name + picture) keyed by a per-browser id kept in localStorage,
-- messages linked to that id, and heart reactions (one per person per message).
-- Same trust model as the rest: no auth, anon can do everything in the room.

create table if not exists public.profiles (
  id         uuid primary key,
  name       text not null check (char_length(name) between 1 and 24),
  avatar_url text,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "anon read profiles"   on public.profiles for select to anon using (true);
create policy "anon add profiles"    on public.profiles for insert to anon with check (true);
create policy "anon update profiles" on public.profiles for update to anon using (true) with check (true);

alter table public.messages add column if not exists user_id uuid;

create table if not exists public.reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.reactions enable row level security;
create policy "anon read reactions"   on public.reactions for select to anon using (true);
create policy "anon add reactions"    on public.reactions for insert to anon with check (true);
create policy "anon remove reactions" on public.reactions for delete to anon using (true);

alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.reactions;

-- Public bucket for profile pictures (resized client-side to 256px before upload)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "anon read avatars"   on storage.objects for select to anon using (bucket_id = 'avatars');
create policy "anon upload avatars" on storage.objects for insert to anon with check (bucket_id = 'avatars');
create policy "anon update avatars" on storage.objects for update to anon using (bucket_id = 'avatars');
create policy "anon delete avatars" on storage.objects for delete to anon using (bucket_id = 'avatars');
