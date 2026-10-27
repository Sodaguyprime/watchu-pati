import { useRef, useState } from 'react'
import { CameraIcon } from 'lucide-react'
import { UserAvatar } from './UserAvatar'

type Props = {
  initial: string
  avatarUrl: string | null
  onDone: (name: string) => void
  onAvatar: (file: File) => Promise<void>
}

export function NamePrompt({ initial, avatarUrl, onDone, onAvatar }: Props) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const ok = value.trim().length > 0

  const pick = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    setError('')
    try {
      await onAvatar(f)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <form
        className="card modal"
        onSubmit={(e) => { e.preventDefault(); if (ok) onDone(value) }}
      >
        <img className="banner modal-banner" src="/banner.webp" alt="" width="1600" height="640" />
        <h2>What should we call you?</h2>
        <p className="muted">Shown next to your chat messages. You can change it later.</p>

        <div className="pfp-row">
          <button
            type="button"
            className={`pfp-pick ${busy ? 'busy' : ''}`}
            onClick={() => file.current?.click()}
            aria-label="Choose a profile picture"
            disabled={busy}
          >
            <UserAvatar name={value || '?'} src={avatarUrl} className="size-16 text-xl" />
            <span className="pfp-badge"><CameraIcon size={14} /></span>
          </button>
          <div>
            <strong>Profile picture</strong>
            <p className="muted">{busy ? 'Uploading…' : 'Optional. Square-cropped, 256px.'}</p>
            {error && <p className="error">{error}</p>}
          </div>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }}
          />
        </div>

        <input
          autoFocus
          maxLength={24}
          placeholder="Your name"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="btn primary" disabled={!ok || busy}>Let's go</button>
      </form>
    </div>
  )
}
