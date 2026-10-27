import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type Profile = { id: string; name: string; avatar_url: string | null }

const NAME_KEY = 'wt:name'
const UID_KEY = 'wt:uid'
const AVATAR_KEY = 'wt:avatar'
const AVATAR_PX = 256

function read(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private mode */ }
}

// One id per browser, minted on first visit. This is "who you are" for
// profiles, messages and reactions.
export const userId: string = read(UID_KEY) || (() => {
  const id = crypto.randomUUID()
  write(UID_KEY, id)
  return id
})()

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'
}

// Downscale to a square AVATAR_PX cover crop so uploads stay tiny.
async function squash(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_PX
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX)
  bmp.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/webp', 0.85),
  )
}

// The current user's profile: local-first (localStorage) and mirrored to the
// profiles table so others can see the name + picture.
export function useProfile() {
  const [name, setNameState] = useState(() => read(NAME_KEY))
  const [avatarUrl, setAvatarState] = useState<string | null>(() => read(AVATAR_KEY) || null)

  const setName = useCallback(async (n: string) => {
    const v = n.trim().slice(0, 24)
    setNameState(v)
    write(NAME_KEY, v)
    if (!v) return
    const { error } = await supabase.from('profiles').upsert({ id: userId, name: v, updated_at: new Date().toISOString() })
    if (error) console.error('[profile]', error)
  }, [])

  const setAvatar = useCallback(async (file: File) => {
    const blob = await squash(file)
    const path = `${userId}.webp`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/webp' })
    if (upErr) throw upErr
    // Cache-bust: same path every time, so the URL must change for browsers to refetch.
    const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
    setAvatarState(url)
    write(AVATAR_KEY, url)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: userId, name: name || 'Anonymous', avatar_url: url, updated_at: new Date().toISOString() })
    if (error) throw error
  }, [name])

  return { userId, name, avatarUrl, setName, setAvatar }
}

// Everyone's profiles, by id, kept live. Small table, so just load it all.
export function useProfiles() {
  const [profiles, setProfiles] = useState<Map<string, Profile>>(() => new Map())

  useEffect(() => {
    let alive = true
    supabase.from('profiles').select('id, name, avatar_url').then(({ data, error }) => {
      if (!alive) return
      if (error) console.error('[profiles]', error)
      setProfiles(new Map((data ?? []).map((p) => [p.id, p])))
    })

    const ch = supabase
      .channel('profiles-db')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ({ eventType, new: row, old }) => {
        setProfiles((map) => {
          const next = new Map(map)
          if (eventType === 'DELETE') next.delete((old as { id: string }).id)
          else next.set((row as Profile).id, row as Profile)
          return next
        })
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [])

  return profiles
}
