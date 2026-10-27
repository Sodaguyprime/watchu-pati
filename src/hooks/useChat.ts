import { useCallback, useEffect, useRef, useState } from 'react'
import { userId } from '../lib/profile'
import { ROOM, supabase } from '../lib/supabase'
import { peerId } from './useSync'

export type Message = {
  id: string
  room: string
  name: string
  user_id: string | null // null on messages from before profiles existed
  body: string
  created_at: string
  reply_to: string | null
  fresh?: boolean // arrived live (not loaded as history) — gets the entrance animation
}

type Reaction = { message_id: string; user_id: string }
// message id -> ids of everyone who hearted it
export type Reactions = Map<string, Set<string>>

type Typing = { from: string; name: string; typing: boolean }

const HISTORY = 100
const TYPING_TTL_MS = 3000 // a peer is "typing" until we hear otherwise or this expires
const TYPING_THROTTLE_MS = 1500 // don't spam the channel on every keystroke

export function useChat(name: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [ready, setReady] = useState(false) // history fetched; later arrivals are "new"
  const [typing, setTyping] = useState<string[]>([])
  const nameRef = useRef(name)
  useEffect(() => { nameRef.current = name }, [name])

  // ---- history + inserts/deletes from the DB ----
  useEffect(() => {
    let alive = true
    supabase
      .from('messages')
      .select('*')
      .eq('room', ROOM)
      .order('created_at', { ascending: false })
      .limit(HISTORY)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) console.error('[chat]', error)
        setMessages((data ?? []).reverse())
        setReady(true)
      })

    const ch = supabase
      .channel('chat-db')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room=eq.${ROOM}` },
        ({ new: row }) => {
          const msg = { ...(row as Message), fresh: true }
          setMessages((list) => {
            // Our own optimistic copy shares the id: swap it for the confirmed row.
            const i = list.findIndex((m) => m.id === msg.id)
            if (i === -1) return [...list, msg].slice(-HISTORY)
            const next = list.slice()
            next[i] = msg
            return next
          })
        },
      )
      // DELETE payloads only carry the id (no room), so no filter here — every
      // client just drops whatever id was removed.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, ({ old }) => {
        setMessages((list) => list.filter((m) => m.id !== (old as { id: string }).id))
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [])

  // ---- typing indicator (ephemeral broadcast, never touches the DB) ----
  const typingCh = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const expiry = useRef(new Map<string, { name: string; until: number }>())

  useEffect(() => {
    const ch = supabase.channel(`${ROOM}-typing`, { config: { broadcast: { self: false } } })
    typingCh.current = ch

    const refresh = () => {
      const now = Date.now()
      const names: string[] = []
      for (const [id, t] of expiry.current) {
        if (t.until <= now) expiry.current.delete(id)
        else names.push(t.name)
      }
      setTyping((prev) => (prev.length === names.length && prev.every((n, i) => n === names[i]) ? prev : names))
    }

    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const t = payload as Typing
      if (t.typing) expiry.current.set(t.from, { name: t.name, until: Date.now() + TYPING_TTL_MS })
      else expiry.current.delete(t.from)
      refresh()
    })
    ch.subscribe()
    const sweep = window.setInterval(refresh, 500)

    return () => {
      window.clearInterval(sweep)
      supabase.removeChannel(ch)
      typingCh.current = null
    }
  }, [])

  const lastTypingSent = useRef(0)
  const sendTyping = useCallback((isTyping: boolean) => {
    const now = Date.now()
    if (isTyping && now - lastTypingSent.current < TYPING_THROTTLE_MS) return
    lastTypingSent.current = isTyping ? now : 0
    typingCh.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { from: peerId, name: nameRef.current, typing: isTyping } satisfies Typing,
    })
  }, [])

  // ---- heart reactions ----
  const [reactions, setReactions] = useState<Reactions>(() => new Map())

  // Pure helpers: return a new map with the (message, user) pair added/removed.
  const withReaction = (map: Reactions, r: Reaction, on: boolean): Reactions => {
    const cur = map.get(r.message_id)
    if (on ? cur?.has(r.user_id) : !cur?.has(r.user_id)) return map // no-op, keep identity
    const next = new Map(map)
    const set = new Set(cur)
    if (on) set.add(r.user_id)
    else set.delete(r.user_id)
    if (set.size) next.set(r.message_id, set)
    else next.delete(r.message_id)
    return next
  }

  useEffect(() => {
    let alive = true
    supabase.from('reactions').select('message_id, user_id').then(({ data, error }) => {
      if (!alive) return
      if (error) console.error('[reactions]', error)
      const map: Reactions = new Map()
      for (const r of data ?? []) {
        if (!map.has(r.message_id)) map.set(r.message_id, new Set())
        map.get(r.message_id)!.add(r.user_id)
      }
      setReactions(map)
    })

    const ch = supabase
      .channel('reactions-db')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reactions' }, ({ new: row }) => {
        setReactions((map) => withReaction(map, row as Reaction, true))
      })
      // composite PK, so the DELETE payload carries both columns
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reactions' }, ({ old }) => {
        setReactions((map) => withReaction(map, old as Reaction, false))
      })
      .subscribe()

    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [])

  const reactionsRef = useRef<Reactions>(reactions)
  useEffect(() => { reactionsRef.current = reactions }, [reactions])

  // Optimistic toggle; the realtime echo is a no-op, a failure rolls back.
  const toggleHeart = useCallback(async (messageId: string) => {
    const r: Reaction = { message_id: messageId, user_id: userId }
    const on = !reactionsRef.current.get(messageId)?.has(userId)
    setReactions((map) => withReaction(map, r, on))
    const { error } = on
      ? await supabase.from('reactions').insert(r)
      : await supabase.from('reactions').delete().match(r)
    if (error) {
      console.error('[reactions]', error)
      setReactions((map) => withReaction(map, r, !on))
    }
  }, [])

  // ---- actions ----

  // Optimistic: the message appears instantly with a client-made id. The
  // realtime INSERT echo carries the same id and replaces it; on failure we
  // pull it back out.
  const send = useCallback(async (body: string, replyTo: string | null = null) => {
    const text = body.trim()
    if (!text || !name) return
    const msg: Message = {
      id: crypto.randomUUID(),
      room: ROOM,
      name,
      user_id: userId,
      body: text,
      created_at: new Date().toISOString(),
      reply_to: replyTo,
      fresh: true,
    }
    setMessages((list) => [...list, msg].slice(-HISTORY))
    sendTyping(false)
    const { error } = await supabase
      .from('messages')
      .insert({ id: msg.id, room: msg.room, name: msg.name, user_id: msg.user_id, body: msg.body, reply_to: msg.reply_to })
    if (error) {
      console.error('[chat]', error)
      setMessages((list) => list.filter((m) => m.id !== msg.id))
    }
  }, [name, sendTyping])

  const clear = useCallback(async () => {
    const { error } = await supabase.from('messages').delete().eq('room', ROOM)
    if (error) console.error('[chat]', error)
    else setMessages([])
  }, [])

  return { messages, ready, typing, reactions, send, clear, sendTyping, toggleHeart }
}
