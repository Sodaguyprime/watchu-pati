import * as React from 'react'

import { cn } from '@/lib/utils'

// One chat row: avatar beside the content column. `align="end"` mirrors the
// row for the current user's own messages.

const MessageContext = React.createContext<'start' | 'end'>('start')

function Message({
  className,
  align = 'start',
  ...props
}: React.ComponentProps<'div'> & { align?: 'start' | 'end' }) {
  return (
    <MessageContext.Provider value={align}>
      <div
        data-slot="message"
        data-align={align}
        className={cn('flex w-full items-end gap-2', align === 'end' && 'flex-row-reverse', className)}
        {...props}
      />
    </MessageContext.Provider>
  )
}

function MessageAvatar({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="message-avatar" className={cn('shrink-0 self-end', className)} {...props} />
}

function MessageContent({ className, ...props }: React.ComponentProps<'div'>) {
  const align = React.useContext(MessageContext)
  return (
    <div
      data-slot="message-content"
      className={cn('flex min-w-0 flex-1 flex-col gap-1', align === 'end' ? 'items-end' : 'items-start', className)}
      {...props}
    />
  )
}

export { Message, MessageAvatar, MessageContent }
