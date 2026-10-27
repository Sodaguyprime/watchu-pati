// Sticker pack: every GIF in src/assets/stickers is sendable. A sticker
// message is a plain chat row whose body is `sticker:<slug>`, so nothing
// changes in the DB; clients that know the slug render the image.
const files = import.meta.glob('../assets/stickers/*.gif', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export const stickers: { slug: string; url: string }[] = Object.entries(files)
  .map(([path, url]) => ({ slug: path.slice(path.lastIndexOf('/') + 1, -4), url }))
  .sort((a, b) => a.slug.localeCompare(b.slug))

const bySlug = new Map(stickers.map((s) => [s.slug, s.url]))
const PREFIX = 'sticker:'

export const stickerBody = (slug: string) => PREFIX + slug

/** URL of the sticker a message body refers to, or null for ordinary text. */
export function stickerOf(body: string): string | null {
  return body.startsWith(PREFIX) ? bySlug.get(body.slice(PREFIX.length)) ?? null : null
}

/** What to show where an image can't go (reply quotes, overlays). */
export const displayBody = (body: string) => (body.startsWith(PREFIX) ? '🖼 Sticker' : body)
