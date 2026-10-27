import { useRef, useState } from 'react'
import { Clapperboard, MessageCircle } from 'lucide-react'
import type { MediaPlayerInstance } from '@vidstack/react'
import { Chat } from './components/Chat'
import { Library } from './components/Library'
import { NamePrompt } from './components/NamePrompt'
import { Player } from './components/Player'
import { Settings } from './components/Settings'
import { Subtitles } from './components/Subtitles'
import { UserAvatar } from './components/UserAvatar'
import { VoiceBar } from './components/VoiceBar'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { useChat } from './hooks/useChat'
import { peerId, useSync } from './hooks/useSync'
import { useVoice } from './hooks/useVoice'
import { useProfile, useProfiles } from './lib/profile'
import { useSettings } from './lib/settings'
import { useSubtitles } from './lib/subtitles'
import { useVideos } from './lib/videos'

export default function App() {
  const { name, avatarUrl, setName, setAvatar } = useProfile()
  const profiles = useProfiles()
  const sync = useSync(name)
  const { videos, loading } = useVideos()
  const chat = useChat(name)
  const voice = useVoice(name)
  const [settings, updateSettings] = useSettings()
  const playerRef = useRef<MediaPlayerInstance>(null)
  const [editingName, setEditingName] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  // phone portrait: chat and library share the space under the player as tabs
  const [mobileTab, setMobileTab] = useState<'chat' | 'videos'>('chat')

  const current = videos.find((v) => v.id === sync.videoId)
  const subtitles = useSubtitles(current?.id ?? null)
  const connecting = sync.status === 'connecting'
  const theater = settings.layout === 'theater'

  const browseVideos = () => {
    setMobileTab('videos')
    document.querySelector('.library')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const subtitlesPanel = current && <Subtitles videoId={current.id} subs={subtitles} />
  const library = (
    <Library
      videos={videos}
      loading={loading}
      activeId={sync.videoId}
      disabled={connecting}
      onSelect={sync.select}
    />
  )

  return (
    <div className={`app ${settings.layout} ${chatOpen ? 'chat-open' : ''} tab-${mobileTab}`}>
      {(!name || editingName) && (
        <NamePrompt
          initial={name}
          avatarUrl={avatarUrl}
          onAvatar={setAvatar}
          onDone={(n) => { setName(n); setEditingName(false) }}
        />
      )}

      <header className="topbar">
        <div className="logo">
          <img className="logo-mark" src="/logo.png" alt="" height="40" />
          <span>Watchu Pati</span>
        </div>
        <div className="spacer" />
        <div className="online">
          <button type="button" className={`pill status ${connecting ? 'off' : ''}`} aria-haspopup="true">
            <span className="dot" />
            {connecting ? 'connecting…' : `${sync.peers.length} online${sync.isHost ? ' · host' : ''}`}
          </button>
          {!connecting && (
            <ul className="online-list card" role="list">
              {sync.peers.map((p, i) => (
                <li key={p.peerId}>
                  <UserAvatar name={p.name || '?'} src={profiles.get(p.userId)?.avatar_url} className="size-6 text-[10px]" />
                  {p.name || 'Anonymous'}
                  {p.peerId === peerId && <em>you</em>}
                  {i === 0 && <em>host</em>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className="pill btn-pill me" onClick={() => setEditingName(true)} title="Edit profile">
          <UserAvatar name={name || '?'} src={avatarUrl} className="size-6 text-[10px]" />
          <span className="me-name">{name || 'Set name'}</span>
        </button>
        <Settings
          settings={settings}
          onChange={updateSettings}
          canFullscreen={!!current}
          onFullscreen={() => { playerRef.current?.enterFullscreen().catch(() => {}) }}
        />
      </header>

      <VoiceBar
        members={voice.members}
        joined={voice.joined}
        muted={voice.muted}
        speaking={voice.speaking}
        level={voice.level}
        mic={voice.mic}
        error={voice.error}
        profiles={profiles}
        disabled={!name}
        onJoin={voice.join}
        onLeave={voice.leave}
        onMute={voice.toggleMute}
      />

      <main className="layout">
        <section className="stage">
          {current ? (
            <>
              <Player
                key={current.id}
                playerRef={playerRef}
                videoRef={sync.videoRef}
                src={current.url}
                subtitles={subtitles}
                status={sync.status}
                messages={chat.messages}
                profiles={profiles}
                fullscreenChat={settings.fullscreenChat}
                onPlay={sync.play}
                onPause={sync.pause}
                onSeek={sync.seek}
                onResume={sync.resume}
              />
              <div className="now">
                <h2>{current.title}</h2>
                <span className="pill">{sync.status}</span>
              </div>
              {!theater && subtitlesPanel}
            </>
          ) : theater ? (
            <div className="empty-stage">
              <img className="mascot" src="/mascot.png" alt="" width="220" />
              <p className="empty-title">Nothing playing yet</p>
              <p className="muted">Whatever you pick opens for everyone in the room.</p>
              <button className="btn primary" onClick={browseVideos}>
                <Clapperboard size={16} strokeWidth={2.4} />Browse videos
              </button>
            </div>
          ) : (
            <div className="card empty-stage">
              <img className="mascot" src="/mascot.png" alt="" width="220" />
              <p className="mascot-say">You need to choose a video down there, buddy!</p>
              <p className="muted">Whatever you pick opens for everyone in the room.</p>
            </div>
          )}
          <button className="fab" onClick={() => setChatOpen((o) => !o)} aria-label="Toggle chat">
            <MessageCircle size={20} strokeWidth={2.4} />
          </button>
        </section>

        <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as 'chat' | 'videos')} className="mobile-tabs">
          <TabsList className="w-full">
            <TabsTrigger value="chat"><MessageCircle />Chat</TabsTrigger>
            <TabsTrigger value="videos"><Clapperboard />Videos</TabsTrigger>
          </TabsList>
        </Tabs>

        <Chat
          messages={chat.messages}
          ready={chat.ready}
          typing={chat.typing}
          profiles={profiles}
          reactions={chat.reactions}
          me={name}
          onSend={chat.send}
          onTyping={chat.sendTyping}
          onHeart={chat.toggleHeart}
          onClear={chat.clear}
          onClose={() => setChatOpen(false)}
        />
      </main>

      {theater ? (
        <div className="videos-panel">
          {subtitlesPanel}
          {library}
        </div>
      ) : library}
    </div>
  )
}
