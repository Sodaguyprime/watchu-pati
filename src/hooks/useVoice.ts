import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { userId } from '../lib/profile'
import { ROOM, supabase } from '../lib/supabase'
import { peerId } from './useSync'

// Voice channel: a full mesh of WebRTC audio connections. Fine for a handful
// of people (every member uploads once per peer). Signaling rides the
// Supabase broadcast channel; presence on the same channel is the member list,
// which everyone watches even before joining (that is the "3 in voice" count).

export type VoiceMember = { peerId: string; userId: string; name: string; muted: boolean; joinedAt: number }

type Signal =
  | { to: string; from: string; kind: 'offer'; sdp: string }
  | { to: string; from: string; kind: 'answer'; sdp: string }
  | { to: string; from: string; kind: 'ice'; candidate: RTCIceCandidateInit }

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
}
const SPEAKING_LEVEL = 0.02 // RMS threshold on a 0..1 scale
const SPEAKING_POLL_MS = 80
const DEAD_AFTER_MS = 3000 // digital silence this long = the input is not delivering audio

// Ask Opus for more bits than the default (~32 kbps) and enable in-band FEC so
// a lost packet degrades quality instead of dropping a syllable.
function tuneOpus(sdp: string) {
  const pt = sdp.match(/a=rtpmap:(\d+) opus\/48000/i)?.[1]
  if (!pt) return sdp
  const extra = 'maxaveragebitrate=96000;useinbandfec=1;stereo=0;cbr=0'
  const re = new RegExp(`a=fmtp:${pt} (.*)`)
  return re.test(sdp)
    ? sdp.replace(re, (_, params: string) => `a=fmtp:${pt} ${params};${extra}`)
    : sdp.replace(`a=rtpmap:${pt} opus/48000/2`, `a=rtpmap:${pt} opus/48000/2\r\na=fmtp:${pt} ${extra}`)
}

type Peer = { pc: RTCPeerConnection; audio: HTMLAudioElement; analyser?: AnalyserNode }

