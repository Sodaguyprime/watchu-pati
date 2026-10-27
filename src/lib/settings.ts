import { useCallback, useEffect, useState } from 'react'

export type Layout = 'classic' | 'theater'

export type Settings = {
  layout: Layout
  // Chat lines ghosting into the corner while the player is fullscreen.
  fullscreenChat: boolean
}

const KEY = 'wt:settings'
const DEFAULTS: Settings = { layout: 'classic', fullscreenChat: true }

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return DEFAULTS
  }
}

// Per-device preferences; nothing here is shared with the room.
export function useSettings() {
  const [settings, setSettings] = useState(load)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* private mode */ }
    // The page background and modals live outside .app, so the layout is on <html> too.
    document.documentElement.dataset.layout = settings.layout
  }, [settings])

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])
  return [settings, update] as const
}
