// โครงข้อมูลของ "ปกหลัง" — ใช้ร่วมกันสามที่: หน้าลูกค้า, หน้าตั้งค่าในระบบ และ Netlify Function
// ต้องอยู่ไฟล์เดียวกัน มิฉะนั้นค่าเริ่มต้นจะไม่ตรงกัน และตัวอย่างจะแสดงไม่เหมือนหน้าจริง
//
// ปกหลังคือ "ลำดับของบล็อก" ไม่ใช่ฟอร์มตายตัว ผู้ออกแบบสลับลำดับ ซ่อน หรือเพิ่มบล็อกได้เอง
// แต่ชนิดของบล็อกมีจำกัด จึงจัดหน้าได้อิสระโดยไม่มีทางได้หน้าที่โครงสร้างพัง
//
// ข้อจำกัดเดียวที่บังคับไว้: ต้องมีช่องชื่อและช่องเบอร์โทรอย่างละหนึ่ง
// เพราะข้อมูลต้องไหลเข้าตาราง "ผู้ติดต่อ" ต่อได้ ถ้าไม่มีสองช่องนี้ ลีดจะสร้างไม่ได้

export const BACKCOVER_SETTING_KEY = 'catalog_backcover'

// ชุดสีสำเร็จรูป — กดแล้วเติมค่าลงช่องสีทั้งหมดในคราวเดียว
// ยังแก้ทีละสีต่อได้ ชุดสีเป็นจุดตั้งต้นที่จับคู่มาแล้ว ไม่ใช่กรอบบังคับ
export const PRESETS = {
  light: { label: 'ขาวสะอาด',    colors: { bg: '#FFFFFF', fg: '#15233B', sub: '#6B7688', btn: '#1B76FF', btnFg: '#FFFFFF', fld: '#FBFCFD', fldBd: '#DDE3EB', link: '#1B76FF' } },
  soft:  { label: 'เทาอ่อน',      colors: { bg: '#F3F6FA', fg: '#15233B', sub: '#66707F', btn: '#1B76FF', btnFg: '#FFFFFF', fld: '#FFFFFF', fldBd: '#D8DFE9', link: '#1B76FF' } },
  navy:  { label: 'น้ำเงินเข้ม',  colors: { bg: '#15233B', fg: '#FFFFFF', sub: '#A9B6CC', btn: '#FFDD42', btnFg: '#15233B', fld: '#1F3050', fldBd: '#33456A', link: '#FFDD42' } },
  sun:   { label: 'เหลืองสด',     colors: { bg: '#FFDD42', fg: '#15233B', sub: '#6B5E28', btn: '#15233B', btnFg: '#FFFFFF', fld: '#FFFFFF', fldBd: '#E0C63B', link: '#15233B' } },
  warm:  { label: 'ส้มอบอุ่น',    colors: { bg: '#FFF4EE', fg: '#3A1E10', sub: '#8A6653', btn: '#F9631F', btnFg: '#FFFFFF', fld: '#FFFFFF', fldBd: '#F0D6C6', link: '#D2500F' } },
}

export const COLOR_FIELDS = [
  ['bg', 'พื้นหลัง'], ['fg', 'ตัวอักษรหลัก'], ['sub', 'ตัวอักษรรอง'],
  ['btn', 'พื้นปุ่ม'], ['btnFg', 'ตัวอักษรบนปุ่ม'],
  ['fld', 'พื้นช่องกรอก'], ['fldBd', 'เส้นขอบช่องกรอก'], ['link', 'ลิงก์'],
]

export const ALIGN_LABELS = { left: 'ชิดซ้าย', center: 'กึ่งกลาง', right: 'ชิดขวา' }

export const BLOCK_LABELS = {
  logo: 'โลโก้', text: 'ข้อความ', field: 'ช่องกรอกข้อมูล',
  submit: 'ปุ่มส่งข้อมูล', line: 'ลิงก์ LINE', phone: 'หมายเลขโทรศัพท์',
}

export const TEXT_STYLES = { heading: 'ข้อความหลัก', body: 'ข้อความรอง' }

export const LOGO_MIN = 20
export const LOGO_MAX = 160