export function useVoice(name: string) {
  const [members, setMembers] = useState<VoiceMember[]>([])
  const [joined, setJoined] = useState(false)
  const [muted, setMuted] = useState(false)
  const [speaking, setSpeaking] = useState<Set<string>>(() => new Set())
  const [level, setLevel] = useState(0) // own mic, 0..1, roughly perceptual
  // Which input Chrome actually opened, and whether anything is coming out of it.
  const [mic, setMic] = useState<{ label: string; dead: boolean }>({ label: '', dead: false })
  const [error, setError] = useState<string | null>(null)

  const channel = useRef<RealtimeChannel | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const peers = useRef(new Map<string, Peer>())
  const ctx = useRef<AudioContext | null>(null)
  const localAnalyser = useRef<AnalyserNode | null>(null)
  const membersRef = useRef<VoiceMember[]>([])
  const joinedAt = useRef(0)
  const nameRef = useRef(name)
  useEffect(() => { nameRef.current = name }, [name])
  const mutedRef = useRef(false)

  const send = useCallback((s: Signal) => {
    channel.current?.send({ type: 'broadcast', event: 'signal', payload: s })
  }, [])

  const track = useCallback(() => {
    channel.current?.track({
      peerId, userId, name: nameRef.current, muted: mutedRef.current, joinedAt: joinedAt.current,
    } satisfies VoiceMember)
  }, [])

  // ---- per-peer connections ----

  const closePeer = useCallback((id: string) => {
    const p = peers.current.get(id)
    if (!p) return
    p.pc.close()
    p.audio.srcObject = null
    p.audio.remove()
    peers.current.delete(id)
  }, [])

  const analyse = useCallback((s: MediaStream): AnalyserNode | undefined => {
    const ac = ctx.current
    if (!ac) return
    const node = ac.createAnalyser()
    node.fftSize = 512
    ac.createMediaStreamSource(s).connect(node)
    return node
  }, [])

  const createPeer = useCallback((id: string, initiator: boolean) => {
    closePeer(id)
    const pc = new RTCPeerConnection(ICE)
    const audio = new Audio()
    audio.autoplay = true
    const peer: Peer = { pc, audio }
    peers.current.set(id, peer)

    const mic = stream.current?.getAudioTracks()[0]
    if (mic && !mutedRef.current) pc.addTrack(mic, stream.current!)
    else pc.addTransceiver('audio', { direction: 'sendrecv' }) // muted: sender exists, no track yet

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) send({ to: id, from: peerId, kind: 'ice', candidate: candidate.toJSON() })
    }
    pc.ontrack = ({ streams: [s] }) => {
      audio.srcObject = s
      audio.play().catch(() => { /* we joined via a click, so this should not be blocked */ })
      peer.analyser = analyse(s)
      // Lowest playout delay the browser will give us (Chrome-only hint, harmless elsewhere).
      for (const r of pc.getReceivers()) (r as RTCRtpReceiver & { playoutDelayHint?: number }).playoutDelayHint = 0
    }
    pc.onconnectionstatechange = () => {
      if (import.meta.env.DEV) console.debug('[voice]', id.slice(0, 4), pc.connectionState)
      if (pc.connectionState === 'failed' && initiator) pc.restartIce()
    }
    pc.onnegotiationneeded = async () => {
      if (!initiator) return
      const offer = await pc.createOffer()
      await pc.setLocalDescription({ type: 'offer', sdp: tuneOpus(offer.sdp!) })
      send({ to: id, from: peerId, kind: 'offer', sdp: pc.localDescription!.sdp })
    }
    return pc
  }, [analyse, closePeer, send])

  const onSignal = useCallback(async (s: Signal) => {
    if (s.to !== peerId || !stream.current) return
    let peer = peers.current.get(s.from)
    switch (s.kind) {
      case 'offer': {
        const pc = createPeer(s.from, false)
        await pc.setRemoteDescription({ type: 'offer', sdp: s.sdp })
        const answer = await pc.createAnswer()
        await pc.setLocalDescription({ type: 'answer', sdp: tuneOpus(answer.sdp!) })
        send({ to: s.from, from: peerId, kind: 'answer', sdp: pc.localDescription!.sdp })
        break
      }
      case 'answer':
        await peer?.pc.setRemoteDescription({ type: 'answer', sdp: s.sdp })
        break
      case 'ice':
        // ICE can race ahead of the offer; the browser queues candidates once
        // a remote description exists, and drops them (harmlessly) before.
        peer = peers.current.get(s.from)
        await peer?.pc.addIceCandidate(s.candidate).catch(() => {})
        break
    }
  }, [createPeer, send])

  // ---- channel: everyone listens; only members track presence ----

  useEffect(() => {
    const ch = supabase.channel(`${ROOM}-voice`, {
      config: { broadcast: { self: false }, presence: { key: peerId } },
    })
    channel.current = ch

    ch.on('broadcast', { event: 'signal' }, ({ payload }) => onSignal(payload as Signal))

    ch.on('presence', { event: 'sync' }, () => {
      const list = Object.values(ch.presenceState<VoiceMember>()).flat().sort((a, b) => a.joinedAt - b.joinedAt)
      membersRef.current = list
      setMembers(list)

      if (!stream.current) return
      const me = list.find((m) => m.peerId === peerId)
      if (!me) return
      // Whoever joined later makes the offer, so each pair connects exactly once.
      for (const m of list) {
        if (m.peerId === peerId || peers.current.has(m.peerId)) continue
        if (me.joinedAt > m.joinedAt || (me.joinedAt === m.joinedAt && peerId > m.peerId)) createPeer(m.peerId, true)
      }
      for (const id of peers.current.keys()) {
        if (!list.some((m) => m.peerId === id)) closePeer(id)
      }
    })

    ch.subscribe()
    return () => {
      supabase.removeChannel(ch)
      channel.current = null
    }
  }, [onSignal, createPeer, closePeer])

  // ---- speaking detection (local + every remote) ----

  useEffect(() => {
    if (!joined) return
    const buf = new Float32Array(512)
    const level = (a: AnalyserNode) => {
      a.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      return Math.sqrt(sum / buf.length)
    }
    let peak = 0
    let peakAt = 0
    let lastSignalAt = Date.now()
    const id = window.setInterval(() => {
      const next = new Set<string>()
      // Meter reads the raw mic even while muted so you can check it before unmuting.
      const mine = localAnalyser.current ? level(localAnalyser.current) : 0
      const now = Date.now()
      // Fast attack, slow decay: hold the peak briefly so the readout doesn't flicker between words.
      const shaped = Math.min(1, Math.sqrt(mine * 4)) // sqrt so quiet speech still moves the bar
      if (shaped >= peak || now - peakAt > 400) { peak = shaped; peakAt = now }
      setLevel(peak)
      // A live mic always has a noise floor; exact digital silence (or the OS
      // flagging the track muted) for a few seconds means nothing is arriving.
      const t = stream.current?.getAudioTracks()[0]
      if (mine > 1e-6) lastSignalAt = now
      const dead = !!t && (t.muted || t.readyState === 'ended' || now - lastSignalAt > DEAD_AFTER_MS)
      setMic((m) => (m.dead === dead ? m : { ...m, dead }))
      if (!mutedRef.current && mine > SPEAKING_LEVEL) next.add(peerId)
      for (const [pid, p] of peers.current) if (p.analyser && level(p.analyser) > SPEAKING_LEVEL) next.add(pid)
      setSpeaking((prev) => (prev.size === next.size && [...next].every((x) => prev.has(x)) ? prev : next))
    }, SPEAKING_POLL_MS)
    return () => window.clearInterval(id)
  }, [joined])

  // ---- actions ----

  const leave = useCallback(() => {
    for (const id of [...peers.current.keys()]) closePeer(id)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    ctx.current?.close()
    ctx.current = null
    localAnalyser.current = null
    channel.current?.untrack()
    setJoined(false)
    setSpeaking(new Set())
    setLevel(0)
    setMic({ label: '', dead: false })
  }, [closePeer])

  const join = useCallback(async () => {
    if (stream.current) return
    setError(null)
    // Create the context synchronously inside the click: after the permission
    // prompt the user activation may have expired and Chrome would start it suspended.
    ctx.current ??= new AudioContext()
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      })
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Microphone access was blocked' : 'No microphone found')
      return
    }
    if (ctx.current.state !== 'running') ctx.current.resume().catch(() => {})
    localAnalyser.current = analyse(stream.current) ?? null
    setMic({ label: stream.current.getAudioTracks()[0]?.label ?? '', dead: false })
    joinedAt.current = Date.now()
    setJoined(true)
    track() // presence sync fires from here and opens connections to everyone already in
  }, [analyse, track])

  // Mute by detaching the track from every sender (nothing goes out at all).
  // The local track stays live so the mic meter keeps working while muted.
  const toggleMute = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    setMuted(next)
    const t = stream.current?.getAudioTracks()[0] ?? null
    for (const p of peers.current.values()) {
      for (const s of p.pc.getSenders()) if (s.track?.kind === 'audio' || !s.track) s.replaceTrack(next ? null : t)
    }
    if (stream.current) track()
  }, [track])

  // Name changed while in voice: refresh the presence row.
  useEffect(() => { if (stream.current) track() }, [name, track])

  // Tab closing: release the mic and drop out of presence.
  useEffect(() => () => leave(), [leave])

  return { members, joined, muted, speaking, level, mic, error, join, leave, toggleMute }
}
