import type { CapacitorConfig } from '@capacitor/cli'

// CAP_SERVER_URL (from .env) makes the app a thin shell that loads the live
// site, so every deploy is instantly live in the app. Without it, the app
// runs the bundled dist/ instead.
try { process.loadEnvFile() } catch { /* no .env */ }
const serverUrl = process.env.CAP_SERVER_URL

const config: CapacitorConfig = {
  appId: 'app.watchupati',
  appName: 'Watchu Pati',
  webDir: 'dist',
  ...(serverUrl && { server: { url: serverUrl, androidScheme: 'https' } }),
  android: { allowMixedContent: false },
}

export default config
