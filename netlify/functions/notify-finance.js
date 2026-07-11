import { createClient } from '@supabase/supabase-js'

// แจ้งเตือนฝ่ายบัญชีทางอีเมลเมื่อเซลล์กด "ส่งให้บัญชี" — ค้นหาอีเมลของผู้ใช้ที่มีสิทธิ์ finance (ผ่าน service role ข้าม RLS)
// แล้วส่งอีเมลผ่าน Resend (ตั้งค่า RESEND_API_KEY + NOTIFY_FROM_EMAIL ใน Netlify env)
// ถ้ายังไม่ตั้งค่าอีเมล จะคืน { skipped: true } เฉยๆ ไม่ถือเป็น error เพื่อไม่ให้บล็อกการ submit ของเซลล์
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

  let body
  try { body = await req.json() } catch { return json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400) }
  const prId = body?.paymentRequestId
  if (!prId) return json({ error: 'ไม่พบเลขคำขอ' }, 400)

  // อีเมลของฝ่ายบัญชีทั้งหมด (profiles.role = 'finance')
  const { data: financeUsers } = await admin.from('profiles').select('email, full_name').eq('role', 'finance')
  const emails = (financeUsers || []).map(u => u.email).filter(Boolean)
  if (!emails.length) return json({ skipped: true, reason: 'no finance users' })

  const { data: pr } = await admin.from('payment_requests')
    .select('pr_no, customer_name, total_amount, requested_by_name, po_reference')
    .eq('id', prId).maybeSingle()
  if (!pr) return json({ error: 'ไม่พบคำขอตรวจยอด' }, 404)

  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.NOTIFY_FROM_EMAIL
  if (!resendKey || !fromEmail) return json({ skipped: true, reason: 'email not configured' })

  const amount = Number(pr.total_amount || 0).toLocaleString('th-TH')
  const subject = `[Worldtech CRM] มีคำขอตรวจยอดใหม่ ${pr.pr_no} รอตรวจสอบ`
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1a202c">
      <p>มีคำขอตรวจยอดโอนใหม่รอฝ่ายบัญชีตรวจสอบ</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#718096">เลขคำขอ</td><td style="padding:4px 0"><b>${esc(pr.pr_no)}</b></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#718096">ลูกค้า</td><td style="padding:4px 0">${esc(pr.customer_name || '-')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#718096">เลขที่ PO</td><td style="padding:4px 0">${esc(pr.po_reference || '-')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#718096">ยอดรวม (รวม VAT)</td><td style="padding:4px 0"><b>${amount} บาท</b></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#718096">ผู้ส่งคำขอ</td><td style="padding:4px 0">${esc(pr.requested_by_name || '-')}</td></tr>
      </table>
      <p style="margin-top:16px">กรุณาเข้าเมนู "ตรวจสอบยอดโอน" ในระบบ Worldtech CRM เพื่อตรวจสอบและอนุมัติ</p>
    </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: emails, subject, html })
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return json({ error: 'ส่งอีเมลไม่สำเร็จ', detail }, 502)
  }
  return json({ sent: true, recipients: emails.length })
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
