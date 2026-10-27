import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HeartIcon, ReplyIcon, SendHorizontalIcon, SmilePlusIcon, XIcon } from 'lucide-react'
import type { Message as ChatMessage, Reactions } from '../hooks/useChat'
import { userId, type Profile } from '../lib/profile'
import { displayBody, stickerBody, stickerOf, stickers } from '../lib/stickers'
import { Bubble, BubbleContent, BubbleReactions } from '@/components/ui/bubble'
import { Message, MessageAvatar, MessageContent } from '@/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { UserAvatar, hue } from './UserAvatar'

type Props = {
  messages: ChatMessage[]
  ready: boolean
  typing: string[]
  profiles: Map<string, Profile>
  reactions: Reactions
  me: string
  onSend: (body: string, replyTo: string | null) => void
  onTyping: (typing: boolean) => void
  onHeart: (messageId: string) => void
  onClear: () => void
  onClose?: () => void
}

const LONG = 120 // chars; past this a message reads as a paragraph and gets justified
const SWIPE_MAX = 64 // px the row can be dragged
const SWIPE_COMMIT = 44 // px past which lifting the finger triggers a reply
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_PX = 24

// Entrance animations only make sense if someone is watching: an element that
// mounts in a background tab would otherwise play its animation whenever the
// tab is next shown, looking like it re-appeared.
function useAnimateOnMount(want: boolean) {
  const [animate] = useState(() => want && !document.hidden)
  return animate
}

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function typingLine(names: string[]) {
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return 'Several people are typing…'
}

// Grid of the sticker pack above the input; Escape or clicking outside closes it.
function StickerPicker({ onPick, onClose }: { onPick: (slug: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const down = (e: PointerEvent) => {
      const t = e.target as Element
      if (!box.current?.contains(t) && !t.closest('.sticker-toggle')) onClose()
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', down)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', down)
    }
  }, [onClose])
  return (
    <div ref={box} className="sticker-picker card" role="listbox" aria-label="Stickers">
      {stickers.map((s) => (
        <button type="button" key={s.slug} className="sticker-opt" onClick={() => onPick(s.slug)} title={s.slug.replace(/-/g, ' ')}>
          <img src={s.url} alt={s.slug.replace(/-/g, ' ')} loading="lazy" draggable={false} />
        </button>
      ))}
    </div>
  )
}

// Compact preview of the message being answered (in the row and above the input).
function Quote({ m, onClick }: { m: ChatMessage | undefined; onClick?: () => void }) {
  return (
    <button type="button" className="quote" onClick={onClick} disabled={!m || !onClick}>
      {m ? (
        <>
          <span className="quote-who" style={{ color: `hsl(${hue(m.name)} 70% 35%)` }}>{m.name}</span>
          <span className="quote-body">{displayBody(m.body)}</span>
        </>
      ) : (
        <span className="quote-body muted">Original message unavailable</span>
      )}
    </button>
  )
}

// Display only: hearting and un-hearting are both a double tap on the message.
function Hearts({ count, mine }: { count: number; mine: boolean }) {
  const pop = useAnimateOnMount(true)
  return (
    <BubbleReactions
      className={`${pop ? 'pop' : ''} ${mine ? 'hearted' : ''}`}
      title={mine ? 'You hearted this — double-tap to remove' : `${count} heart${count === 1 ? '' : 's'}`}
    >
      <HeartIcon className="size-3.5 heart" />
      <span key={count} className="count text-xs">{count}</span>
    </BubbleReactions>
  )
}

type RowProps = {
  m: ChatMessage
  mine: boolean
  avatar: string | null
  quoted: ChatMessage | undefined
  hearts: number
  hearted: boolean
  onReply: (m: ChatMessage) => void
  onJump: (id: string) => void
  onHeart: (id: string) => void
}

