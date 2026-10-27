import { useEffect, useMemo, useState } from 'react'
import HLS from 'hls.js'
import {
  MediaPlayer,
  MediaProvider,
  Track,
  isHLSProvider,
  isVideoProvider,
  LocalMediaStorage,
  type MediaPlayerInstance,
  type MediaProviderAdapter,
} from '@vidstack/react'
import '@vidstack/react/player/styles/base.css'
import { FullscreenChat } from './FullscreenChat'
import { PlayerControls } from './PlayerControls'
import type { Message } from '../hooks/useChat'
import type { SyncStatus } from '../hooks/useSync'
import type { Profile } from '../lib/profile'
import { formatOf, type Subtitle } from '../lib/subtitles'

type Props = {
  playerRef: React.RefObject<MediaPlayerInstance | null>
  videoRef: React.RefObject<HTMLVideoElement | null>
  src: string
  subtitles: Subtitle[]
  status: SyncStatus
  messages: Message[]
  profiles: Map<string, Profile>
  fullscreenChat: boolean
  onPlay: () => void
  onPause: () => void
  onSeek: (t: number) => void
  onResume: () => void
}

// Remember volume/captions across visits, but never the playhead: the room
// decides where we are, not localStorage.
class RoomStorage extends LocalMediaStorage {
  override async getTime() { return null }
  override async setTime() {}
}
const storage = new RoomStorage()

export function Player({ playerRef: player, videoRef, src, subtitles, status, messages, profiles, fullscreenChat, onPlay, onPause, onSeek, onResume }: Props) {
  const [error, setError] = useState<string | null>(null)
  // Stable identity: a fresh object every render makes Vidstack re-select its provider
  const source = useMemo(() => ({ src, type: 'application/x-mpegurl' as const }), [src])

  // Every control in the layout (buttons, tap gestures, keyboard
  // shortcuts) emits a media-*-request event that bubbles to the player.
  // Catch them in the capture phase, cancel Vidstack's own handling, and route
  // them through the room so nobody's player moves alone. useSync drives the
  // <video> element directly once everyone has agreed.
  useEffect(() => {
    const el = player.current?.el
    if (!el) return
    // load="custom": start loading immediately so followers can buffer before
    // the host presses play.
    player.current?.startLoading()
    const intercept = (fn: (e: CustomEvent<number>) => void) => (e: Event) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      fn(e as CustomEvent<number>)
    }
    const handlers: [string, EventListener][] = [
      ['media-play-request', intercept(() => onPlay())],
      ['media-pause-request', intercept(() => onPause())],
      ['media-seek-request', intercept((e) => onSeek(e.detail))],
    ]
    for (const [type, h] of handlers) el.addEventListener(type, h, { capture: true })
    return () => {
      for (const [type, h] of handlers) el.removeEventListener(type, h, { capture: true })
    }
  }, [player, onPlay, onPause, onSeek])

  const onProviderChange = (provider: MediaProviderAdapter | null) => {
    if (isHLSProvider(provider)) {
      provider.library = HLS
      provider.config = { maxBufferLength: 60 }
    }
  }

  // Hand the real <video> element to useSync
  const onProviderSetup = (provider: MediaProviderAdapter) => {
    if (isHLSProvider(provider) || isVideoProvider(provider)) videoRef.current = provider.video
  }

  return (
    <MediaPlayer
      ref={player}
      className={`player ${error ? 'has-error' : ''}`}
      src={source}
      crossOrigin
      playsInline
      fullscreenOrientation="landscape"
      storage={storage}
      load="custom"
      controlsDelay={1000}
      onProviderChange={onProviderChange}
      onProviderSetup={onProviderSetup}
      onError={(detail) => setError(`Video failed to load (${detail.message || 'media error'})`)}
      onHlsError={(data) => {
        const code = data.response?.code
        if (data.fatal && code) setError(`Video failed to load (HTTP ${code})`)
      }}
    >
      <MediaProvider>
        {subtitles.map((t) => (
          <Track key={t.id} src={t.url} kind="subtitles" label={t.label} language={t.lang} type={formatOf(t.url)} />
        ))}
      </MediaProvider>
      <PlayerControls status={status} />
      {fullscreenChat && <FullscreenChat messages={messages} profiles={profiles} />}

      {error ? (
        <div className="overlay">{error}</div>
      ) : status === 'waiting' ? (
        <div className="overlay">Waiting for everyone to buffer…</div>
      ) : null}
      {status === 'blocked' && (
        <button className="overlay clickable" onClick={onResume}>Click to join playback</button>
      )}
    </MediaPlayer>
  )
}
