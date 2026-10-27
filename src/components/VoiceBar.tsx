import { Headphones, Mic, MicOff, PhoneOff } from 'lucide-react'
import type { Profile } from '@/lib/profile'
import type { VoiceMember } from '@/hooks/useVoice'
import { peerId } from '@/hooks/useSync'
import { UserAvatar } from './UserAvatar'
import { Button } from './ui/button'

type Props = {
  members: VoiceMember[]
  joined: boolean
  muted: boolean
  speaking: Set<string>
  level: number // own mic, 0..1
  mic: Mic
  error: string | null
  profiles: Map<string, Profile>
  disabled: boolean
  onJoin: () => void
  onLeave: () => void
  onMute: () => void
}

type Mic = { label: string; dead: boolean }

const SEGMENTS = 8

function MicMeter({ level, muted, mic }: { level: number; muted: boolean; mic: Mic }) {
  const lit = Math.round(level * SEGMENTS)
  // "No signal" is about the input being dead, not about you being quiet.
  const state = mic.dead ? 'silent' : muted ? 'muted' : lit >= SEGMENTS ? 'loud' : 'good'
  const label = { muted: 'Muted', silent: 'No signal', good: 'Mic OK', loud: 'Too loud' }[state]
  return (
    <div className={`mic-meter ${state}`} title={mic.label ? `Using: ${mic.label}` : 'Your mic level'} aria-live="polite">
      <div className="mic-bars" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <i key={i} className={i < lit ? 'on' : ''} />
        ))}
      </div>
      <span className="mic-label">{label}</span>
      {mic.dead && mic.label && <span className="mic-device">{mic.label}</span>}
    </div>
  )
}

export function VoiceBar({ members, joined, muted, speaking, level, mic, error, profiles, disabled, onJoin, onLeave, onMute }: Props) {
  const n = members.length
  return (
    <section className={`voicebar ${joined ? 'in' : ''}`} aria-label="Voice channel">
      <div className="voice-head">
        <Headphones size={18} />
        <strong>Voice</strong>
        <span className={`pill voice-count ${n ? 'live' : ''}`}>
          <span className="dot" />
          {n === 0 ? 'empty' : `${n} in voice`}
        </span>
      </div>

      <ul className="voice-members" role="list">
        {members.map((m) => (
          <li
            key={m.peerId}
            className={`${speaking.has(m.peerId) ? 'speaking' : ''} ${m.muted ? 'muted' : ''}`}
            title={m.name || 'Anonymous'}
          >
            <UserAvatar name={m.name || '?'} src={profiles.get(m.userId)?.avatar_url} className="size-8 text-[11px]" />
            {m.muted && <MicOff size={10} className="voice-badge" />}
            <span className="voice-name">{m.peerId === peerId ? 'you' : m.name || 'Anonymous'}</span>
          </li>
        ))}
        {n === 0 && <li className="muted voice-empty">Nobody here yet — hop in</li>}
      </ul>

      {error && <span className="error voice-error">{error}</span>}

      <div className="voice-actions">
        {joined ? (
          <>
            <MicMeter level={level} muted={muted} mic={mic} />
            <Button variant={muted ? 'default' : 'neutral'} size="sm" onClick={onMute} aria-pressed={muted}>
              {muted ? <MicOff /> : <Mic />}
              {muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button variant="neutral" size="sm" className="voice-leave" onClick={onLeave}>
              <PhoneOff />Leave
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onJoin} disabled={disabled}>
            <Headphones />Join voice
          </Button>
        )}
      </div>
    </section>
  )
}
