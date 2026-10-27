import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { initials } from '@/lib/profile'

const HUES = [340, 200, 50, 140, 280, 20]
const hueCache = new Map<string, number>()
export function hue(name: string) {
  let h = hueCache.get(name)
  if (h === undefined) {
    let x = 0
    for (const c of name) x = (x * 31 + c.charCodeAt(0)) >>> 0
    h = HUES[x % HUES.length]
    hueCache.set(name, h)
  }
  return h
}

type Props = { name: string; src?: string | null; className?: string }

export function UserAvatar({ name, src, className }: Props) {
  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt={name} />}
      <AvatarFallback style={{ background: `hsl(${hue(name)} 90% 80%)` }}>{initials(name)}</AvatarFallback>
    </Avatar>
  )
}
