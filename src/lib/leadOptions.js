// ตัวเลือก dropdown/checkbox ของฟอร์มลีดสาธารณะ (PublicLeadPage.jsx) — แยกมาเป็นไฟล์กลางเพื่อให้ import template
// ในหน้า "ผู้ติดต่อ" (ImportLeadsModal) ใช้ตัวเลือกชุดเดียวกันได้ ไม่ต้องประกาศซ้ำ
export const POSITION_OPTIONS = ['เจ้าของกิจการ', 'ฝ่ายจัดซื้อ', 'พนักงานขาย', 'บุคคลทั่วไป']

export const BUSINESS_TYPE_OTHER = 'อื่นๆ โปรดระบุ'
export const BUSINESS_TYPE_OPTIONS = [
  'ตัวแทนจำหน่าย เช่น ร้านค้าปลีกเครื่องใช้ไฟฟ้า',
  'ธุรกิจอสังหาริมทรัพย์ เช่น หอพัก / คอนโด / อพาร์ทเม้นท์',
  'กลุ่มโรงแรม / รีสอร์ท / โฮสเทล',
  'สำนักงาน / ออฟฟิศ / หน่วยงานราชการ',
  'ธุรกิจของพรีเมียม / ของสมนาคุณ / จัดอีเวนต์',
  'ร้านอาหาร / คาเฟ่',
  BUSINESS_TYPE_OTHER
]

export const APPLIANCE_OTHER = 'อื่นๆ'
export const APPLIANCE_OPTIONS = ['ตู้เย็น', 'ตู้แช่แข็ง', 'เครื่องชงกาแฟ', 'ทีวี', 'เครื่องฟอกอากาศ', 'เตาอบ', 'เครื่องผสมอาหาร', APPLIANCE_OTHER]

export const PURCHASE_REASON_OPTIONS = ['สำหรับใช้เอง', 'สำหรับธุรกิจ']

// ===== ช่องทางที่มาของลีด =====
// ค่าที่เข้ามาจริงเขียนไม่เหมือนกันสารพัด (LINE / Line / LINE? / WEB SEARCH / WEB RESEARCH) เพราะ
// ส่วนหนึ่งมาจาก query param ของลิงก์ฟอร์มที่ใครก็พิมพ์อะไรมาก็ได้ ทำให้การ์ดสรุปแตกเป็นหลายใบทั้งที่ความหมายเดียวกัน
// normalizeLeadSource ยุบให้เป็นค่าเดียว — ถ้าจับคู่ไม่ได้เลยจะคืน null เพื่อให้หน้าจอขึ้นเตือนว่าช่องทางไม่ถูก
// (จงใจไม่รวม "เว็บไซต์" กับ "Web Research" เข้าด้วยกัน เพราะคนละเรื่อง: ลูกค้าเข้ามาจากเว็บเราเอง กับ เซลล์ไปหาเจอจากเว็บ)
export const LEAD_SOURCE_UNKNOWN = 'ไม่ระบุที่มา'
export const LEAD_SOURCE_INVALID = 'ช่องทางไม่ถูกต้อง'

export const LEAD_SOURCE_OPTIONS = [
  'Line',
  'แคตตาล็อกออนไลน์',
  'Facebook',
  'Web Research',
  'เว็บไซต์',
  'แนะนำโดยลูกค้าเดิม',
  'งานอีเวนต์/ออกบูธ',
  'โทรเข้ามาเอง',
  'อื่นๆ',
]

// ตัดช่องว่าง เครื่องหมายวรรคตอน และตัวพิมพ์เล็กใหญ่ออกก่อนเทียบ — "LINE?" กับ "line" จึงกลายเป็นคีย์เดียวกัน
const foldSourceKey = (raw) =>
  String(raw ?? '').trim().toLowerCase().replace(/[\s?!.,_@/\\+()-]+/g, '')

const LEAD_SOURCE_ALIASES = {
  line: 'Line', ไลน์: 'Line', lineoa: 'Line', lineat: 'Line', lineofficial: 'Line',
  facebook: 'Facebook', fb: 'Facebook', เฟสบุ๊ค: 'Facebook', เฟสบุ๊ก: 'Facebook', เฟซบุ๊ก: 'Facebook', meta: 'Facebook', messenger: 'Facebook',
  webresearch: 'Web Research', websearch: 'Web Research', web: 'Web Research', google: 'Web Research',
  googlesearch: 'Web Research', ค้นหาจากเว็บ: 'Web Research', ค้นหาเว็บ: 'Web Research', research: 'Web Research',
  website: 'เว็บไซต์', เว็บไซต์: 'เว็บไซต์', เวบไซต์: 'เว็บไซต์', เว็บไซท์: 'เว็บไซต์', เว็บ: 'เว็บไซต์',
  แนะนำโดยลูกค้าเดิม: 'แนะนำโดยลูกค้าเดิม', แนะนำ: 'แนะนำโดยลูกค้าเดิม', referral: 'แนะนำโดยลูกค้าเดิม', refer: 'แนะนำโดยลูกค้าเดิม',
  งานอีเวนต์ออกบูธ: 'งานอีเวนต์/ออกบูธ', อีเวนต์: 'งานอีเวนต์/ออกบูธ', ออกบูธ: 'งานอีเวนต์/ออกบูธ', event: 'งานอีเวนต์/ออกบูธ', exhibition: 'งานอีเวนต์/ออกบูธ',
  โทรเข้ามาเอง: 'โทรเข้ามาเอง', โทรเข้า: 'โทรเข้ามาเอง', walkin: 'โทรเข้ามาเอง', inbound: 'โทรเข้ามาเอง', โทรศัพท์: 'โทรเข้ามาเอง',
  อื่นๆ: 'อื่นๆ', other: 'อื่นๆ', others: 'อื่นๆ',
  catalog: 'แคตตาล็อกออนไลน์', แคตตาล็อก: 'แคตตาล็อกออนไลน์', catalogue: 'แคตตาล็อกออนไลน์',
}
// ค่ามาตรฐานต้องแมพกับตัวเองได้เสมอ ไม่ต้องไปเพิ่มใน alias ทีละตัว
LEAD_SOURCE_OPTIONS.forEach(v => { LEAD_SOURCE_ALIASES[foldSourceKey(v)] = v })

// คืนค่ามาตรฐาน / '' ถ้าไม่ได้กรอกมา / null ถ้ากรอกมาแต่จับคู่ไม่ได้ (= ช่องทางไม่ถูก)
export function normalizeLeadSource(raw) {
  const key = foldSourceKey(raw)
  if (!key) return ''
  return LEAD_SOURCE_ALIASES[key] ?? null
}
