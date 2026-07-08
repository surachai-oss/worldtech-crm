import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { fmtCurrency, fmtDate } from './format'
import { listQuotationItems, getProductImageUrl } from './api'

const VAT_RATE = 0.07
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// แยก HTML generation ออกจาก window.open เพื่อให้ทดสอบได้ตรงๆ โดยไม่ต้องพึ่ง browser API
// รูปแบบอ้างอิงจากตัวอย่างใบเสนอราคาจริงของบริษัท — unit_price ที่กรอกถือว่ารวม VAT แล้ว เหมือนราคาต่อหน่วยในดีล
// items รับเป็น array ที่ resolve รูปมาแล้ว [{ description, quantity, unit_price, imageUrl }] (ไม่ import api.js ตรงๆ ในฟังก์ชันนี้ เพื่อให้เทสได้โดยไม่ต้องพึ่ง supabase client)
// autoPrint: false ใช้ตอนสร้าง HTML สำหรับแปลงเป็น PDF ไฟล์ (renderQuotationPdfBlob) — ไม่ต้องมีปุ่ม/สคริปต์เปิด print dialog ของเบราว์เซอร์
export function buildQuotationHtml(quot, company, settings = {}, logoUrl = '/worldtech-logo.png', items = [], { autoPrint = true } = {}) {
  const name = settings.COMPANY_NAME || 'Worldtech Co., Ltd.'
  const address = settings.COMPANY_ADDRESS || ''
  const phone = settings.COMPANY_PHONE || ''
  const email = settings.COMPANY_EMAIL || ''
  const line = settings.COMPANY_LINE || ''
  const taxId = settings.COMPANY_TAX_ID || ''

  // ใบเสนอราคาเก่าที่ไม่มีรายการสินค้าเลย (ก่อนมีระบบรายการหลายชิ้น) — ใช้ subject/value เดิมเป็นรายการเดียว
  const rows = items.length ? items : [{ description: quot.subject, quantity: 1, unit_price: Number(quot.value) || 0, imageUrl: null }]

  const value = round2(rows.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0))
  const exVat = round2(value / (1 + VAT_RATE))
  const vatAmount = round2(value - exVat)

  const customerLines = [
    company?.address,
    company?.tax_id ? `เลขประจำตัวผู้เสียภาษี : ${company.tax_id}` : '',
    company?.phone ? `โทร ${company.phone}` : '',
  ].filter(Boolean).map(escapeHtml).join('<br/>')

  const noteHtml = quot.note
    ? `<div class="remark-label">หมายเหตุ</div><div class="remark-body">${escapeHtml(quot.note).replace(/\n/g, '<br/>')}</div>`
    : ''

  const contactLines = [
    line ? `Line@ : ${line}` : '',
    [phone && `โทร: ${phone}`, email && `อีเมล: ${email}`].filter(Boolean).join('   '),
    quot.sale_phone ? `ติดต่อเซลล์ : ${quot.sale_phone}` : '',
  ].filter(Boolean).map(escapeHtml).join('<br/>')

  const itemRows = rows.map(it => {
    const qty = Number(it.quantity) || 0
    const unitPrice = Number(it.unit_price) || 0
    return `
      <tr>
        <td>${qty}</td>
        <td>
          ${escapeHtml(it.description) || '-'}
          ${it.imageUrl ? `<br/><img src="${it.imageUrl}" style="max-width:220px;max-height:160px;margin-top:6px;border-radius:4px" onerror="this.style.display='none'" />` : ''}
        </td>
        <td class="num">${fmtCurrency(unitPrice)}</td>
        <td class="num">-</td>
        <td class="num" style="font-weight:700">${fmtCurrency(qty * unitPrice)}</td>
      </tr>`
  }).join('')

  return `
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(quot.quot_no)}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; color:#2d3748; font-size: 13px; margin:0; }
        .banner { background:#1b315e; color:#fff; text-align:center; padding:10px; border-radius:4px; margin-bottom:18px; }
        .banner .th { font-weight:700; font-size:16px; }
        .banner .en { font-size:11px; letter-spacing:1px; opacity:.85; }
        .topinfo { display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:18px; }
        .company-block { display:flex; gap:10px; align-items:center; flex:1; min-width:0; }
        .company-block > div { min-width:0; }
        .logo { height:44px; flex-shrink:0; }
        .company-name { font-weight:700; font-size:14px; }
        .meta { font-size:11.5px; color:#4a5568; margin-top:2px; line-height:1.5; }
        .doc-meta { text-align:right; font-size:12px; flex-shrink:0; white-space:nowrap; }
        .doc-meta .label { font-weight:700; margin-top:10px; }
        .doc-meta .label:first-child { margin-top:0; }
        .section-label { font-weight:700; margin-bottom:6px; }
        .customer-block { margin-bottom:16px; }
        .customer-info { padding-left:16px; font-size:12.5px; line-height:1.6; }
        table { width:100%; border-collapse:collapse; margin-bottom:12px; }
        th { background:#1b315e; color:#fff; text-align:left; padding:8px 10px; font-size:12px; }
        th.num, td.num { text-align:right; }
        td { padding:8px 10px; border-bottom:1px solid #e0e4ea; font-size:13px; vertical-align:top; }
        .below-table { display:flex; justify-content:space-between; gap:16px; margin-bottom:16px; }
        .notes-left { color:#e53e3e; font-style:italic; font-size:12px; flex:1; }
        .totals-box { min-width:280px; font-size:12.5px; }
        .totals-box .row { display:flex; justify-content:space-between; padding:4px 10px; }
        .totals-box .grand { background:#1b315e; color:#fff; font-weight:700; border-radius:2px; }
        .remark-label { display:inline-block; background:#1b315e; color:#fff; font-size:11.5px; font-weight:700; padding:2px 10px; border-radius:2px; margin-bottom:6px; }
        .remark-body { font-size:12px; color:#4a5568; line-height:1.6; margin-bottom:16px; }
        .contact-box { background:#f4f6f9; padding:10px 14px; border-radius:4px; font-size:12px; line-height:1.6; }
        .sign { display:flex; justify-content:space-between; margin-top:50px; font-size:12px; }
        .sign-col { width:45%; text-align:center; }
        .sign-name { min-height:16px; font-weight:600; margin-bottom:4px; }
        .sign-label { border-top:1px solid #999; padding-top:6px; }
        @media print { .no-print { display:none; } }
      </style>
    </head>
    <body>
      <div class="banner"><div class="th">ใบเสนอราคา</div><div class="en">QUOTATION</div></div>

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
          <div class="label">วันที่:</div>
          <div>${fmtDate(quot.quot_date)}</div>
          <div class="label">เลขที่</div>
          <div>${escapeHtml(quot.quot_no)}</div>
          ${quot.credit_term ? `
          <div class="label">เงื่อนไขการชำระเงิน</div>
          <div>${escapeHtml(quot.credit_term)}${quot.payment_due_date ? `<br/>ครบกำหนด ${fmtDate(quot.payment_due_date)}` : ''}</div>
          ` : ''}
        </div>
      </div>

      <div class="customer-block">
        <div class="section-label">ชื่อลูกค้า</div>
        <div class="customer-info">
          ${escapeHtml(company ? company.name : '-')}<br/>
          ${customerLines}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:60px">จำนวน</th>
            <th>รายการสินค้า</th>
            <th class="num" style="width:120px">ราคาต่อหน่วย</th>
            <th class="num" style="width:110px">ส่วนลด(บาท)</th>
            <th class="num" style="width:120px">ยอดรวม</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
      </table>

      <div class="below-table">
        <div class="notes-left">
          ${quot.expire_date ? `ยืนราคาถึง ${fmtDate(quot.expire_date)}` : ''}
        </div>
        <div class="totals-box">
          <div class="row"><span>จำนวนเงินรวมก่อน Vat</span><span>${fmtCurrency(exVat)}</span></div>
          <div class="row"><span>Vat 7%</span><span>${fmtCurrency(vatAmount)}</span></div>
          <div class="row grand"><span>จำนวนเงินที่ต้องชำระ</span><span>${fmtCurrency(value)}</span></div>
        </div>
      </div>

      ${noteHtml}

      <div class="contact-box">
        <div style="font-weight:700; margin-bottom:2px">ติดต่อสอบถามข้อมูลเพิ่มเติมได้ที่</div>
        ${contactLines}
      </div>

      <div class="sign">
        <div class="sign-col">
          <div class="sign-name">${quot.proposer_name ? escapeHtml(quot.proposer_name) : '&nbsp;'}</div>
          <div class="sign-label">ผู้เสนอราคา</div>
        </div>
        <div class="sign-col">
          <div class="sign-name">&nbsp;</div>
          <div class="sign-label">ผู้อนุมัติ</div>
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

// สร้างไฟล์ PDF จริงจากเทมเพลตเดียวกับที่ใช้พิมพ์ — เรนเดอร์ในกล่องที่ซ่อนไว้ในหน้าเดิม (ไม่ใช้ iframe เพราะ html2canvas จับภาพข้าม document แล้วได้ผลลัพธ์ผิด/ดำล้วน) แล้วถ่ายภาพด้วย html2canvas ต่อด้วย jsPDF แบ่งหน้า A4
// ใช้ตอนอัปโหลดขึ้น Google Drive อัตโนมัติทุกครั้งที่บันทึก/แก้ไขใบเสนอราคา ไม่ต้องพึ่งผู้ใช้กด "บันทึกเป็น PDF" เอง
export async function renderQuotationPdfBlob(quot, company, settings = {}, items = []) {
  const logoUrl = `${window.location.origin}/worldtech-logo.png`
  const html = buildQuotationHtml(quot, company, settings, logoUrl, items, { autoPrint: false })
  const parsed = new DOMParser().parseFromString(html, 'text/html')

  // ต้องอยู่ในตำแหน่งปกติของหน้า (เลื่อนออกนอกจอไกลเกินไปทำให้ html2canvas จับภาพผิด/ได้ภาพดำล้วน) และห้ามใช้ opacity/visibility ซ่อน
  // (opacity ต่ำๆ จะถูกจับภาพติดไปด้วยจนกลายเป็นภาพจางเกือบขาว แล้วไปพังตอนฝัง PDF เป็นภาพดำทั้งหน้า) — ซ่อนด้วย z-index ต่ำให้อยู่หลังเนื้อหาแอปแทน
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
    // ใช้ JPEG ไม่ใช่ PNG — jsPDF บางเวอร์ชัน parse PNG ขนาดใหญ่จาก html2canvas พลาด แล้วได้ภาพดำล้วนแทนแบบเงียบๆ (ไม่ error ให้เห็น)
    const imgData = canvas.toDataURL('image/jpeg', 0.92)

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageWidth = 210
    const pageHeight = 297
    const imgHeight = (canvas.height * pageWidth) / canvas.width

    let heightLeft = imgHeight
    let position = 0
    pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight)
    heightLeft -= pageHeight
    while (heightLeft > 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, imgHeight)
      heightLeft -= pageHeight
    }

    return pdf.output('blob')
  } finally {
    document.body.removeChild(container)
  }
}

// โหลดรายการสินค้าของใบเสนอราคาพร้อม resolve รูปสินค้าเป็น URL แล้ว — ใช้ร่วมกันทั้งตอนพิมพ์และตอนสร้าง PDF อัปโหลด Drive
export async function loadQuotationPdfItems(quotId) {
  const rawItems = await listQuotationItems(quotId)
  return rawItems.map(it => ({
    description: it.description || it.product?.name || '',
    quantity: it.quantity,
    unit_price: it.unit_price,
    imageUrl: it.product?.image_path ? getProductImageUrl(it.product.image_path) : null
  }))
}

// เปิดหน้าต่างใหม่ก่อน (sync ตอน click) กันโดน popup blocker แล้วค่อยโหลดรายการสินค้า/รูปแบบ async
export async function printQuotation(quot, company, settings = {}) {
  const w = window.open('', '_blank', 'width=800,height=1000')
  if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้'); return }
  w.document.write('<html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#718096">กำลังโหลดข้อมูล...</body></html>')

  try {
    const items = await loadQuotationPdfItems(quot.id)
    const logoUrl = `${window.location.origin}/worldtech-logo.png`
    const html = buildQuotationHtml(quot, company, settings, logoUrl, items)
    w.document.open()
    w.document.write(html)
    w.document.close()
  } catch (e) {
    w.document.open()
    w.document.write(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#e53e3e">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(e.message)}</body></html>`)
    w.document.close()
  }
}