// ค่าเริ่มต้น — ใช้ภาษาทางการ เพราะเป็นข้อความที่ลูกค้าภายนอกเห็น
const defaultBlocks = () => ([
  { id: 'b-logo',   type: 'logo',   visible: true, src: '', size: 48 },
  { id: 'b-head',   type: 'text',   visible: true, style: 'heading', text: 'สนใจสินค้า กรุณาฝากข้อมูลเพื่อให้ทีมขายติดต่อกลับ' },
  { id: 'b-sub',    type: 'text',   visible: true, style: 'body',    text: 'ทีมขายจะติดต่อกลับภายในเวลาทำการ' },
  { id: 'b-name',   type: 'field',  visible: true, role: 'name',  label: 'ชื่อ-นามสกุล' },
  { id: 'b-phone',  type: 'field',  visible: true, role: 'phone', label: 'หมายเลขโทรศัพท์' },
  { id: 'b-want',   type: 'field',  visible: true, role: 'extra', label: 'สินค้าที่สนใจ (ไม่บังคับ)' },
  { id: 'b-submit', type: 'submit', visible: true, label: 'ส่งข้อมูลให้ทีมขาย' },
  { id: 'b-line',   type: 'line',   visible: true, url: '', text: 'ติดต่อผ่าน LINE' },
  { id: 'b-tel',    type: 'phone',  visible: true, number: '', text: 'โทร' },
])

export const BACKCOVER_DEFAULTS = {
  enabled: true,
  align: 'center',
  colors: { ...PRESETS.light.colors },
  blocks: defaultBlocks(),
  done: {
    title: 'ได้รับข้อมูลเรียบร้อยแล้ว',
    text: 'ทีมขายจะติดต่อกลับตามหมายเลขที่ท่านให้ไว้ภายในเวลาทำการ',
  },
}

let seq = 0
export const newBlockId = () => `b-${Date.now().toString(36)}-${(seq++).toString(36)}`

export function newBlock(type) {
  const id = newBlockId()
  if (type === 'text')  return { id, type, visible: true, style: 'body', text: '' }
  if (type === 'field') return { id, type, visible: true, role: 'extra', label: '' }
  if (type === 'line')  return { id, type, visible: true, url: '', text: 'ติดต่อผ่าน LINE' }
  if (type === 'phone') return { id, type, visible: true, number: '', text: 'โทร' }
  if (type === 'logo')  return { id, type, visible: true, src: '', size: 48 }
  return { id, type: 'submit', visible: true, label: 'ส่งข้อมูล' }
}

const clampSize = (n) => Math.min(LOGO_MAX, Math.max(LOGO_MIN, Math.round(Number(n) || 48)))

// รูปแบบเดิมเก็บเป็นช่องแยก (heading/note/button/...) ไม่ใช่ลำดับบล็อก
// แปลงให้อัตโนมัติ เพื่อไม่ให้ข้อความและลิงก์ที่ทีมกรอกไว้แล้วหายไปตอนอัปเดตระบบ
function fromLegacy(o) {
  const blocks = []
  const add = (b) => blocks.push({ ...b, id: newBlockId() })
  if (o.logo !== 'off') add({ type: 'logo', visible: true, src: '', size: { sm: 32, md: 48, lg: 72 }[o.logo] || 48 })
  if (o.heading) add({ type: 'text', visible: true, style: 'heading', text: o.heading })
  if (o.note)    add({ type: 'text', visible: true, style: 'body', text: o.note })
  add({ type: 'field', visible: true, role: 'name',  label: o.phName || 'ชื่อ-นามสกุล' })
  add({ type: 'field', visible: true, role: 'phone', label: o.phPhone || 'หมายเลขโทรศัพท์' })
  if (o.showInterest !== false) add({ type: 'field', visible: true, role: 'extra', label: o.phInterest || 'สินค้าที่สนใจ (ไม่บังคับ)' })
  const submit = { type: 'submit', visible: true, label: o.button || 'ส่งข้อมูลให้ทีมขาย' }
  const line = { type: 'line', visible: true, url: o.line || '', text: o.lineText || 'ติดต่อผ่าน LINE' }
  const tel  = { type: 'phone', visible: true, number: o.phone || '', text: o.phoneText || 'โทร' }
  // ของเดิมมีตัวเลือกว่าจะเอาลิงก์ขึ้นก่อนฟอร์มหรือไม่ — คงลำดับที่เคยตั้งไว้
  if (o.order === 'link') { add(line); add(tel); add(submit) } else { add(submit); add(line); add(tel) }

  return {
    enabled: o.enabled !== false,
    align: o.align === 'left' ? 'left' : 'center',
    colors: { ...(PRESETS[o.theme]?.colors || PRESETS.light.colors) },
    blocks,
    done: {
      title: o.doneTitle || BACKCOVER_DEFAULTS.done.title,
      text: o.doneText || BACKCOVER_DEFAULTS.done.text,
    },
  }
}

