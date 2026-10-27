import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Subtitle = {
  id: string
  video_id: string
  label: string
  lang: string
  url: string
  created_at: string
}

export type SubtitleFormat = 'vtt' | 'srt'

export function formatOf(url: string): SubtitleFormat {
  return /\.srt(\?|$)/i.test(url) ? 'srt' : 'vtt'
}

export async function addSubtitle(input: { video_id: string; label: string; lang: string; url: string }) {
  const { error } = await supabase.from('subtitles').insert({
    video_id: input.video_id,
    label: input.label.trim(),
    lang: input.lang.trim() || 'en',
    url: input.url.trim(),
  })
  if (error) throw error
}

// Upload a .vtt/.srt into the public bucket and return its URL
export async function uploadSubtitleFile(videoId: string, file: File): Promise<string> {
  const ext = file.name.toLowerCase().endsWith('.srt') ? 'srt' : 'vtt'
  const path = `${videoId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('subtitles').upload(path, file, {
    contentType: ext === 'srt' ? 'application/x-subrip' : 'text/vtt',
  })
  if (error) throw error
  return supabase.storage.from('subtitles').getPublicUrl(path).data.publicUrl
}

export async function removeSubtitle(sub: Subtitle) {
  const { error } = await supabase.from('subtitles').delete().eq('id', sub.id)
  if (error) throw error
  // Best-effort cleanup of files we uploaded ourselves
  const m = sub.url.match(/\/storage\/v1\/object\/public\/subtitles\/(.+)$/)
  if (m) await supabase.storage.from('subtitles').remove([decodeURIComponent(m[1])])
}

export function useSubtitles(videoId: string | null) {
  // Keyed by video so a stale list never shows against a newly selected video
  const [state, setState] = useState<{ videoId: string | null; subs: Subtitle[] }>({ videoId, subs: [] })

  useEffect(() => {
    if (!videoId) return
    const setSubs = (fn: (list: Subtitle[]) => Subtitle[]) =>
      setState((s) => ({ videoId, subs: fn(s.videoId === videoId ? s.subs : []) }))
    let alive = true
    supabase
      .from('subtitles')
      .select('*')
      .eq('video_id', videoId)
      .order('created_at')
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('[subtitles]', error)
        setSubs(() => data ?? [])
      })

    const ch = supabase
      .channel(`subtitles-${videoId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'subtitles', filter: `video_id=eq.${videoId}` },
        ({ new: row }) => setSubs((list) => (list.some((s) => s.id === row.id) ? list : [...list, row as Subtitle])),
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'subtitles' }, ({ old }) => {
        setSubs((list) => list.filter((s) => s.id !== (old as { id: string }).id))
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [videoId])

  return state.videoId === videoId ? state.subs : []
}
