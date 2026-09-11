// เทมเพลตเอกสาร — ส่วนที่เป็น "หัวกระดาษ/ท้ายกระดาษ/เงื่อนไข" ของใบเสนอราคาและใบอนุมัติชำระเงิน
// เก็บเป็น JSON ก้อนเดียวในตาราง settings คีย์ DOCUMENT_TEMPLATE เพื่อให้แอดมินแก้ได้จากหน้าเว็บ ไม่ต้อง deploy ใหม่
//
// ขอบเขต: เฉพาะรูปแบบเอกสารเท่านั้น — ตารางสินค้า ราคา ส่วนลด และภาษี ยังคำนวณจากข้อมูลจริงเหมือนเดิม ไม่ได้ย้ายมาไว้ที่นี่
//
// ความเข้ากันได้ย้อนหลัง: ก่อนหน้านี้ข้อมูลบริษัทเก็บเป็นคีย์แยก COMPANY_NAME/COMPANY_ADDRESS/... ในตารางเดียวกัน
// mergeDocumentTemplate จึงอ่านคีย์เก่ามาเป็นค่าตั้งต้นให้ด้วย และตอนบันทึกเราเขียนกลับลงคีย์เก่าไปพร้อมกัน
// เพื่อไม่ให้โค้ดส่วนอื่นที่ยังอ่านคีย์เก่าอยู่พังระหว่างทาง

export const TEMPLATE_SETTING_KEY = 'DOCUMENT_TEMPLATE'

// แผนที่ระหว่างฟิลด์บริษัทในเทมเพลต กับคีย์แบบเก่าในตาราง settings
export const LEGACY_COMPANY_KEYS = {
  name: 'COMPANY_NAME',
  address: 'COMPANY_ADDRESS',
  phone: 'COMPANY_PHONE',
  email: 'COMPANY_EMAIL',
  line: 'COMPANY_LINE',
  taxId: 'COMPANY_TAX_ID',
}

export const DEFAULT_LOGO_URL = '/worldtech-logo.png'

export const TEMPLATE_DEFAULTS = {
  company: {
    name: 'Worldtech Co., Ltd.',
    address: '',
    phone: '',
    email: '',
    line: '',
    taxId: '',
    logoUrl: '',      // ว่าง = ใช้โลโก้ที่ติดมากับระบบ (public/worldtech-logo.png)
  },
  quotation: {
    titleTh: 'ใบเสนอราคา',
    titleEn: 'QUOTATION',
    taxIdLabel: 'เลขประจำตัวผู้เสียภาษี',
    customerLabel: 'ชื่อลูกค้า',
    termsTitle: 'เงื่อนไขการเสนอราคาและการสั่งซื้อ',
    termsBullet: '*',
    terms: [
      'สินค้าพร้อมส่งขึ้นอยู่กับสต็อก ณ วันที่ยืนยันคำสั่งซื้อ และอาจเปลี่ยนแปลงได้โดยไม่ต้องแจ้งล่วงหน้า',
      'ผู้ซื้อต้องจัดเตรียมสถานที่ให้รถขนส่งเข้า–ออกได้สะดวก บริษัทฯ จัดส่งสินค้าและวางสินค้า ณ จุดรับสินค้าเท่านั้น',
      'เมื่อพ้นกำหนดยืนราคา บริษัทฯ ขอสงวนสิทธิ์ในการปรับราคาโดยไม่ต้องแจ้งล่วงหน้า',
      'คำสั่งซื้อสมบูรณ์เมื่อบริษัทฯ ได้รับเอกสารยืนยันการสั่งซื้อ และได้รับเงินมัดจำหรือชำระค่าสินค้าตามเงื่อนไขแล้ว',
      'หากผู้ซื้อไม่รับสินค้าภายใน 30 วัน บริษัทฯ ขอสงวนสิทธิ์ในการเรียกเก็บค่าสินค้าทั้งจำนวน หรือริบเงินมัดจำเป็นค่าเสียหาย',
      'คำสั่งซื้อที่ไม่รับสินค้าเกิน 45 วัน ถือว่ายกเลิกโดยอัตโนมัติ เว้นแต่มีข้อตกลงเป็นลายลักษณ์อักษรเป็นอย่างอื่น',
    ],
    noteTitle: 'หมายเหตุ',
    // หมายเหตุตั้งต้นที่เติมให้อัตโนมัติตอนสร้างใบเสนอราคาใหม่ — ผู้ใช้แก้รายใบได้เหมือนเดิม
    defaultNote: `*ทางบริษัทไม่มีบริการติดตั้งสินค้าหลังการขาย
*รับประกันเปลี่ยนเครื่องใหม่ภายใน 15 วัน (บริษัทรับผิดชอบในเรื่องค่าจัดส่งสินค้าเคลม)
*รับประกันซ่อมฟรี 1 ปี (รวมค่าอะไหล่และค่าแรงช่าง) : เครื่องใช้ไฟฟ้าขนาดเล็ก เช่น TV, เครื่องชงกาแฟ, เตาอบไฟฟ้า และเครื่องเสียงติดรถยนต์
*รับประกันซ่อมฟรี 3 ปี (รวมค่าอะไหล่และค่าแรงช่าง) : เครื่องใช้ไฟฟ้าขนาดใหญ่ เช่น ตู้เย็น, ตู้แช่, เครื่องซักผ้า`,
    contactTitle: 'ติดต่อสอบถามข้อมูลเพิ่มเติมได้ที่',
    // เบอร์ที่เติมให้อัตโนมัติในช่อง "เบอร์ติดต่อเซลล์" ตอนสร้างใบใหม่ (แก้รายใบได้เหมือนเดิม)
    defaultSalePhone: '0918086924',
    signLeftLabel: 'ผู้เสนอราคา',
    signRightLabel: 'ผู้อนุมัติ',
  },
}

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback)

