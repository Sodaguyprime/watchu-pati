import { createClient } from '@supabase/supabase-js'

// Accept the project URL with or without a trailing /rest/v1/ path
const url = String(import.meta.env.VITE_SUPABASE_URL).replace(/\/(rest\/v1)?\/?$/, '')

export const supabase = createClient(
  url,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
)

export const ROOM = import.meta.env.VITE_ROOM ?? 'room'
