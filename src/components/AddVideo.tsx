import { useState } from 'react'
import { addVideo, deriveThumbnail } from '../lib/videos'

export function AddVideo({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [thumb, setThumb] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const auto = deriveThumbnail(url.trim())
  const preview = thumb.trim() || auto
  const valid = title.trim() && /^https?:\/\/.+/i.test(url.trim())

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setErr(null)
    try {
      await addVideo({ title, url, thumbnail_url: thumb })
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card add-form" onSubmit={submit}>
      <div className="add-fields">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Movie night" required />
        </label>
        <label>
          Stream URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…/playlist.m3u8"
            inputMode="url"
            required
          />
        </label>
        <label>
          Thumbnail URL <span className="muted">(optional{auto ? ', auto-detected' : ''})</span>
          <input value={thumb} onChange={(e) => setThumb(e.target.value)} placeholder={auto ?? 'https://…/cover.jpg'} inputMode="url" />
        </label>
      </div>
      <div className="add-preview">
        {preview ? <img src={preview} alt="" /> : <div className="thumb-empty">No thumbnail</div>}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!valid || busy}>{busy ? 'Adding…' : 'Add video'}</button>
      </div>
    </form>
  )
}
