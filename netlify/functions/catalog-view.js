import { createClient } from '@supabase/supabase-js'

// บันทึกยอดเปิดดูหน้าแคตตาล็อกสาธารณะ แยกตามช่องทางที่เซลล์ส่งลิงก์ไป (?src=line / facebook / ...)
// ไม่มี policy insert ให้ใครเลยบนตาราง catalog_view_logs — เขียนได้ทางนี้ทางเดียว
// สำคัญ: ฝั่งหน้าเว็บเรียกแบบ fire-and-forget ถ้าฟังก์ชันนี้ล่ม หน้าลูกค้าต้องยังเปิดได้ตามปกติ

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const KNOWN_SOURCES = ['line', 'facebook', 'website', 'email', 'other']
const MAX = { referrer: 500, user_agent: 500, source: 50 }

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return json({ ok: false }, 200)

  let body
  try { body = await req.json() } catch { return json({ ok: false }, 200) }

  const slug = String(body?.slug || '').trim().toLowerCase().slice(0, 120)
  if (!slug || !SLUG_RE.test(slug)) return json({ ok: false }, 200)

  // src มาจาก query string ใครก็พิมพ์อะไรมาก็ได้ — ค่าที่ไม่รู้จักยุบเป็น "other"
  // เพื่อให้สรุปยอดตามช่องทางไม่แตกเป็นค่ามั่วๆ (แนวเดียวกับ normalizeLeadSource ของฟอร์มลีด)
  const raw = String(body?.source || '').trim().toLowerCase().slice(0, MAX.source)
  const source = raw ? (KNOWN_SOURCES.includes(raw) ? raw : 'other') : null

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: cat } = await admin
    .from('catalogs').select('id, status').eq('catalog_slug', slug).maybeSingle()
  // นับเฉพาะที่เผยแพร่จริง ไม่งั้นยอดวิวจะมีการเปิดลิงก์ที่ยังไม่ published ปนเข้ามา
  if (!cat || cat.status !== 'published') return json({ ok: false }, 200)

  await admin.from('catalog_view_logs').insert({
    catalog_id: cat.id,
    catalog_slug: slug,
    source,
    referrer: String(body?.referrer || '').slice(0, MAX.referrer) || null,
    user_agent: (req.headers.get('user-agent') || '').slice(0, MAX.user_agent) || null,
  })

  return json({ ok: true })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
