-- Threaded replies: a message can point at the one it answers. If the
-- original is deleted the reply survives with the link cleared.
alter table public.messages
  add column if not exists reply_to uuid references public.messages (id) on delete set null;