// รับ settings map (คีย์→ค่า string) แล้วคืนอ็อบเจกต์เทมเพลตที่ครบทุกฟิลด์เสมอ
// ลำดับความสำคัญ: ค่าใน DOCUMENT_TEMPLATE > คีย์ COMPANY_* แบบเก่า > ค่าตั้งต้น
export function mergeDocumentTemplate(settings = {}) {
  let saved = {}
  const raw = settings[TEMPLATE_SETTING_KEY]
  if (raw) {
    // JSON เสียหายไม่ควรทำให้พิมพ์เอกสารไม่ได้ — ถอยไปใช้ค่าตั้งต้นแทน
    try { const p = JSON.parse(raw); if (p && typeof p === 'object') saved = p } catch { saved = {} }
  }

  const legacy = {}
  for (const [field, key] of Object.entries(LEGACY_COMPANY_KEYS)) {
    if (settings[key]) legacy[field] = settings[key]
  }

  const dc = TEMPLATE_DEFAULTS.company
  const sc = (saved.company && typeof saved.company === 'object') ? saved.company : {}
  const company = {
    name: str(sc.name, legacy.name ?? dc.name),
    address: str(sc.address, legacy.address ?? dc.address),
    phone: str(sc.phone, legacy.phone ?? dc.phone),
    email: str(sc.email, legacy.email ?? dc.email),
    line: str(sc.line, legacy.line ?? dc.line),
    taxId: str(sc.taxId, legacy.taxId ?? dc.taxId),
    logoUrl: str(sc.logoUrl, dc.logoUrl),
  }

  const dq = TEMPLATE_DEFAULTS.quotation
  const sq = (saved.quotation && typeof saved.quotation === 'object') ? saved.quotation : {}
  const quotation = {}
  for (const [field, def] of Object.entries(dq)) {
    if (field === 'terms') continue
    quotation[field] = str(sq[field], def)
  }
  // เงื่อนไข: array ว่าง = ตั้งใจลบทุกข้อ ต้องไม่ถอยไปใช้ค่าตั้งต้น จึงเช็ค Array.isArray ไม่ใช่เช็ค length
  quotation.terms = Array.isArray(sq.terms)
    ? sq.terms.map(t => str(t)).filter(t => t.trim() !== '')
    : dq.terms.slice()

  return { company, quotation }
}

// โลโก้ที่ใช้จริง — origin ส่งเข้ามาเพื่อให้ path แบบ /worldtech-logo.png กลายเป็น URL เต็ม
// (html2canvas ตอนสร้าง PDF และหน้าต่างพิมพ์ที่เปิดใหม่ ต่างก็ต้องการ URL เต็ม)
export function templateLogoUrl(tpl, origin = '') {
  const url = tpl?.company?.logoUrl || DEFAULT_LOGO_URL
  if (/^https?:\/\//i.test(url)) return url
  return origin ? `${origin}${url.startsWith('/') ? '' : '/'}${url}` : url
}
