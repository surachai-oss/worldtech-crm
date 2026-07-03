import { fmtCurrency, fmtDate } from './format'

// เปิดหน้าต่างใหม่พร้อมใบเสนอราคาที่จัดรูปแบบสำหรับพิมพ์ / บันทึกเป็น PDF
// (ใช้ browser print dialog แทนการสร้างไฟล์ฝั่ง server เพราะไม่มี Google Docs/Drive แล้ว)
export function printQuotation(quot, company, companyProfile = {}) {
  const w = window.open('', '_blank', 'width=800,height=1000')
  if (!w) { alert('เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้'); return }

  const name = companyProfile.name || 'Worldtech Co., Ltd.'
  const address = companyProfile.address || ''
  const phone = companyProfile.phone || ''
  const email = companyProfile.email || ''

  w.document.write(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>${quot.quot_no}</title>
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family: 'Sarabun', 'Tahoma', sans-serif; color:#2d3748; font-size: 13px; }
        .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1b315e; padding-bottom:12px; margin-bottom:16px; }
        .company-name { font-size:18px; font-weight:700; color:#1b315e; }
        .doc-title { font-size:18px; font-weight:700; color:#1b315e; text-align:right; }
        .meta { font-size:11px; color:#718096; margin-top:4px; }
        table { width:100%; border-collapse:collapse; margin-top:16px; }
        th { background:#1b315e; color:#fff; text-align:left; padding:8px 10px; font-size:12px; }
        td { padding:8px 10px; border-bottom:1px solid #e0e4ea; font-size:13px; }
        .total-row td { font-weight:700; border-top:2px solid #1b315e; }
        .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; font-size:12px; }
        .sign { display:flex; justify-content:space-between; margin-top:60px; font-size:12px; }
        .sign div { width:45%; text-align:center; border-top:1px solid #999; padding-top:6px; }
        @media print { .no-print { display:none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="company-name">${name}</div>
          <div class="meta">${address}</div>
          <div class="meta">${phone ? 'โทร: ' + phone + '  ' : ''}${email ? 'อีเมล: ' + email : ''}</div>
        </div>
        <div>
          <div class="doc-title">ใบเสนอราคา<br/>QUOTATION</div>
          <div class="meta">เลขที่: ${quot.quot_no}</div>
        </div>
      </div>

      <div class="info-grid">
        <div><b>เสนอราคาให้:</b><br/>${company ? company.name : '-'}<br/>${company?.address || ''}</div>
        <div style="text-align:right">
          วันที่: ${fmtDate(quot.quot_date)}<br/>
          วันหมดอายุ: ${fmtDate(quot.expire_date) || '-'}<br/>
          สถานะ: ${quot.status}
        </div>
      </div>

      <table>
        <thead><tr><th>รายการ</th><th style="text-align:right">จำนวนเงิน (บาท)</th></tr></thead>
        <tbody>
          <tr><td>${quot.subject || '-'}</td><td style="text-align:right">${fmtCurrency(quot.value)}</td></tr>
          <tr class="total-row"><td>รวมทั้งสิ้น</td><td style="text-align:right">${fmtCurrency(quot.value)}</td></tr>
        </tbody>
      </table>

      ${quot.note ? `<p style="margin-top:16px"><b>หมายเหตุ:</b><br/>${quot.note}</p>` : ''}

      <div class="sign">
        <div>ผู้เสนอราคา</div>
        <div>ผู้อนุมัติ</div>
      </div>

      <div class="no-print" style="margin-top:24px;text-align:center">
        <button onclick="window.print()" style="padding:10px 20px;font-size:14px;cursor:pointer">🖨 พิมพ์ / บันทึกเป็น PDF</button>
      </div>
      <script>window.onload = () => window.print();</script>
    </body>
    </html>
  `)
  w.document.close()
}
