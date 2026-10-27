import { useEffect, useRef, useState } from 'react'
import { useMediaState } from '@vidstack/react'
import type { Message } from '../hooks/useChat'
import { userId, type Profile } from '../lib/profile'
import { displayBody } from '../lib/stickers'
import { UserAvatar, hue } from './UserAvatar'

type Props = {
  messages: Message[]
  profiles: Map<string, Profile>
}

const LINGER_MS = 2000
const MAX_SHOWN = 4

// YouTube-style overlay: while the player is fullscreen, incoming chat lines
// slide into the corner, hang around for a couple of seconds, then fade out.
// Must render inside <MediaPlayer> so it's part of the fullscreen element.
export function FullscreenChat({ messages, profiles }: Props) {
  const fullscreen = useMediaState('fullscreen')
  // Everything already in the log when we went fullscreen isn't "new".
  const [start, setStart] = useState(messages.length)
  const [wasFullscreen, setWasFullscreen] = useState(fullscreen)
  if (wasFullscreen !== fullscreen) {
    setWasFullscreen(fullscreen)
    setStart(messages.length)
  }
  const [expired, setExpired] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Cap before filtering so a burst that scrolls a line off never resurfaces it.
  const shown = fullscreen
    ? messages.slice(start).filter((m) => m.user_id !== userId).slice(-MAX_SHOWN).filter((m) => !expired.has(m.id))
    : []

  useEffect(() => {
    for (const m of shown) {
      if (timers.current.has(m.id)) continue
      timers.current.set(m.id, setTimeout(() => {
        timers.current.delete(m.id)
        setExpired((s) => new Set(s).add(m.id))
      }, LINGER_MS))
    }
  })
  useEffect(() => {
    const pending = timers.current
    return () => { for (const t of pending.values()) clearTimeout(t) }
  }, [])

  if (!shown.length) return null
  return (
    <div className="fs-chat" aria-live="polite">
      {shown.map((m) => (
        <div className="fs-msg" key={m.id}>
          <UserAvatar name={m.name} src={m.user_id ? profiles.get(m.user_id)?.avatar_url : undefined} className="size-6 text-[10px]" />
          <span className="fs-who" style={{ color: `hsl(${hue(m.name)} 80% 75%)` }}>{m.name}</span>
          <span className="fs-body">{displayBody(m.body)}</span>
        </div>
      ))}
    </div>
  )
}
