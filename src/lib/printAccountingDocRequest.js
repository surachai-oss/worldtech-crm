import { fmtDate } from './format'

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// เอกสาร preview คำขอเอกสารบัญชี — ให้เซลล์แคป/บันทึกเป็น PDF ส่งให้ลูกค้าเช็คข้อมูล (โดยเฉพาะข้อมูลใบกำกับภาษี) ก่อนกดส่งคำขอจริง
// f = ค่าจากฟอร์ม (document_type/delivery_method/priority + ข้อมูลภาษี/อีเมล/ที่อยู่ตัวจริง), order = ออเดอร์ต้นทาง
export function buildAccountingDocRequestHtml(order, f, logoUrl = '/worldtech-logo.png') {
  const needsTax = f.document_type === 'ใบกำกับภาษี + ใบเสร็จรับเงิน'
  const needsEmail = f.delivery_method === 'ส่งสำเนาทางอีเมล' || f.delivery_method === 'ส่งทั้งอีเมลและตัวจริง'
  const needsOriginal = f.delivery_method === 'ส่งตัวจริง' || f.delivery_method === 'ส่งทั้งอีเมลและตัวจริง'

  const row = (k, v) => v ? `<div class="row"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>` : ''
  const branch = f.branch_type ? `${f.branch_type}${f.branch_type === 'สาขา' && f.branch_no ? ' ' + f.branch_no : ''}` : ''

  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>คำขอเอกสารบัญชี ${escapeHtml(order.order_no || '')}</title>
      <style>
        @page { size: A4; margin: 16mm; }
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; color:#2d3748; font-size: 14px; margin:0; }
        .banner { background:#1b315e; color:#fff; text-align:center; padding:10px; border-radius:4px; margin-bottom:18px; }
        .banner .th { font-weight:700; font-size:16px; }
        .banner .en { font-size:11px; letter-spacing:1px; opacity:.85; }
        .head { display:flex; align-items:center; gap:10px; margin-bottom:16px; }
        .logo { height:40px; }
        .company { font-weight:700; font-size:15px; }
        .sub { font-size:12px; color:#718096; }
        .section-label { font-weight:700; color:#1b315e; margin:16px 0 6px; border-bottom:2px solid #1b315e; padding-bottom:3px; }
        .row { display:flex; padding:5px 0; border-bottom:1px solid #edf0f4; }
        .row .k { width:180px; color:#718096; flex-shrink:0; }
        .row .v { font-weight:600; }
        .note { margin-top:16px; font-size:12px; color:#718096; }
        .no-print { margin-top:24px; text-align:center; }
      </style>
    </head>
    <body>
      <div class="banner">
        <div class="th">คำขอออกเอกสาร (ตรวจสอบข้อมูลก่อนออกเอกสารจริง)</div>
        <div class="en">ACCOUNTING DOCUMENT REQUEST — DRAFT FOR CONFIRMATION</div>
      </div>
      <div class="head">
        <img class="logo" src="${logoUrl}" onerror="this.style.display='none'" />
        <div>
          <div class="company">${escapeHtml(order.customer_name || '-')}</div>
          <div class="sub">เลขที่ออเดอร์ ${escapeHtml(order.order_no || '-')} · วันที่ ${fmtDate(new Date().toISOString())}</div>
        </div>
      </div>

      <div class="section-label">รายละเอียดคำขอ</div>
      ${row('ประเภทเอกสาร', f.document_type)}
      ${row('วิธีส่งเอกสาร', f.delivery_method)}
      ${row('ความเร่งด่วน', f.priority)}

      ${needsTax ? `
        <div class="section-label">ข้อมูลออกใบกำกับภาษี</div>
        ${row('ชื่อผู้เสียภาษี', f.tax_name)}
        ${row('เลขประจำตัวผู้เสียภาษี', f.tax_id)}
        ${row('สำนักงานใหญ่ / สาขา', branch)}
        ${row('ที่อยู่ออกเอกสาร', f.tax_address)}
      ` : ''}

      ${needsEmail ? `<div class="section-label">ส่งทางอีเมล</div>${row('อีเมลผู้รับ', f.email_to)}` : ''}

      ${needsOriginal ? `
        <div class="section-label">จัดส่งเอกสารตัวจริง</div>
        ${row('ชื่อผู้รับ', f.original_recipient_name)}
        ${row('เบอร์โทรผู้รับ', f.original_recipient_phone)}
        ${row('ที่อยู่จัดส่ง', f.original_shipping_address)}
      ` : ''}

      ${f.sales_note ? `<div class="note"><b>หมายเหตุ:</b> ${escapeHtml(f.sales_note)}</div>` : ''}
      <div class="note">* กรุณาตรวจสอบความถูกต้องของข้อมูล โดยเฉพาะชื่อ/เลขผู้เสียภาษี/ที่อยู่ ก่อนยืนยันออกเอกสาร เพื่อป้องกันการแก้ไขภายหลัง</div>

      <div class="no-print">
        <button onclick="window.print()" style="padding:10px 20px;font-size:14px;cursor:pointer">พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `
}

export function printAccountingDocRequest(order, f) {
  const w = window.open('', '_blank', 'width=800,height=1000')
  if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้'); return }
  w.document.write(buildAccountingDocRequestHtml(order, f))
  w.document.close()
}
