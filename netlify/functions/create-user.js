import { createClient } from '@supabase/supabase-js'

// สร้างผู้ใช้งานใหม่ (Admin เท่านั้น) — ต้องใช้ Service Role Key ซึ่งมีสิทธิ์สูงสุดข้าม RLS ทั้งหมด
// ฟังก์ชันนี้จึงต้องรันฝั่ง server (Netlify Function) เท่านั้น ห้ามฝังคีย์นี้ไว้ฝั่ง browser เด็ดขาด
export default async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY (ดู README)' }, 500)
  }

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'ไม่พบสิทธิ์เข้าใช้งาน' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !callerData?.user) return json({ error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, 401)

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', callerData.user.id).maybeSingle()
  if (callerProfile?.role !== 'admin') return json({ error: 'ต้องเป็นผู้ดูแลระบบเท่านั้นถึงจะเพิ่มผู้ใช้งานได้' }, 403)

  let body
  try { body = await req.json() } catch { return json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400) }

  const email = (body?.email || '').trim()
  const password = body?.password || ''
  const fullName = (body?.full_name || '').trim()
  if (!email || !password) return json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' }, 400)
  if (password.length < 6) return json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, 400)

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: fullName ? { name: fullName } : undefined
  })
  if (createErr) return json({ error: createErr.message }, 400)

  if (fullName) {
    await admin.from('profiles').update({ full_name: fullName }).eq('id', created.user.id)
  }

  return json({ id: created.user.id, email: created.user.email })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
