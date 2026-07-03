import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'ขาดค่า VITE_SUPABASE_URL หรือ VITE_SUPABASE_ANON_KEY — ตั้งค่าใน .env (ดู .env.example)'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
