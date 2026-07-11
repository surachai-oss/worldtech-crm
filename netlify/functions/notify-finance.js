import { createClient } from '@supabase/supabase-js'

// แจ้งเตือนฝ่ายบัญชีเมื่อเซลล์กด "ส่งให้บัญชี":
//   1) แจ้งเตือนในระบบ (ตาราง notifications) — insert ให้ทุก user สิทธิ์ finance เสมอ ไม่ต้องตั้งค่าเพิ่ม
//   2) อีเมล (Resend) — ตั้ง RESEND_API_KEY + NOTIFY_FROM_EMAIL ใน Netlify env ถ้าต้องการ (ไม่บังคับ)
// ต้องใช้ Service Role Key ข้าม RLS เพราะ Sale (ผู้เรียก) ไม่มีสิทธิ์เห็น/เขียนแถวของผู้ใช้อื่น (ตาราง profiles/notifications)
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

  const { data: financeUsers } = await admin.from('profiles').select('id, email, full_name').eq('role', 'finance')
  if (!financeUsers?.length) return json({ skipped: true, reason: 'no finance users' })

  const { data: pr } = await admin.from('payment_requests')
    .select('pr_no, customer_name, total_amount, requested_by_name, po_reference')
    .eq('id', prId).maybeSingle()
  if (!pr) return json({ error: 'ไม่พบคำขอตรวจยอด' }, 404)

  const amount = Number(pr.total_amount || 0).toLocaleString('th-TH')
  const title = `คำขอตรวจยอดใหม่ ${pr.pr_no}`
  const summary = `ลูกค้า ${pr.customer_name || '-'} · ยอดรวม ${amount} บาท · ผู้ส่ง ${pr.requested_by_name || '-'}`

  const result = { inApp: false, email: false }

  // 1) แจ้งเตือนในระบบ (กระดิ่งมุมบน) — ใช้งานได้เสมอ ไม่ต้องตั้งค่าเพิ่ม
  const { error: notifErr } = await admin.from('notifications').insert(
    financeUsers.map(u => ({
      user_id: u.id, title, body: summary,
      entity_type: 'payment_request', entity_id: prId, link_view: 'finance-review'
    }))
  )
  result.inApp = !notifErr

  // 2) อีเมล ผ่าน Resend (ไม่บังคับ)
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.NOTIFY_FROM_EMAIL
  const emails = financeUsers.map(u => u.email).filter(Boolean)
  if (resendKey && fromEmail && emails.length) {
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
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, to: emails, subject: title, html })
      })
      result.email = res.ok
    } catch {
      result.email = false
    }
  }

  return json(result)
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
