import * as React from 'react'
import { ArrowDownIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Scroll container for a chat. Sticks to the bottom while the reader is there;
// if they've scrolled up to read, new content leaves them alone and a
// "new messages" button offers the way back.

const AT_BOTTOM_PX = 48

type Ctx = {
  viewport: React.RefObject<HTMLDivElement | null>
  atBottom: boolean
  unread: number
  scrollToBottom: (behavior?: ScrollBehavior) => void
  /** Called by Content when its size changes (new message, image loaded...). */
  onContentGrow: (isOwn: boolean) => void
}

const ScrollerContext = React.createContext<Ctx | null>(null)

function useScroller() {
  const ctx = React.useContext(ScrollerContext)
  if (!ctx) throw new Error('MessageScroller components must be inside <MessageScrollerProvider>')
  return ctx
}

function MessageScrollerProvider({ children }: { children: React.ReactNode }) {
  const viewport = React.useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = React.useState(true)
  const [unread, setUnread] = React.useState(0)
  const atBottomRef = React.useRef(true)

  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = viewport.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
    setUnread(0)
  }, [])

  const filled = React.useRef(false) // first growth = history load: snap, don't glide
  const onContentGrow = React.useCallback((isOwn: boolean) => {
    const first = !filled.current
    filled.current = true
    if (first || atBottomRef.current || isOwn) scrollToBottom(!first && atBottomRef.current ? 'smooth' : 'instant')
    else setUnread((n) => n + 1)
  }, [scrollToBottom])

  // Track whether the reader is (near) the bottom.
  React.useEffect(() => {
    const el = viewport.current
    if (!el) return
    const check = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight <= AT_BOTTOM_PX
      atBottomRef.current = near
      setAtBottom(near)
      if (near) setUnread(0)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    return () => el.removeEventListener('scroll', check)
  }, [])

  const value = React.useMemo(
    () => ({ viewport, atBottom, unread, scrollToBottom, onContentGrow }),
    [atBottom, unread, scrollToBottom, onContentGrow],
  )
  return <ScrollerContext.Provider value={value}>{children}</ScrollerContext.Provider>
}

function MessageScroller({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="message-scroller" className={cn('relative flex min-h-0 flex-1 flex-col', className)} {...props} />
}

function MessageScrollerViewport({ className, ...props }: React.ComponentProps<'div'>) {
  const { viewport } = useScroller()
  return (
    <div
      ref={viewport}
      data-slot="message-scroller-viewport"
      className={cn('min-h-0 flex-1 overflow-y-auto', className)}
      {...props}
    />
  )
}

// `lastOwn` tells the scroller whether the latest growth came from the
// current user (always follow) or someone else (only follow if at bottom).
function MessageScrollerContent({
  className,
  lastOwn = false,
  ...props
}: React.ComponentProps<'div'> & { lastOwn?: boolean }) {
  const { onContentGrow } = useScroller()
  const ref = React.useRef<HTMLDivElement>(null)
  const lastOwnRef = React.useRef(lastOwn)
  React.useEffect(() => { lastOwnRef.current = lastOwn }, [lastOwn])

  // Growth is detected two ways: synchronously after each render (new rows)
  // and via ResizeObserver (async growth like images loading).
  const prevHeight = React.useRef(0)
  const grow = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    const h = el.offsetHeight
    if (h > prevHeight.current) onContentGrow(lastOwnRef.current)
    prevHeight.current = h
  }, [onContentGrow])

  React.useLayoutEffect(grow)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(grow)
    ro.observe(el)
    return () => ro.disconnect()
  }, [grow])

  return <div ref={ref} data-slot="message-scroller-content" className={cn('flex flex-col gap-3', className)} {...props} />
}

function MessageScrollerItem({
  className,
  messageId,
  ...props
}: React.ComponentProps<'div'> & { messageId: string }) {
  return <div data-slot="message-scroller-item" data-message-id={messageId} className={className} {...props} />
}

function MessageScrollerButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { atBottom, unread, scrollToBottom } = useScroller()
  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-3 flex justify-center transition-[opacity,transform] duration-150',
        atBottom ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100',
      )}
      aria-hidden={atBottom}
    >
      <Button
        variant="neutral"
        size="sm"
        className={cn('pointer-events-auto', className)}
        tabIndex={atBottom ? -1 : 0}
        onClick={() => scrollToBottom()}
        {...props}
      >
        <ArrowDownIcon />
        {unread > 0 ? `${unread} new` : 'Latest'}
      </Button>
    </div>
  )
}

export {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useScroller,
}
