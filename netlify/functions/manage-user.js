import { createClient } from '@supabase/supabase-js'

// จัดการผู้ใช้งาน (แก้ไขชื่อ/อีเมล, รีเซ็ตรหัสผ่าน, ลบบัญชี) — Admin เท่านั้น
// ต้องใช้ Service Role Key เพราะ auth.admin.* เป็น API สิทธิ์สูงสุด ต้องรันฝั่ง server เท่านั้น ห้ามฝังไว้ฝั่ง browser เด็ดขาด
// หมายเหตุ: Supabase Auth เก็บรหัสผ่านแบบ hash เสมอ ไม่มีทางดึงรหัสผ่านเดิมออกมาดูได้ไม่ว่าสิทธิ์ไหน —
// ทางแก้เมื่อพนักงานลืมรหัสผ่านคือ "รีเซ็ตเป็นรหัสใหม่" (action: reset-password) แล้วแจ้งรหัสใหม่ให้พนักงานแทน
export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY' }, 500)

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'ไม่พบสิทธิ์เข้าใช้งาน' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: callerData, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !callerData?.user) return json({ error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, 401)

  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', callerData.user.id).maybeSingle()
  if (callerProfile?.role !== 'admin') return json({ error: 'ต้องเป็นผู้ดูแลระบบเท่านั้นถึงจะจัดการผู้ใช้งานได้' }, 403)

  let body
  try { body = await req.json() } catch { return json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400) }

  const { action, userId } = body || {}
  if (!action || !userId) return json({ error: 'ข้อมูลไม่ครบ' }, 400)

  if (action === 'update') {
    const full_name = (body.full_name || '').trim()
    const email = (body.email || '').trim()
    if (!email) return json({ error: 'กรุณากรอกอีเมล' }, 400)
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, { email, user_metadata: { name: full_name } })
    if (authErr) return json({ error: authErr.message }, 400)
    const { error: profErr } = await admin.from('profiles').update({ full_name, email }).eq('id', userId)
    if (profErr) return json({ error: profErr.message }, 400)
    return json({ ok: true })
  }

  if (action === 'reset-password') {
    const password = body.password || ''
    if (password.length < 6) return json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, 400)
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (action === 'delete') {
    if (userId === callerData.user.id) return json({ error: 'ไม่สามารถลบบัญชีของตัวเองได้' }, 400)
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'ไม่รู้จักคำสั่งนี้' }, 400)
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
