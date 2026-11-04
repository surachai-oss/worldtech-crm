// ===== ตรวจว่าบรรทัดสินค้า "ชื่อรายการ" กับ "สินค้าที่ผูกไว้" ไปด้วยกันไหม =====
//
// ช่องสินค้าในฟอร์มดีล/ใบเสนอราคารวมสองหน้าที่ไว้ในช่องเดียว คือเลือกสินค้าก็ได้ พิมพ์ชื่อเองก็ได้
// เลือกไปแล้วพิมพ์ทับ ชื่อรายการเปลี่ยนแต่ product_id ที่ผูกไว้ยังเป็นตัวเดิม
// ผลคือบรรทัด "ค่าจัดส่งสินค้า" ลากต้นทุนของสินค้าที่ผูกค้างไว้เข้าไปคิดกำไรด้วย
// (snapshot_order_item_cost ดึง cost_price จาก product_id ของบรรทัด ไม่ได้ดูชื่อรายการ)
//
// เกิดจริงแล้ว 2 รอบ: 11 บรรทัดที่แก้เมื่อ 27 ต.ค. และอีก 20 บรรทัดเมื่อ 4 พ.ย.
// รอบหลังมาจากการคัดลอกใบเสนอราคาต่อๆ กัน ใบต้นฉบับผิดใบเดียวแล้วพ่วงไปทั้งชุดในวันเดียว
// ป้ายเตือนใต้ช่องสินค้าช่วยได้เฉพาะคนที่เปิดดูหน้ารายการ แต่คนกดคัดลอกไม่ได้เปิดดู
// จึงต้องเช็คอีกชั้นตอนกดบันทึก

// เทียบหยาบๆ พอให้จับเคสที่ผิดชัดๆ อย่าง "ค่าขนส่ง" ผูกกับไส้กรอง
// ไม่เข้มงวดถึงขั้นต้องตรงเป๊ะ เพราะแก้ชื่อสินค้านิดหน่อยตอนเสนอราคาเป็นเรื่องปกติ
// (เช่นพิมพ์ "จอแอนดรอย" ตกตัว ด์ หรือต่อท้ายข้อความเพิ่ม — แบบนั้นถือว่าเข้าพวก)
export const looksRelated = (text, label) => {
  const a = (text || '').trim().toLowerCase()
  const b = (label || '').trim().toLowerCase()
  if (!a || !b) return true
  if (a.length < 3) return true
  if (b.includes(a) || a.includes(b)) return true
  return b.split(/[\s-]+/).filter(w => w.length >= 3).some(w => a.includes(w))
}

export const productLabel = (p) => (p?.code ? `${p.code} - ${p.name || ''}`.trim() : (p?.name || ''))

// คืนรายการบรรทัดที่ชื่อไม่เข้าพวกกับสินค้าที่ผูกไว้ — บรรทัดที่ไม่ได้ผูกสินค้าไม่นับ (พิมพ์ชื่อเองล้วนๆ ถูกต้องอยู่แล้ว)
export function findMismatchedItems(items, products) {
  const byId = new Map((products || []).map(p => [p.id, p]))
  const out = []
  ;(items || []).forEach((it, i) => {
    if (!it?.product_id) return
    const p = byId.get(it.product_id)
    if (!p) return                       // โหลดรายการสินค้ายังไม่เสร็จ หรือสินค้าถูกลบ — ไม่เดาแทนผู้ใช้
    const label = productLabel(p)
    if (looksRelated(it.description, label)) return
    out.push({ row: i + 1, description: (it.description || '').trim(), product: label })
  })
  return out
}

// ข้อความยืนยันตอนกดบันทึก — บอกให้ชัดว่าบรรทัดไหน ผูกกับอะไร และถ้าปล่อยผ่านจะเกิดอะไร
// ไม่บล็อกการบันทึก เพราะบางทีผูกถูกแล้วแค่ตั้งชื่อรายการต่างจากชื่อสินค้าจริงๆ
export function mismatchConfirmMessage(list, lang = 'th') {
  const lines = list.map(m => lang === 'en'
    ? `Line ${m.row}: "${m.description}" → linked to ${m.product}`
    : `แถวที่ ${m.row}: "${m.description}" → ผูกกับ ${m.product}`)
  return lang === 'en'
    ? [
        `Found ${list.length} line(s) whose name doesn't match the linked product:`,
        '', ...lines, '',
        'If you are not actually selling that product, its cost will be counted into the profit of this document.',
        'Clear the product link on those lines first, or press OK to save as is.',
      ].join('\n')
    : [
        `พบ ${list.length} รายการที่ชื่อไม่ตรงกับสินค้าที่ผูกไว้:`,
        '', ...lines, '',
        'ถ้าไม่ได้ขายสินค้าตัวนั้นจริง ต้นทุนของมันจะถูกนำไปคิดกำไรของเอกสารนี้ด้วย',
        'กลับไปกดกากบาทที่ป้ายใต้ช่องสินค้าเพื่อปลดการผูกก่อน หรือกดตกลงเพื่อบันทึกตามนี้',
      ].join('\n')
}

// ใช้ตอนกดบันทึก — ถ้ามีบรรทัดที่ชื่อไม่เข้าพวกกับสินค้าที่ผูกไว้ ให้ถามยืนยันก่อน
// คืน true = ไปต่อได้ (ไม่มีปัญหา หรือผู้ใช้ยืนยันแล้ว)
export async function confirmItemLinks(items, products, confirm, lang = 'th') {
  const bad = findMismatchedItems(items, products)
  if (!bad.length) return true
  return await confirm(mismatchConfirmMessage(bad, lang))
}
