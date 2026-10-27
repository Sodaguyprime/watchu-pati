import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Video = {
  id: string
  title: string
  url: string
  thumbnail_url: string | null
  created_at: string
}

// Bunny Stream serves thumbnail.jpg next to playlist.m3u8
export function deriveThumbnail(url: string): string | null {
  const m = url.match(/^(https?:\/\/[^/]+\/[0-9a-f-]{36})\/playlist\.m3u8/i)
  return m ? `${m[1]}/thumbnail.jpg` : null
}

export function thumbnailFor(v: Pick<Video, 'url' | 'thumbnail_url'>): string | null {
  return v.thumbnail_url || deriveThumbnail(v.url)
}

export async function addVideo(input: { title: string; url: string; thumbnail_url?: string }) {
  const { error } = await supabase.from('videos').insert({
    title: input.title.trim(),
    url: input.url.trim(),
    thumbnail_url: input.thumbnail_url?.trim() || null,
  })
  if (error) throw error
}

export async function removeVideo(id: string) {
  const { error } = await supabase.from('videos').delete().eq('id', id)
  if (error) throw error
}

export function useVideos() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    supabase
      .from('videos')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('[videos]', error)
        setVideos(data ?? [])
        setLoading(false)
      })

    const ch = supabase
      .channel('videos-db')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'videos' }, ({ new: row }) => {
        setVideos((list) => (list.some((v) => v.id === row.id) ? list : [row as Video, ...list]))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'videos' }, ({ old }) => {
        setVideos((list) => list.filter((v) => v.id !== (old as { id: string }).id))
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [])

  return { videos, loading }
}
