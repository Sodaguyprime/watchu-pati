-- Watch-together: shared video library + chat.
-- No auth in the app, so the anon role can read/insert/delete. Fine for a
-- private room; lock this down if the URL ever becomes public.

create table if not exists public.videos (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  url           text not null,
  thumbnail_url text,
  created_at    timestamptz not null default now()
);

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  room       text not null,
  name       text not null,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists messages_room_created_idx on public.messages (room, created_at);

alter table public.videos   enable row level security;
alter table public.messages enable row level security;

create policy "anon read videos"    on public.videos   for select to anon using (true);
create policy "anon add videos"     on public.videos   for insert to anon with check (true);
create policy "anon remove videos"  on public.videos   for delete to anon using (true);
create policy "anon read messages"  on public.messages for select to anon using (true);
create policy "anon send messages"  on public.messages for insert to anon with check (true);

-- Realtime: stream inserts/deletes to connected clients
alter publication supabase_realtime add table public.videos;
alter publication supabase_realtime add table public.messages;
