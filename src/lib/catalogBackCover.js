// ค่ากลางของ "ปกหลัง" — ใช้ร่วมกันสามที่: หน้าลูกค้า, หน้าตั้งค่าในหลังบ้าน และ Netlify Function
// ที่ต้องอยู่ไฟล์เดียวเพราะถ้าแยกกันแล้วค่า default ไม่ตรง พรีวิวจะไม่เหมือนของจริง
//
// เก็บทั้งก้อนเป็น JSON ก้อนเดียว ไม่แตกเป็น setting ทีละคีย์
// เพราะต้องเก็บสองที่: ค่ากลางใน settings และค่าเฉพาะเล่มใน catalogs.back_cover
// ก้อนเดียวทำให้ "ทับทั้งชุด" ได้ตรงไปตรงมา ไม่ต้องมานั่งไล่ว่าคีย์ไหนทับคีย์ไหน

export const BACKCOVER_SETTING_KEY = 'catalog_backcover'

// ชุดหน้าตาที่ออกแบบไว้ให้แล้ว — ไม่ให้เลือกสีเอง แต่ให้เลือก "อารมณ์"
// ทุกชุดคุมคู่สีพื้น/ตัวอักษร/ปุ่มมาด้วยกัน จึงไม่มีทางเลือกจนอ่านไม่ออก
export const THEMES = {
  light: { label: 'ขาวสะอาด',   bg: '#FFFFFF', fg: '#15233B', sub: '#6B7688', btn: '#1B76FF', btnFg: '#FFFFFF', fld: '#FBFCFD', fldBd: '#DDE3EB', link: '#1B76FF' },
  soft:  { label: 'เทาอ่อน',    bg: '#F3F6FA', fg: '#15233B', sub: '#66707F', btn: '#1B76FF', btnFg: '#FFFFFF', fld: '#FFFFFF', fldBd: '#D8DFE9', link: '#1B76FF' },
  navy:  { label: 'น้ำเงินเข้ม', dark: true, bg: '#15233B', fg: '#FFFFFF', sub: '#A9B6CC', btn: '#FFDD42', btnFg: '#15233B', fld: '#1F3050', fldBd: '#33456A', link: '#FFDD42' },
  sun:   { label: 'เหลืองสด',   bg: '#FFDD42', fg: '#15233B', sub: '#6B5E28', btn: '#15233B', btnFg: '#FFFFFF', fld: '#FFFFFF', fldBd: '#E0C63B', link: '#15233B' },
  warm:  { label: 'ส้มอบอุ่น',   bg: '#FFF4EE', fg: '#3A1E10', sub: '#8A6653', btn: '#F9631F', btnFg: '#FFFFFF', fld: '#FFFFFF', fldBd: '#F0D6C6', link: '#D2500F' },
}

export const LOGO_SIZES = { off: 0, sm: 32, md: 48, lg: 72 }
export const LOGO_LABELS = { off: 'ไม่มีโลโก้', sm: 'เล็ก', md: 'กลาง', lg: 'ใหญ่' }
export const ALIGN_LABELS = { center: 'จัดกลาง', left: 'ชิดซ้าย' }
export const ORDER_LABELS = { form: 'ฟอร์มก่อน แล้วค่อยลิงก์', link: 'ลิงก์ติดต่อก่อน แล้วค่อยฟอร์ม' }

export const BACKCOVER_DEFAULTS = {
  enabled: true,
  // หน้าตา
  theme: 'light',
  align: 'center',
  order: 'form',
  logo: 'md',
  // ข้อความที่ลูกค้าเห็น — แก้ได้ทุกคำ ให้เข้ากับโทนของแต่ละเล่ม
  heading: 'สนใจรุ่นไหน ให้ทีมขายติดต่อกลับได้เลย',
  note: 'กรอกชื่อกับเบอร์ไว้ ทีมขายติดต่อกลับในเวลาทำการ',
  button: 'ให้ทีมขายติดต่อกลับ',
  phName: 'ชื่อผู้ติดต่อ',
  phPhone: 'เบอร์โทร',
  phInterest: 'สนใจสินค้าอะไร (ไม่ใส่ก็ได้)',
  showInterest: true,
  // ปุ่ม/ลิงก์รอง — ใส่ลิงก์แล้วกดปุ๊บเด้งไปหน้า LINE เลย
  line: '',
  lineText: 'หรือทักแชท LINE ทันที',
  phone: '',
  phoneText: 'โทร',
  // หน้าขอบคุณหลังกดส่ง
  doneTitle: 'ได้รับข้อมูลแล้ว',
  doneText: 'ทีมขายจะติดต่อกลับที่เบอร์ที่ให้ไว้ในเวลาทำการ',
}

// ข้อความว่างให้ตกกลับไปใช้ค่า default เสมอ — ปกหลังที่ไม่มีข้อความเลยคือหน้าเปล่า
const TEXT_KEYS = ['heading', 'button', 'phName', 'phPhone', 'phInterest', 'doneTitle']

export function mergeBackCover(raw) {
  const src = (raw && typeof raw === 'object') ? raw : {}
  const out = { ...BACKCOVER_DEFAULTS, ...src }
  TEXT_KEYS.forEach(k => { if (!String(out[k] ?? '').trim()) out[k] = BACKCOVER_DEFAULTS[k] })
  if (!THEMES[out.theme]) out.theme = BACKCOVER_DEFAULTS.theme
  if (!(out.logo in LOGO_SIZES)) out.logo = BACKCOVER_DEFAULTS.logo
  if (out.align !== 'left') out.align = 'center'
  if (out.order !== 'link') out.order = 'form'
  out.enabled = out.enabled !== false
  out.showInterest = out.showInterest !== false
  return out
}

export function parseBackCover(text) {
  if (!text) return null
  try { return mergeBackCover(JSON.parse(text)) } catch { return null }
}

// ลิงก์ LINE: รับได้ทั้งลิงก์เต็มที่ก๊อปจากแอป และไอดีเปล่าที่คนพิมพ์เอง
// กดแล้วต้องเด้งไปหน้า LINE ได้ทั้งสองแบบ ไม่ใช่บังคับให้จำรูปแบบเดียว
export function lineHref(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (v.startsWith('@')) return `https://line.me/R/ti/p/${encodeURIComponent(v)}`
  return `https://line.me/ti/p/~${encodeURIComponent(v)}`
}
