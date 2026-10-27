import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Social previews need absolute URLs, but the site's address isn't kept in
// the repo. SITE_URL comes from .env, or from Vercel's production domain at
// build time; with neither, the URL-dependent tags are dropped.
function siteUrl(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), '')
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL
  const url = (env.SITE_URL || (vercel ? `https://${vercel}` : '')).replace(/\/$/, '')
  return {
    name: 'site-url',
    transformIndexHtml: (html) =>
      url ? html.replaceAll('%SITE_URL%', url) : html.replace(/^.*%SITE_URL%.*\r?\n/gm, ''),
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), siteUrl(mode)],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
}))