// Rows are memoised so a new message (or a typing ping) doesn't re-render the
// whole history. `fresh` is captured once at mount: a row that entered with an
// animation keeps its class even after the server copy replaces it.
const Row = memo(function Row({ m, mine, avatar, quoted, hearts, hearted, onReply, onJump, onHeart }: RowProps) {
  const enter = useAnimateOnMount(!!m.fresh)
  const [burst, setBurst] = useState(0)
  const el = useRef<HTMLDivElement>(null)
  const sticker = stickerOf(m.body)

  // ---- double tap / double click → heart ----
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)
  const onPointerUp = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const now = performance.now()
    const prev = lastTap.current
    lastTap.current = { t: now, x: e.clientX, y: e.clientY }
    if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_TAP_PX) {
      lastTap.current = null
      if (!hearted) setBurst((n) => n + 1)
      navigator.vibrate?.(8)
      onHeart(m.id)
    }
  }

  // ---- swipe right → reply (touch) ----
  // Horizontal drag translates the row; vertical is left to the scroller via
  // touch-action: pan-y.
  const touch = useRef<{ x: number; y: number; dx: number; horizontal: boolean | null } | null>(null)
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY, dx: 0, horizontal: null }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current
    const node = el.current
    if (!s || !node) return
    const t = e.touches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (s.horizontal === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      s.horizontal = Math.abs(dx) > Math.abs(dy)
    }
    if (!s.horizontal || dx < 0) return
    // Rubber-band past the limit so it feels physical, not clamped.
    s.dx = dx <= SWIPE_MAX ? dx : SWIPE_MAX + (dx - SWIPE_MAX) * 0.2
    node.style.transform = `translateX(${s.dx}px)`
    node.classList.toggle('swipe-armed', s.dx >= SWIPE_COMMIT)
  }
  const onTouchEnd = () => {
    const s = touch.current
    const node = el.current
    touch.current = null
    if (!s || !node) return
    node.classList.add('swipe-release')
    node.style.transform = ''
    node.classList.remove('swipe-armed')
    node.addEventListener('transitionend', () => node.classList.remove('swipe-release'), { once: true })
    if (s.dx >= SWIPE_COMMIT) {
      navigator.vibrate?.(10)
      onReply(m)
    }
  }

  return (
    <MessageScrollerItem messageId={m.id}>
      <div
        ref={el}
        id={`msg-${m.id}`}
        className={`msg ${mine ? 'mine' : ''} ${enter ? 'enter' : ''}`}
        onContextMenu={(e) => { e.preventDefault(); onReply(m) }}
        onPointerUp={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <span className="swipe-hint" aria-hidden="true"><ReplyIcon size={13} /></span>
        <Message>
          <MessageAvatar>
            <UserAvatar name={m.name} src={avatar} />
          </MessageAvatar>
          <MessageContent>
            <div className="meta">
              <span className="who">{m.name}</span>
              <time>{fmt(m.created_at)}</time>
            </div>
            {sticker ? (
              <div className="sticker-msg">
                {m.reply_to && <Quote m={quoted} onClick={quoted ? () => onJump(quoted.id) : undefined} />}
                <img className="sticker" src={sticker} alt="Sticker" draggable={false} />
                {hearts > 0 && <Hearts count={hearts} mine={hearted} />}
              </div>
            ) : (
              <Bubble variant={mine ? 'default' : 'muted'}>
                <BubbleContent className={m.body.length > LONG ? 'long' : ''}>
                  {m.reply_to && <Quote m={quoted} onClick={quoted ? () => onJump(quoted.id) : undefined} />}
                  {m.body}
                </BubbleContent>
                {hearts > 0 && <Hearts count={hearts} mine={hearted} />}
              </Bubble>
            )}
          </MessageContent>
        </Message>
        {burst > 0 && (
          <HeartIcon
            key={burst}
            className="heart-burst"
            aria-hidden="true"
            onAnimationEnd={() => setBurst(0)}
          />
        )}
      </div>
    </MessageScrollerItem>
  )
})

