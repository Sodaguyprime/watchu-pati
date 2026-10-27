import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

// Chat bubble in the app's neo-brutalist idiom: hard 2px ink border, offset
// shadow, no gradients. `align="end"` is the current user's side.

const bubbleVariants = cva('group/bubble relative flex w-full flex-col gap-1', {
  variants: {
    align: {
      start: 'items-start',
      end: 'items-end',
    },
  },
  defaultVariants: { align: 'start' },
})

const BubbleContext = React.createContext<{ align: 'start' | 'end'; variant: 'default' | 'muted' }>({
  align: 'start',
  variant: 'default',
})

type BubbleProps = React.ComponentProps<'div'> &
  VariantProps<typeof bubbleVariants> & { variant?: 'default' | 'muted' }

function Bubble({ className, align, variant = 'default', ...props }: BubbleProps) {
  const a = align ?? 'start'
  return (
    <BubbleContext.Provider value={{ align: a, variant }}>
      <div data-slot="bubble" data-align={a} className={cn(bubbleVariants({ align: a }), className)} {...props} />
    </BubbleContext.Provider>
  )
}

const contentVariants = cva(
  'relative max-w-[85%] rounded-2xl border-2 border-[var(--ink)] px-3 py-2 text-[15px] leading-[1.45] break-words whitespace-pre-wrap',
  {
    variants: {
      variant: {
        default: 'bg-[var(--yellow)] text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]',
        muted: 'bg-[var(--paper)] text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]',
      },
      align: {
        start: 'rounded-bl-md',
        end: 'rounded-br-md',
      },
    },
    defaultVariants: { variant: 'default', align: 'start' },
  },
)

function BubbleContent({ className, ...props }: React.ComponentProps<'div'>) {
  const { align, variant } = React.useContext(BubbleContext)
  return (
    <div data-slot="bubble-content" className={cn(contentVariants({ variant, align }), className)} {...props} />
  )
}

type ReactionsProps = React.ComponentProps<'div'> & {
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
}

function BubbleReactions({ className, align, side = 'bottom', ...props }: ReactionsProps) {
  const ctx = React.useContext(BubbleContext)
  const a = align ?? ctx.align
  return (
    <div
      data-slot="bubble-reactions"
      className={cn(
        // A small badge pinned over the bubble's corner, in front of it.
        'absolute z-[2] inline-flex items-center gap-1 rounded-full border-2 border-[var(--ink)] bg-[var(--paper)] px-1.5 py-0.5 font-bold shadow-[2px_2px_0_var(--ink)]',
        side === 'top' ? '-top-2.5' : '-bottom-2.5',
        a === 'end' ? '-right-1.5' : '-left-1.5',
        className,
      )}
      {...props}
    />
  )
}

export { Bubble, BubbleContent, BubbleReactions, bubbleVariants }
