import { useEffect, useId, useRef, useState } from 'react'
import { Maximize, MessageSquareText, Settings as SettingsIcon, XIcon } from 'lucide-react'
import type { Layout, Settings as SettingsState } from '../lib/settings'

type Props = {
  settings: SettingsState
  onChange: (patch: Partial<SettingsState>) => void
  canFullscreen: boolean
  onFullscreen: () => void
}

const LAYOUTS: { value: Layout; label: string; hint: string }[] = [
  { value: 'classic', label: 'Classic', hint: 'Sticker cards, everything stacked' },
  { value: 'theater', label: 'Theater', hint: 'Dark, player pinned, chat fills the screen' },
]

// Gear in the top bar. A popover under the button on wide screens, a bottom
// sheet on phones (same markup, CSS decides).
export function Settings({ settings, onChange, canFullscreen, onFullscreen }: Props) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', key)
    panel.current?.focus()
    return () => document.removeEventListener('keydown', key)
  }, [open])

  return (
    <div className="settings">
      <button
        type="button"
        className={`icon-btn settings-btn ${open ? 'on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Settings"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SettingsIcon size={18} strokeWidth={2.4} />
      </button>

      {open && (
        <>
          <div className="settings-scrim" onClick={() => setOpen(false)} />
          <div
            ref={panel}
            className="card settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
          >
            <span className="sheet-grip" aria-hidden="true" />
            <div className="settings-head">
              <h2 id={titleId}>Settings</h2>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close settings">
                <XIcon size={16} />
              </button>
            </div>

            <fieldset className="settings-group">
              <legend>Layout</legend>
              <div className="layout-opts">
                {LAYOUTS.map((l) => (
                  <label key={l.value} className={`layout-opt ${settings.layout === l.value ? 'on' : ''}`}>
                    <input
                      type="radio"
                      name="layout"
                      value={l.value}
                      checked={settings.layout === l.value}
                      onChange={() => onChange({ layout: l.value })}
                    />
                    <span className={`layout-thumb layout-thumb-${l.value}`} aria-hidden="true">
                      <i /><i /><i />
                    </span>
                    <strong>{l.label}</strong>
                    <span className="layout-hint">{l.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="settings-group">
              <legend>Fullscreen</legend>
              <button
                type="button"
                className="btn primary settings-fs"
                disabled={!canFullscreen}
                onClick={() => { setOpen(false); onFullscreen() }}
              >
                <Maximize size={16} strokeWidth={2.6} />
                {canFullscreen ? 'Watch fullscreen' : 'Pick a video first'}
              </button>
              <label className="switch-row">
                <MessageSquareText size={18} strokeWidth={2.2} aria-hidden="true" />
                <span>
                  <strong>Chat popups</strong>
                  <span className="muted">New messages flash in the corner while fullscreen</span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={settings.fullscreenChat}
                  onChange={(e) => onChange({ fullscreenChat: e.target.checked })}
                />
              </label>
            </fieldset>
          </div>
        </>
      )}
    </div>
  )
}
