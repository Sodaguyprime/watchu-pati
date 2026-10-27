import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border-2 border-[var(--ink)] font-bold whitespace-nowrap transition-[transform,box-shadow] duration-75 disabled:pointer-events-none disabled:opacity-45 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--ink)] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-[var(--yellow)] text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]',
        neutral: 'bg-[var(--paper)] text-[var(--ink)] shadow-[3px_3px_0_var(--ink)]',
        ghost: 'border-transparent bg-transparent shadow-none active:translate-0 hover:bg-black/5',
      },
      size: {
        default: 'h-10 px-4 text-[15px]',
        sm: 'h-8 px-3 text-[13px]',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { Button, buttonVariants }
