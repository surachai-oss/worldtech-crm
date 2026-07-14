import html2canvas from 'html2canvas'
import { fmtCurrency, fmtDate } from './format'
import { listPaymentItems, getPaymentSlipUrl } from './api'

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// เดาชนิดไฟล์สลิปจากนามสกุล — ใช้เลือกวิธีแสดงผล (รูปภาพฝังตรงๆ, PDF ฝังผ่าน iframe, อื่นๆ ให้ลิงก์เปิด)
function slipKind(path) {
  const ext = (path || '').split('.').pop().toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}

// ใบอนุมัติตรวจสอบยอดโอน — ให้ Sale ดาวน์โหลด/พิมพ์เป็น PDF แนบตอนเปิดออเดอร์ในระบบ (แสดงได้เฉพาะคำขอที่บัญชีอนุมัติแล้ว)
// รูปแบบอ้างอิงจากเทมเพลตใบเสนอราคาเดิม (printQuotation.js) ให้หน้าตาเป็นชุดเดียวกัน
// slip: { url, kind } จาก getPaymentSlipUrl + slipKind — หรือ null ถ้าไม่มีสลิปแนบ/โหลดไม่สำเร็จ
// autoPrint: false ใช้ตอนแปลงเป็นรูปภาพ (downloadPaymentApprovalImage) — ไม่ต้องมีปุ่ม/สคริปต์เปิด print dialog ของเบราว์เซอร์
// order: เอกสารออเดอร์ที่ผูกกับคำขอนี้ (ต้องส่งเข้ามาจากหน้าที่มี order อยู่แล้ว) — ใช้ดึงชื่อเซลล์ผู้เปิดออเดอร์มาโชว์ กันหาไม่เจอเวลาเอกสารผิดพลาด
export function buildPaymentApprovalHtml(pr, settings = {}, items = [], logoUrl = '/worldtech-logo.png', slip = null, order = null, { autoPrint = true } = {}) {
  const name = settings.COMPANY_NAME || 'Worldtech Co., Ltd.'
  const address = settings.COMPANY_ADDRESS || ''
  const taxId = settings.COMPANY_TAX_ID || ''

  const total = Number(pr.total_amount) || 0
  const exVat = round2(total / 1.07)
  const vat = round2(total - exVat)

  const itemRows = items.map(it => `
    <tr>
      <td>${escapeHtml(it.product_name || it.sku || '-')}</td>
      <td class="num">${it.quantity}</td>
      <td class="num">${fmtCurrency(it.unit_price)}</td>
      <td class="num">${fmtCurrency(it.discount)}</td>
      <td class="num" style="font-weight:700">${fmtCurrency(it.line_total)}</td>
    </tr>`).join('')

  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(pr.approval_ref_no || pr.pr_no)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; color:#2d3748; font-size: 13px; margin:0; }
        .banner { background:#1b315e; color:#fff; text-align:center; padding:10px; border-radius:4px; margin-bottom:18px; }
        .banner .th { font-weight:700; font-size:16px; }
        .banner .en { font-size:11px; letter-spacing:1px; opacity:.85; }
        .topinfo { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:18px; }
        .company-block { display:flex; gap:10px; align-items:center; flex:1; min-width:0; }
        .logo { height:44px; flex-shrink:0; }
        .company-name { font-weight:700; font-size:14px; }
        .meta { font-size:11.5px; color:#4a5568; margin-top:2px; line-height:1.5; }
        .doc-meta { text-align:right; font-size:12px; flex-shrink:0; white-space:nowrap; }
        .doc-meta .label { font-weight:700; margin-top:10px; }
        .doc-meta .label:first-child { margin-top:0; }
        .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; font-size:12.5px; margin-bottom:16px; padding:12px 14px; background:#f4f6f9; border-radius:4px; }
        .info-grid .k { color:#718096; }
        table { width:100%; border-collapse:collapse; margin-bottom:12px; }
        th { background:#1b315e; color:#fff; text-align:left; padding:8px 10px; font-size:12px; }
        th.num, td.num { text-align:right; }
        td { padding:8px 10px; border-bottom:1px solid #e0e4ea; font-size:13px; }
        .totals-box { min-width:280px; font-size:12.5px; margin-left:auto; }
        .totals-box .row { display:flex; justify-content:space-between; padding:4px 10px; }
        .totals-box .grand { background:#1b315e; color:#fff; font-weight:700; border-radius:2px; }
        .sign { display:flex; justify-content:space-between; margin-top:50px; font-size:12px; }
        .sign-col { width:45%; text-align:center; }
        .sign-name { min-height:16px; font-weight:600; margin-bottom:4px; }
        .sign-label { border-top:1px solid #999; padding-top:6px; }
        @media print { .no-print { display:none; } }
      </style>
    </head>
    <body>
      <div class="banner"><div class="th">ใบอนุมัติตรวจสอบยอดโอน</div><div class="en">PAYMENT APPROVAL</div></div>

      <div class="topinfo">
        <div class="company-block">
          <img class="logo" src="${logoUrl}" onerror="this.style.display='none'" />
          <div>
            <div class="company-name">${escapeHtml(name)}</div>
            <div class="meta">${escapeHtml(address).replace(/\n/g, '<br/>')}</div>
            ${taxId ? `<div class="meta">เลขประจำตัวผู้เสียภาษี : ${escapeHtml(taxId)}</div>` : ''}
          </div>
        </div>
        <div class="doc-meta">
          <div class="label">เลขที่อ้างอิงอนุมัติ</div>
          <div>${escapeHtml(pr.approval_ref_no || '-')}</div>
          <div class="label">เลขคำขอ</div>
          <div>${escapeHtml(pr.pr_no)}</div>
        </div>
      </div>

      <div class="info-grid">
        <div><span class="k">ลูกค้า:</span> ${escapeHtml(pr.customer_name || '-')}</div>
        <div><span class="k">ประเภทลูกค้า:</span> ${escapeHtml(pr.credit_type || '-')}</div>
        <div><span class="k">ประเภทการชำระ:</span> ${escapeHtml(pr.payment_type || '-')}</div>
        <div><span class="k">เลขที่ออเดอร์:</span> ${escapeHtml(pr.order_no || pr.order?.order_no || '-')}</div>
        <div><span class="k">เซลล์ผู้เปิดออเดอร์:</span> ${escapeHtml(order?.sales_name || '-')}</div>
        <div><span class="k">เลขที่ PO:</span> ${escapeHtml(pr.po_reference || '-')}</div>
        <div><span class="k">วันที่คำขอ:</span> ${fmtDate(pr.request_date || pr.created_at)}</div>
        <div><span class="k">ผู้ส่งคำขอ:</span> ${escapeHtml(pr.requested_by_name || '-')}</div>
        <div><span class="k">วันที่อนุมัติ:</span> ${fmtDate(pr.finance_reviewed_at)}</div>
        <div><span class="k">ผู้อนุมัติ:</span> ${escapeHtml(pr.finance_reviewer_name || '-')}</div>
        ${pr.finance_ref_no ? `<div><span class="k">Ref No.:</span> ${escapeHtml(pr.finance_ref_no)}</div>` : ''}
      </div>

      <table>
        <thead>
          <tr>
            <th>สินค้า/รายการ</th>
            <th class="num" style="width:70px">จำนวน</th>
            <th class="num" style="width:110px">ราคา/หน่วย</th>
            <th class="num" style="width:90px">ส่วนลด</th>
            <th class="num" style="width:120px">รวม</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="totals-box">
        <div class="row"><span>ไม่รวม VAT</span><span>${fmtCurrency(exVat)}</span></div>
        <div class="row"><span>VAT 7%</span><span>${fmtCurrency(vat)}</span></div>
        <div class="row grand"><span>รวมทั้งสิ้น</span><span>${fmtCurrency(total)}</span></div>
      </div>

      ${pr.finance_remark ? `<div style="margin-top:16px;font-size:12px;color:#4a5568"><b>หมายเหตุจากบัญชี:</b> ${escapeHtml(pr.finance_remark)}</div>` : ''}

      ${slip ? `
      <div style="margin-top:16px">
        <div class="section-label">หลักฐานการโอน (สลิป)</div>
        ${slip.kind === 'image'
          ? `<img src="${slip.url}" style="max-width:220px;max-height:280px;border:1px solid #e0e4ea;border-radius:4px" onerror="this.replaceWith(document.createTextNode('ไม่พบไฟล์สลิป'))" />`
          : slip.kind === 'pdf'
            ? `<iframe src="${slip.url}" style="width:220px;height:280px;border:1px solid #e0e4ea;border-radius:4px"></iframe>
               <div style="font-size:11px;color:#718096;margin-top:4px">หากไฟล์ไม่แสดง <a href="${slip.url}" target="_blank">เปิดไฟล์สลิปที่นี่</a></div>`
            : `<a href="${slip.url}" target="_blank">เปิดไฟล์สลิปที่แนบไว้</a>`}
      </div>` : ''}

      <div class="sign">
        <div class="sign-col">
          <div class="sign-name">${pr.finance_reviewer_name ? escapeHtml(pr.finance_reviewer_name) : '&nbsp;'}</div>
          <div class="sign-label">ผู้อนุมัติ (ฝ่ายบัญชี)</div>
        </div>
        <div class="sign-col">
          <div class="sign-name">&nbsp;</div>
          <div class="sign-label">ผู้เปิดออเดอร์</div>
        </div>
      </div>

      ${autoPrint ? `
      <div class="no-print" style="margin-top:24px;text-align:center">
        <button onclick="window.print()" style="padding:10px 20px;font-size:14px;cursor:pointer">พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <script>window.onload = () => window.print();</script>
      ` : ''}
    </body>
    </html>
  `
}

function waitForImages(el) {
  return Promise.all(Array.from(el.querySelectorAll('img')).map(img => img.complete ? Promise.resolve() : new Promise(resolve => {
    img.addEventListener('load', resolve, { once: true })
    img.addEventListener('error', resolve, { once: true })
  })))
}

// เปิดหน้าต่างใหม่ก่อน (sync ตอน click) กันโดน popup blocker แล้วค่อยโหลดรายการสินค้า async — แบบเดียวกับ printQuotation
export async function printPaymentApproval(pr, settings = {}, order = null) {
  const w = window.open('', '_blank', 'width=800,height=1000')
  if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้'); return }
  w.document.write('<html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#718096">กำลังโหลดข้อมูล...</body></html>')

  try {
    const items = await listPaymentItems(pr.id)
    let slip = null
    if (pr.slip_file_url) {
      // โหลดสลิปแบบ best-effort — ถ้าไฟล์หายหรือ signed URL พลาด ไม่ให้กระทบการพิมพ์เอกสารหลัก
      try { slip = { url: await getPaymentSlipUrl(pr.slip_file_url), kind: slipKind(pr.slip_file_url) } }
      catch { /* ข้ามส่วนสลิปไป */ }
    }
    const logoUrl = `${window.location.origin}/worldtech-logo.png`
    const html = buildPaymentApprovalHtml(pr, settings, items, logoUrl, slip, order)
    w.document.open()
    w.document.write(html)
    w.document.close()
  } catch (e) {
    w.document.open()
    w.document.write(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#e53e3e">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(e.message)}</body></html>`)
    w.document.close()
  }
}

// ดาวน์โหลดใบอนุมัติเป็นไฟล์รูปภาพ (PNG) — เนื้อหาเหมือน PDF ทุกอย่าง แค่เปลี่ยนสกุลไฟล์
// เพราะระบบบัญชีภายนอกที่ต้องเอาไปแนบต่อรับแนบได้เฉพาะไฟล์รูปภาพเท่านั้น ไม่รับ PDF
// เรนเดอร์เทมเพลตเดียวกันในกล่องที่ซ่อนไว้ในหน้าเดิมแล้วถ่ายภาพด้วย html2canvas (วิธีเดียวกับ renderQuotationPdfBlob)
export async function downloadPaymentApprovalImage(pr, settings = {}, order = null) {
  const items = await listPaymentItems(pr.id)
  let slip = null
  if (pr.slip_file_url) {
    try { slip = { url: await getPaymentSlipUrl(pr.slip_file_url), kind: slipKind(pr.slip_file_url) } }
    catch { /* ข้ามส่วนสลิปไป */ }
  }
  const logoUrl = `${window.location.origin}/worldtech-logo.png`
  const html = buildPaymentApprovalHtml(pr, settings, items, logoUrl, slip, order, { autoPrint: false })
  const parsed = new DOMParser().parseFromString(html, 'text/html')

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '0'
  container.style.top = '0'
  container.style.width = '210mm'
  container.style.padding = '14mm'
  container.style.boxSizing = 'border-box'
  container.style.background = '#fff'
  container.style.zIndex = '-9999'
  container.style.pointerEvents = 'none'
  const styleEl = document.createElement('style')
  styleEl.textContent = parsed.querySelector('style')?.textContent || ''
  container.appendChild(styleEl)
  Array.from(parsed.body.childNodes).forEach(node => container.appendChild(node))
  document.body.appendChild(container)

  try {
    await waitForImages(container)
    await new Promise(r => requestAnimationFrame(r)) // รอ layout settle ก่อนถ่ายภาพ

    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${pr.approval_ref_no || pr.pr_no || 'payment-approval'}.png`
    a.click()
  } finally {
    document.body.removeChild(container)
  }
}
