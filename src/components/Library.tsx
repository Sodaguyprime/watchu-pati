import { useState } from 'react'
import { removeVideo, thumbnailFor, type Video } from '../lib/videos'
import { AddVideo } from './AddVideo'

type Props = {
  videos: Video[]
  loading: boolean
  activeId: string | null
  disabled: boolean
  onSelect: (id: string) => void
}

export function Library({ videos, loading, activeId, disabled, onSelect }: Props) {
  const [adding, setAdding] = useState(false)

  return (
    <section className="library">
      <div className="tabs">
        <span className="pill active">All</span>
        <span className="pill">{videos.length} video{videos.length === 1 ? '' : 's'}</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setAdding((a) => !a)}>
          {adding ? '× Close' : '+ Add link'}
        </button>
      </div>

      {adding && <AddVideo onClose={() => setAdding(false)} />}

      {loading ? (
        <p className="muted">Loading library…</p>
      ) : videos.length === 0 ? (
        <p className="muted">Nothing here yet. Add a stream link to get started.</p>
      ) : (
        <div className="grid">
          {videos.map((v) => {
            const thumb = thumbnailFor(v)
            const active = v.id === activeId
            return (
              <article key={v.id} className={`card video-card ${active ? 'active' : ''}`}>
                <button className="thumb" disabled={disabled} onClick={() => onSelect(v.id)}>
                  {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="thumb-empty">▶</div>}
                  {active && <span className="badge">Now playing</span>}
                </button>
                <div className="video-meta">
                  <h3>{v.title}</h3>
                  <button
                    className="icon-btn"
                    title="Remove"
                    onClick={() => { if (confirm(`Remove "${v.title}"?`)) removeVideo(v.id) }}
                  >
                    ×
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
