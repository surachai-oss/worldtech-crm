import { createClient } from '@supabase/supabase-js'

// รับข้อมูลจากฟอร์มลีดสาธารณะ (ไม่ต้อง login) — ใช้ Service Role Key เขียนเข้า Supabase แทน
// เพื่อไม่ต้องเปิด RLS ให้ anon insert เข้าตาราง leads ตรงๆ (กันสแปม/ข้อมูลมั่วเขียนเข้าระบบได้ง่ายเกินไป)
const MAX_LEN = { full_name: 100, phone: 30, email: 150, subject: 150, interested_product: 200, message: 1000, source: 50 }

export default async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY (ดู README)' }, 500)
  }

  let body
  try { body = await req.json() } catch { return json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400) }

  const full_name = (body?.full_name || '').trim().slice(0, MAX_LEN.full_name)
  const phone = (body?.phone || '').trim().slice(0, MAX_LEN.phone)
  const subject = (body?.subject || '').trim().slice(0, MAX_LEN.subject)
  if (!full_name || !phone || !subject) return json({ error: 'กรุณากรอกหัวข้อ ชื่อ และเบอร์โทรศัพท์' }, 400)

  const row = {
    full_name, phone, subject,
    email: (body?.email || '').trim().slice(0, MAX_LEN.email) || null,
    interested_product: (body?.interested_product || '').trim().slice(0, MAX_LEN.interested_product) || null,
    message: (body?.message || '').trim().slice(0, MAX_LEN.message) || null,
    source: (body?.source || '').trim().slice(0, MAX_LEN.source) || null,
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await admin.from('leads').insert(row)
  if (error) return json({ error: 'บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่' }, 500)

  return json({ ok: true })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