export function Chat({ messages, ready, typing, profiles, reactions, me, onSend, onTyping, onHeart, onClear, onClose }: Props) {
  const [draft, setDraft] = useState('')
  const [replyId, setReplyId] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages])
  // Derived, so a reply target that gets cleared out from under us just vanishes.
  const replyTo = replyId ? byId.get(replyId) ?? null : null
  const last = messages[messages.length - 1]
  const lastOwn = !!last && (last.user_id ? last.user_id === userId : last.name === me)

  const reply = useCallback((m: ChatMessage) => {
    setReplyId(m.id)
    input.current?.focus()
  }, [])

  const jump = useCallback((id: string) => {
    const node = document.getElementById(`msg-${id}`)
    if (!node) return
    node.scrollIntoView({ behavior: 'smooth', block: 'center' })
    node.classList.remove('flash')
    void node.offsetWidth // restart the animation if it's already flashing
    node.classList.add('flash')
  }, [])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.trim()) return
    onSend(draft, replyTo?.id ?? null)
    setDraft('')
    setReplyId(null)
  }

  const change = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setDraft(v)
    onTyping(v.trim().length > 0)
  }

  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && replyTo) setReplyId(null)
  }

  return (
    <aside className="card chat">
      <div className="chat-head">
        <strong>Live chat</strong>
        <div className="chat-actions">
          <button
            className="btn small"
            disabled={messages.length === 0}
            onClick={() => { if (confirm('Clear the chat for everyone?')) onClear() }}
          >
            Clear
          </button>
          {onClose && <button className="icon-btn" onClick={onClose} aria-label="Close chat">×</button>}
        </div>
      </div>

      <MessageScrollerProvider>
        <MessageScroller>
          <MessageScrollerViewport className="chat-list">
            <MessageScrollerContent lastOwn={lastOwn}>
              {ready && messages.length === 0 && <p className="muted">Say hi 👋</p>}
              {messages.map((m) => {
                const mine = m.user_id ? m.user_id === userId : m.name === me
                const who = m.user_id ? profiles.get(m.user_id) : undefined
                const set = reactions.get(m.id)
                return (
                  <Row
                    key={m.id}
                    m={m}
                    mine={mine}
                    avatar={who?.avatar_url ?? null}
                    quoted={m.reply_to ? byId.get(m.reply_to) : undefined}
                    hearts={set?.size ?? 0}
                    hearted={!!set?.has(userId)}
                    onReply={reply}
                    onJump={jump}
                    onHeart={onHeart}
                  />
                )
              })}
              {typing.length > 0 && (
                <p className="typing" aria-live="polite">
                  <span className="dots"><i /><i /><i /></span>
                  {typingLine(typing)}
                </p>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <form className="chat-input" onSubmit={submit}>
        {replyTo && (
          <div className="reply-bar">
            <span className="reply-label">Replying to</span>
            <Quote m={replyTo} onClick={() => jump(replyTo.id)} />
            <button type="button" className="icon-btn" onClick={() => setReplyId(null)} aria-label="Cancel reply">
              <XIcon size={16} />
            </button>
          </div>
        )}
        {pickerOpen && (
          <StickerPicker
            onPick={(slug) => {
              onSend(stickerBody(slug), replyTo?.id ?? null)
              setReplyId(null)
              setPickerOpen(false)
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}
        <div className="chat-input-row">
          <button
            type="button"
            className={`icon-btn sticker-toggle ${pickerOpen ? 'on' : ''}`}
            onClick={() => setPickerOpen((o) => !o)}
            aria-label="Stickers"
            aria-expanded={pickerOpen}
          >
            <SmilePlusIcon size={20} strokeWidth={2.4} />
          </button>
          <input
            ref={input}
            value={draft}
            onChange={change}
            onKeyDown={keyDown}
            onBlur={() => onTyping(false)}
            placeholder={replyTo ? `Reply to ${replyTo.name}…` : 'Message…'}
            maxLength={500}
            enterKeyHint="send"
          />
          <button className="send-btn" disabled={!draft.trim()} aria-label="Send">
            <SendHorizontalIcon size={18} strokeWidth={2.4} />
          </button>
        </div>
      </form>
    </aside>
  )
}
