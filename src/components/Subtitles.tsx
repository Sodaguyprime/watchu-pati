import { useRef, useState } from 'react'
import { addSubtitle, removeSubtitle, uploadSubtitleFile, type Subtitle } from '../lib/subtitles'

type Props = { videoId: string; subs: Subtitle[] }

export function Subtitles({ videoId, subs }: Props) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [lang, setLang] = useState('en')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const valid = label.trim() && (file || /^https?:\/\/.+\.(vtt|srt)(\?.*)?$/i.test(url.trim()))

  const reset = () => {
    setLabel('')
    setLang('en')
    setUrl('')
    setFile(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setErr(null)
    try {
      const src = file ? await uploadSubtitleFile(videoId, file) : url
      await addSubtitle({ video_id: videoId, label, lang, url: src })
      reset()
      setOpen(false)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="subs">
      <div className="subs-head">
        <strong>Subtitles</strong>
        {subs.map((s) => (
          <span key={s.id} className="pill">
            {s.label} <span className="muted">· {s.lang}</span>
            <button
              className="pill-x"
              aria-label={`Remove ${s.label}`}
              onClick={() => { if (confirm(`Remove "${s.label}" subtitles?`)) removeSubtitle(s) }}
            >
              ×
            </button>
          </span>
        ))}
        {subs.length === 0 && <span className="muted">none yet</span>}
        <span className="spacer" />
        <button className="btn" onClick={() => setOpen((o) => !o)}>{open ? '× Close' : '+ Add subtitles'}</button>
      </div>

      {open && (
        <form className="card add-form subs-form" onSubmit={submit}>
          <div className="add-fields">
            <div className="row two">
              <label>
                Label
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="English" required />
              </label>
              <label>
                Language code
                <input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="en" maxLength={8} />
              </label>
            </div>
            <label>
              Subtitle file <span className="muted">(.vtt or .srt)</span>
              <input
                ref={fileInput}
                type="file"
                accept=".vtt,.srt,text/vtt,application/x-subrip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              …or a URL <span className="muted">(used if no file is chosen)</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…/captions/en.vtt"
                inputMode="url"
                disabled={!!file}
              />
            </label>
          </div>
          {err && <p className="error">{err}</p>}
          <div className="row">
            <button type="button" className="btn" onClick={() => { reset(); setOpen(false) }}>Cancel</button>
            <button className="btn primary" disabled={!valid || busy}>{busy ? 'Saving…' : 'Add'}</button>
          </div>
        </form>
      )}
    </div>
  )
}
