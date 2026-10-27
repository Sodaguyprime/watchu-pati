-- Subtitle tracks attached to library videos. Each row is a URL to a .vtt/.srt
-- file: either pasted (e.g. Bunny's captions/<lang>.vtt) or uploaded by us
-- into the public "subtitles" storage bucket.

create table if not exists public.subtitles (
  id         uuid primary key default gen_random_uuid(),
  video_id   uuid not null references public.videos (id) on delete cascade,
  label      text not null,
  lang       text not null default 'en',
  url        text not null,
  created_at timestamptz not null default now()
);
create index if not exists subtitles_video_idx on public.subtitles (video_id);

alter table public.subtitles enable row level security;
create policy "anon read subtitles"   on public.subtitles for select to anon using (true);
create policy "anon add subtitles"    on public.subtitles for insert to anon with check (true);
create policy "anon remove subtitles" on public.subtitles for delete to anon using (true);

alter publication supabase_realtime add table public.subtitles;

-- Public bucket for uploaded subtitle files
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subtitles', 'subtitles', true, 5242880, null)
on conflict (id) do nothing;

create policy "anon read subtitle files"   on storage.objects for select to anon using (bucket_id = 'subtitles');
create policy "anon upload subtitle files" on storage.objects for insert to anon with check (bucket_id = 'subtitles');
create policy "anon delete subtitle files" on storage.objects for delete to anon using (bucket_id = 'subtitles');
