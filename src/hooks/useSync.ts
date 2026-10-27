import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { userId } from '../lib/profile'
import { ROOM, supabase } from '../lib/supabase'

// Every message goes to everyone in the room, including the sender (self: true).
type Msg =
  | { type: 'select'; videoId: string }
  | { type: 'play-request'; time: number; from: string }
  | { type: 'ready'; from: string; forTime: number }
  | { type: 'go'; time: number; at: number }
  | { type: 'pause'; time: number }
  | { type: 'seek'; time: number }
  | { type: 'tick'; time: number; playing: boolean }
  | { type: 'state-request'; from: string }
  | { type: 'state'; to: string; videoId: string | null; time: number; playing: boolean }

export type Presence = { peerId: string; userId: string; name: string; joinedAt: number }

export type SyncStatus = 'connecting' | 'idle' | 'waiting' | 'playing' | 'paused' | 'blocked'

const TICK_MS = 2000
const SEEK_THRESHOLD = 1.0 // seconds of drift before we hard-seek
const NUDGE_THRESHOLD = 0.15 // below this we consider ourselves in sync
const READY_TIMEOUT_MS = 8000 // start anyway if a peer never reports ready
const GO_LEAD_MS = 400 // how far in the future the shared start is scheduled

export const peerId = crypto.randomUUID()
// Fixed for the life of the tab so re-tracking (name change) keeps host order.
const joinedAt = Date.now()