function cleanBlock(b) {
  if (!b || !BLOCK_LABELS[b.type]) return null
  const base = { id: b.id || newBlockId(), type: b.type, visible: b.visible !== false }
  if (b.type === 'logo')   return { ...base, src: String(b.src || ''), size: clampSize(b.size) }
  if (b.type === 'text')   return { ...base, style: b.style === 'heading' ? 'heading' : 'body', text: String(b.text ?? '') }
  if (b.type === 'field')  return { ...base, role: ['name', 'phone', 'extra'].includes(b.role) ? b.role : 'extra', label: String(b.label ?? '') }
  if (b.type === 'submit') return { ...base, label: String(b.label || 'ส่งข้อมูล') }
  if (b.type === 'line')   return { ...base, url: String(b.url || ''), text: String(b.text || 'ติดต่อผ่าน LINE') }
  return { ...base, number: String(b.number || ''), text: String(b.text ?? 'โทร') }
}

export function mergeBackCover(raw) {
  let src = (raw && typeof raw === 'object') ? raw : {}
  if (!Array.isArray(src.blocks)) src = fromLegacy(src)   // ของเก่าหรือของว่าง

  const blocks = src.blocks.map(cleanBlock).filter(Boolean)

  // ต้องมีช่องชื่อและช่องเบอร์เสมอ ไม่งั้นส่งลีดเข้าระบบไม่ได้
  if (!blocks.some(b => b.type === 'field' && b.role === 'name')) {
    blocks.unshift({ id: newBlockId(), type: 'field', visible: true, role: 'name', label: 'ชื่อ-นามสกุล' })
  }
  if (!blocks.some(b => b.type === 'field' && b.role === 'phone')) {
    const i = blocks.findIndex(b => b.type === 'field' && b.role === 'name')
    blocks.splice(i + 1, 0, { id: newBlockId(), type: 'field', visible: true, role: 'phone', label: 'หมายเลขโทรศัพท์' })
  }
  if (!blocks.some(b => b.type === 'submit')) {
    blocks.push({ id: newBlockId(), type: 'submit', visible: true, label: 'ส่งข้อมูลให้ทีมขาย' })
  }

  return {
    enabled: src.enabled !== false,
    align: ['left', 'center', 'right'].includes(src.align) ? src.align : 'center',
    colors: { ...BACKCOVER_DEFAULTS.colors, ...(src.colors || {}) },
    blocks,
    done: {
      title: String(src.done?.title || BACKCOVER_DEFAULTS.done.title),
      text: String(src.done?.text ?? BACKCOVER_DEFAULTS.done.text),
    },
  }
}

export function parseBackCover(text) {
  if (!text) return null
  try { return mergeBackCover(JSON.parse(text)) } catch { return null }
}

// ลิงก์ LINE รับได้ทั้งลิงก์เต็มที่คัดลอกจากแอปพลิเคชัน และไอดีที่พิมพ์เอง
// เพื่อให้กดแล้วเปิดหน้า LINE ได้ทั้งสองรูปแบบ ไม่ต้องจำรูปแบบใดรูปแบบหนึ่ง
export function lineHref(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (v.startsWith('@')) return `https://line.me/R/ti/p/${encodeURIComponent(v)}`
  return `https://line.me/ti/p/~${encodeURIComponent(v)}`
}

// ความสว่างของสีพื้น ใช้ตัดสินว่าต้องรองพื้นขาวให้โลโก้หรือไม่
// ตัวอักษรในไฟล์โลโก้เป็นสีเข้ม วางบนพื้นเข้มแล้วมองไม่เห็น
export function isDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''))
  if (!m) return false
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140
}
