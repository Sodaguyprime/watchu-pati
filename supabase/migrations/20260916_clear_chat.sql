-- "Clear chat" button: anyone in the room can wipe the message history.
-- Same trust model as videos/subtitles (see 20260915_videos_messages.sql).
create policy "anon clear messages" on public.messages for delete to anon using (true);
