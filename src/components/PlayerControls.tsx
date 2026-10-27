import { useEffect, useRef, useState } from 'react'
import {
  Captions,
  Controls,
  FullscreenButton,
  Gesture,
  Menu,
  MuteButton,
  PlayButton,
  Time,
  TimeSlider,
  Tooltip,
  VolumeSlider,
  useCaptionOptions,
  useMediaState,
} from '@vidstack/react'
import {
  Captions as CaptionsIcon,
  CaptionsOff,
  Check,
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react'
import type { SyncStatus } from '../hooks/useSync'

const STATUS_LABEL: Record<SyncStatus, string> = {
  connecting: 'Connecting…',
  idle: 'Ready',
  waiting: 'Buffering for room',
  playing: 'In sync',
  paused: 'Paused',
  blocked: 'Tap to join',
}

type Props = { status: SyncStatus }

// Sticker-style controls layout: white paper deck, ink outlines, hard shadows.
export function PlayerControls({ status }: Props) {
  return (
    <>
      {/* tap the picture to play/pause, double-tap to go big */}
      <Gesture className="pc-gesture" event="pointerup" action="toggle:controls" />
      <Gesture className="pc-gesture" event="click" action="toggle:paused" />
      <Gesture className="pc-gesture" event="dblclick" action="toggle:fullscreen" />

      <Captions className="pc-captions" />
      <PausedSticker />
      <BufferingMascot />
      <StateFlash />

      <Controls.Root className="pc-controls">
        <div className="pc-deck">
          <TimeSlider.Root className="pc-time">
            <TimeSlider.Track className="pc-track">
              <TimeSlider.Progress className="pc-progress" />
              <TimeSlider.TrackFill className="pc-fill" />
            </TimeSlider.Track>
            <TimeSlider.Thumb className="pc-thumb" />
            <TimeSlider.Preview className="pc-preview">
              <TimeSlider.Value className="pc-preview-time" />
            </TimeSlider.Preview>
          </TimeSlider.Root>

          <Controls.Group className="pc-row">
            <Tip label="Play / Pause">
              <PlayButton className="pc-play">
                <Play className="i-play" size={22} strokeWidth={2.5} fill="currentColor" />
                <Pause className="i-pause" size={22} strokeWidth={2.5} fill="currentColor" />
              </PlayButton>
            </Tip>

            <div className="pc-volume">
              <Tip label="Mute">
                <MuteButton className="pc-btn">
                  <VolumeX className="i-mute" size={18} strokeWidth={2.5} />
                  <Volume1 className="i-low" size={18} strokeWidth={2.5} />
                  <Volume2 className="i-high" size={18} strokeWidth={2.5} />
                </MuteButton>
              </Tip>
              <VolumeSlider.Root className="pc-vol">
                <VolumeSlider.Track className="pc-vol-track">
                  <VolumeSlider.TrackFill className="pc-vol-fill" />
                </VolumeSlider.Track>
                <VolumeSlider.Thumb className="pc-vol-thumb" />
              </VolumeSlider.Root>
            </div>

            <div className="pc-clock">
              <Time type="current" />
              <span className="pc-clock-sep">/</span>
              <Time type="duration" />
            </div>

            <div className="spacer" />

            <span className={`pc-status pc-status-${status}`}>
              <i className="dot" />
              {STATUS_LABEL[status]}
            </span>

            <CaptionsMenu />

            <Tip label="Fullscreen">
              <FullscreenButton className="pc-btn">
                <Maximize className="i-enter" size={18} strokeWidth={2.5} />
                <Minimize className="i-exit" size={18} strokeWidth={2.5} />
              </FullscreenButton>
            </Tip>
          </Controls.Group>
        </div>
      </Controls.Root>
    </>
  )
}

function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Content className="pc-tip" placement="top" offset={10}>
        {label}
      </Tooltip.Content>
    </Tooltip.Root>
  )
}

function CaptionsMenu() {
  const options = useCaptionOptions()
  const track = useMediaState('textTrack')
  if (!options.length) return null
  return (
    <Menu.Root className="pc-menu">
      <Tip label="Subtitles">
        <Menu.Button className={`pc-btn ${track ? 'is-on' : ''}`}>
          <CaptionsIcon className="i-on" size={18} strokeWidth={2.5} />
          <CaptionsOff className="i-off" size={18} strokeWidth={2.5} />
        </Menu.Button>
      </Tip>
      <Menu.Items className="pc-menu-items" placement="top end" offset={12}>
        <Menu.RadioGroup value={options.selectedValue}>
          {options.map(({ label, value, select }) => (
            <Menu.Radio className="pc-radio" value={value} onSelect={select} key={value}>
              <Check className="pc-radio-check" size={14} strokeWidth={3} />
              {label}
            </Menu.Radio>
          ))}
        </Menu.RadioGroup>
      </Menu.Items>
    </Menu.Root>
  )
}

// A yellow "PAUSED" tag slapped on the corner while the room is stopped.
function PausedSticker() {
  const paused = useMediaState('paused')
  const started = useMediaState('started')
  if (!paused || !started) return null
  return <div className="pc-sticker">PAUSED</div>
}

// The mascot bobs while we wait on the network instead of a generic spinner.
function BufferingMascot() {
  const waiting = useMediaState('waiting')
  const canPlay = useMediaState('canPlay')
  if (!waiting && canPlay) return null
  return (
    <div className="pc-buffer">
      <img src="/mascot.png" alt="" />
      <span className="pill">loading…</span>
    </div>
  )
}

// Big play/pause sticker that pops in the middle when the state flips.
function StateFlash() {
  const paused = useMediaState('paused')
  const started = useMediaState('started')
  const [key, setKey] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (!started) return
    if (first.current) { first.current = false; return }
    setKey((k) => k + 1)
  }, [paused, started])
  if (!key) return null
  return (
    <div className="pc-flash" key={key}>
      {paused
        ? <Pause size={34} strokeWidth={2.5} fill="currentColor" />
        : <Play size={34} strokeWidth={2.5} fill="currentColor" />}
    </div>
  )
}