export function useSync(name: string) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatusState] = useState<SyncStatus>('connecting')
  const statusRef = useRef<SyncStatus>('connecting')
  const setStatus = useCallback((s: SyncStatus) => {
    statusRef.current = s
    setStatusState(s)
  }, [])
  const [peers, setPeers] = useState<Presence[]>([])
  const [videoId, setVideoId] = useState<string | null>(null)

  const channel = useRef<RealtimeChannel | null>(null)
  const nameRef = useRef(name)
  useEffect(() => { nameRef.current = name }, [name])
  const videoIdRef = useRef<string | null>(null)
  const peersRef = useRef<Presence[]>([])
  // Handshake in progress: who has buffered the requested position
  const pending = useRef<{ time: number; ready: Set<string>; timer: number } | null>(null)

  const isHost = peers.length > 0 && peers[0].peerId === peerId

  const send = useCallback((msg: Msg) => {
    channel.current?.send({ type: 'broadcast', event: 'msg', payload: msg })
  }, [])

  // ---- helpers acting on the <video> ----

  // Pause, then seek only once the 'pause' event has fired. Seeking in the
  // same tick as pause() leaves the element mid-seek when the pause event is
  // dispatched, and the player UI ignores pause events in that state.
  const pauseThenSeek = useCallback((v: HTMLVideoElement, time: number) => {
    const seek = () => {
      if (Math.abs(v.currentTime - time) > NUDGE_THRESHOLD) v.currentTime = time
    }
    if (v.paused) return seek()
    v.addEventListener('pause', seek, { once: true })
    v.pause()
  }, [])

  const waitUntilBuffered = useCallback((time: number): Promise<void> => {
    const v = video.current
    if (!v) return Promise.resolve()
    return new Promise((resolve) => {
      const check = () => {
        for (let i = 0; i < v.buffered.length; i++) {
          if (v.buffered.start(i) <= time && v.buffered.end(i) >= time + 3) return true
        }
        return v.readyState >= 4 // HAVE_ENOUGH_DATA
      }
      if (check()) return resolve()
      const onProgress = () => {
        if (check()) {
          v.removeEventListener('progress', onProgress)
          v.removeEventListener('canplaythrough', onProgress)
          resolve()
        }
      }
      v.addEventListener('progress', onProgress)
      v.addEventListener('canplaythrough', onProgress)
    })
  }, [video])

  // Browsers refuse play() until the user has clicked the page. When that
  // happens we show an overlay; clicking it calls resume().
  const safePlay = useCallback(() => {
    video.current?.play().then(
      () => setStatus('playing'),
      () => setStatus('blocked'),
    )
  }, [setStatus])

  const startGo = useCallback((time: number) => {
    pending.current = null
    send({ type: 'go', time, at: Date.now() + GO_LEAD_MS })
  }, [send])

  const beginHandshake = useCallback((time: number) => {
    if (pending.current) window.clearTimeout(pending.current.timer)
    pending.current = {
      time,
      ready: new Set(),
      timer: window.setTimeout(() => startGo(time), READY_TIMEOUT_MS),
    }
    send({ type: 'play-request', time, from: peerId })
  }, [send, startGo])

  // ---- incoming messages ----

  const handle = useCallback(async (msg: Msg) => {
    const v = video.current
    if (import.meta.env.DEV) console.debug('[sync]', msg.type, msg, 'host=', peersRef.current[0]?.peerId === peerId)
    switch (msg.type) {
      case 'select':
        videoIdRef.current = msg.videoId
        setVideoId(msg.videoId)
        setStatus('paused')
        break

      case 'play-request': {
        if (!v) break
        pauseThenSeek(v, msg.time)
        setStatus('waiting')
        await waitUntilBuffered(msg.time)
        send({ type: 'ready', from: peerId, forTime: msg.time })
        break
      }

      case 'ready': {
        const p = pending.current
        if (!p || p.time !== msg.forTime) break
        p.ready.add(msg.from)
        const everyone = peersRef.current.every((x) => p.ready.has(x.peerId))
        if (everyone) {
          window.clearTimeout(p.timer)
          startGo(p.time)
        }
        break
      }

      case 'go': {
        if (!v) break
        v.playbackRate = 1
        v.currentTime = msg.time
        const delay = Math.max(0, msg.at - Date.now())
        window.setTimeout(safePlay, delay)
        break
      }

      case 'pause':
        if (!v) break
        v.playbackRate = 1
        pauseThenSeek(v, msg.time)
        setStatus('paused')
        break

      case 'seek':
        if (!v) break
        v.currentTime = msg.time
        break

      case 'tick': {
        // Only followers correct; host is the clock.
        if (!v || peersRef.current[0]?.peerId === peerId) break
        if (!msg.playing) break
        if (v.paused) {
          // The browser paused us on its own (headphones unplugged, tab throttled...):
          // catch back up. Anything else in flight (handshake, pause) is not 'playing'.
          if (statusRef.current === 'playing') {
            v.currentTime = msg.time
            safePlay()
          }
          break
        }
        const drift = msg.time - v.currentTime
        if (Math.abs(drift) > SEEK_THRESHOLD) {
          v.currentTime = msg.time
          v.playbackRate = 1
        } else if (Math.abs(drift) > NUDGE_THRESHOLD) {
          v.playbackRate = drift > 0 ? 1.05 : 0.95
        } else {
          v.playbackRate = 1
        }
        break
      }

      case 'state-request':
        if (peersRef.current[0]?.peerId !== peerId) break
        send({
          type: 'state',
          to: msg.from,
          videoId: videoIdRef.current,
          time: v?.currentTime ?? 0,
          playing: !!v && !v.paused,
        })
        break

      case 'state':
        if (msg.to !== peerId) break
        if (msg.videoId) {
          videoIdRef.current = msg.videoId
          setVideoId(msg.videoId)
          setStatus(msg.playing ? 'playing' : 'paused')
          // Give the element a moment to load the new source before seeking
          window.setTimeout(() => {
            const vv = video.current
            if (!vv) return
            vv.currentTime = msg.time
            if (msg.playing) safePlay()
          }, 500)
        } else {
          setStatus('idle')
        }
        break
    }
  }, [video, send, setStatus, startGo, safePlay, waitUntilBuffered, pauseThenSeek])

  // ---- channel lifecycle ----

  useEffect(() => {
    const ch = supabase.channel(ROOM, {
      config: { broadcast: { self: true }, presence: { key: peerId } },
    })
    channel.current = ch

    ch.on('broadcast', { event: 'msg' }, ({ payload }) => handle(payload as Msg))

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<Presence>()
      const list = Object.values(state)
        .flat()
        .sort((a, b) => a.joinedAt - b.joinedAt)
      peersRef.current = list
      setPeers(list)
      if (import.meta.env.DEV) console.debug('[sync] presence', list.map((p) => p.peerId.slice(0, 4)))
    })

    ch.subscribe(async (s) => {
      if (s !== 'SUBSCRIBED') return
      await ch.track({ peerId, userId, name: nameRef.current, joinedAt } satisfies Presence)
      setStatus('idle')
      send({ type: 'state-request', from: peerId })
    })

    return () => {
      supabase.removeChannel(ch)
      channel.current = null
    }
  }, [handle, send, setStatus])

  // Name changed after joining: re-track so the online list updates.
  useEffect(() => {
    const ch = channel.current
    if (ch?.state === 'joined') ch.track({ peerId, userId, name, joinedAt } satisfies Presence)
  }, [name])

  // Host heartbeat
  useEffect(() => {
    if (!isHost) return
    const id = window.setInterval(() => {
      const v = video.current
      if (!v || !videoIdRef.current) return
      send({ type: 'tick', time: v.currentTime, playing: !v.paused })
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [isHost, send, video])

  // ---- public actions ----

  const select = useCallback((id: string) => send({ type: 'select', videoId: id }), [send])
  const play = useCallback(() => beginHandshake(video.current?.currentTime ?? 0), [beginHandshake, video])
  const pause = useCallback(() => send({ type: 'pause', time: video.current?.currentTime ?? 0 }), [send, video])
  const seek = useCallback((time: number) => {
    const v = video.current
    if (!v) return
    if (v.paused) send({ type: 'seek', time })
    else beginHandshake(time)
  }, [beginHandshake, send, video])

  // Local only: the others are already playing, just catch up (ticks fix the drift).
  const resume = useCallback(() => safePlay(), [safePlay])

  return { videoRef: video, status, peers, isHost, videoId, select, play, pause, seek, resume }
}
