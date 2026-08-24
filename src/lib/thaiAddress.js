// ===== ที่อยู่ไทย: รายชื่อจังหวัด/อำเภอ/ตำบล + รหัสไปรษณีย์ =====
// ข้อมูลจริงจากกรมการปกครอง (DOPA) — 77 จังหวัด / 928 อำเภอ / 7,537 ตำบล พร้อมรหัสไปรษณีย์
// เก็บเป็น JSON แยกไฟล์แล้วโหลดแบบ lazy ตอนเปิดฟอร์มออเดอร์ครั้งแรก (~55 KB gzip)
// ไม่รวมเข้า bundle หลักเพราะหน้าอื่นไม่ได้ใช้
//
// รูปแบบ: [ [จังหวัด, จังหวัด_EN, [ [อำเภอ, อำเภอ_EN, [ [ตำบล, ตำบล_EN, รหัสไปรษณีย์], ... ]], ... ]], ... ]
// เก็บชื่ออังกฤษไว้ด้วยเพื่อให้ส่งต่อระบบอื่น (JST / ขนส่ง / เอกสารภาษาอังกฤษ) ได้โดยไม่ต้องเดาคำทับศัพท์
// อำเภอของกรุงเทพฯ ตัด "เขต" ออกแล้ว เก็บชื่อเปล่าเหมือนจังหวัดอื่น — คำนำหน้าให้ฝั่งแสดงผลเติมเอง

let cache = null

function buildIndex(raw) {
  const provinces = []
  const byProvince = new Map()   // จังหวัด -> [[อำเภอ, อำเภอ_EN, [[ตำบล, ตำบล_EN, รหัส], ...]], ...]
  const byPostcode = new Map()   // รหัสไปรษณีย์ -> [[จังหวัด, อำเภอ, ตำบล], ...]
  const english = new Map()      // "จังหวัด" / "จังหวัด|อำเภอ" / "จังหวัด|อำเภอ|ตำบล" -> ชื่ออังกฤษ

  raw.forEach(([province, provinceEn, districts]) => {
    provinces.push(province)
    byProvince.set(province, districts)
    english.set(province, provinceEn)
    districts.forEach(([district, districtEn, subs]) => {
      english.set(`${province}|${district}`, districtEn)
      subs.forEach(([subdistrict, subdistrictEn, postcode]) => {
        english.set(`${province}|${district}|${subdistrict}`, subdistrictEn)
        if (!postcode) return
        if (!byPostcode.has(postcode)) byPostcode.set(postcode, [])
        byPostcode.get(postcode).push([province, district, subdistrict])
      })
    })
  })
  return { provinces, byProvince, byPostcode, english }
}

// โหลดครั้งเดียวแล้วใช้ซ้ำ — คืน promise เดิมถ้ามีคนเรียกซ้อน
export function loadThaiAddress() {
  if (!cache) {
    cache = import('./thaiAddressData.json')
      .then(m => buildIndex(m.default || m))
      .catch(e => { cache = null; throw e })
  }
  return cache
}

export const listProvinces = (idx) => idx?.provinces ?? []
export const listDistricts = (idx, province) =>
  (idx?.byProvince.get(province) ?? []).map(([d]) => d)
export const listSubdistricts = (idx, province, district) => {
  const row = (idx?.byProvince.get(province) ?? []).find(([d]) => d === district)
  return row ? row[2].map(([s]) => s) : []
}
export function findPostcode(idx, province, district, subdistrict) {
  const row = (idx?.byProvince.get(province) ?? []).find(([d]) => d === district)
  const sub = row?.[2].find(([s]) => s === subdistrict)
  return sub ? sub[2] : ''
}

// ชื่ออังกฤษทางการของแต่ละระดับ — ใช้ส่งต่อระบบอื่นและพิมพ์เอกสารภาษาอังกฤษ
// คืนค่าว่างถ้าชื่อไทยที่ส่งมาไม่ตรงกับข้อมูล (เช่น ที่อยู่เก่าที่พิมพ์เอง)
export function findEnglish(idx, province, district, subdistrict) {
  const get = (k) => (k && idx?.english.get(k)) || ''
  return {
    province: get(province),
    district: get(province && district ? `${province}|${district}` : ''),
    subdistrict: get(province && district && subdistrict ? `${province}|${district}|${subdistrict}` : ''),
  }
}

// กรุงเทพฯ ใช้ แขวง/เขต จังหวัดอื่นใช้ ต./อ.
export const isBangkok = (province) => String(province ?? '').includes('กรุงเทพ')

// ชื่อย่อที่คนเขียนกันจริง — ใช้ทั้งตอนจับจังหวัดและตอนลบออกจากเศษที่อยู่
const PROVINCE_ALIASES = {
  'กรุงเทพมหานคร': ['กรุงเทพมหานคร', 'กรุงเทพฯ', 'กรุงเทพ', 'กทม.', 'กทม', 'บางกอก'],
  'พระนครศรีอยุธยา': ['พระนครศรีอยุธยา', 'อยุธยา'],
  'นครราชสีมา': ['นครราชสีมา', 'โคราช'],
}
const namesFor = (province) => PROVINCE_ALIASES[province] || [province]

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const MARKERS = /(?:ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.|จ\s|sub[- ]?district|district|province|khwaeng|khet|tambon|amphoe|amphur|changwat)/gi

// เทียบชื่อแบบไม่สนตัวพิมพ์ใหญ่เล็ก เพราะที่อยู่ที่ลูกค้าส่งมาเขียนอังกฤษบ้างไทยบ้าง ปนกันก็มี
// toLowerCase ของไทย/อังกฤษยาวเท่าเดิม ตำแหน่งจึงตรงกับข้อความจริง (เช็คความยาวกันไว้อีกชั้น)
function lowerHay(text) {
  const h = text.toLowerCase()
  return h.length === text.length ? h : text
}

// เตรียมข้อความสองชุด: ชุดปกติ กับชุดที่ตัดช่องว่าง/ขีดทิ้ง พร้อมตารางแปลงตำแหน่งกลับ
// ชุดหลังไว้รับที่อยู่อังกฤษที่คนเขียนติดกัน (Chonburi) ทั้งที่ชื่อทางการเว้นวรรค (Chon Buri)
function makeHay(text) {
  const lower = lowerHay(text)
  let sq = ''
  const map = []
  for (let i = 0; i < lower.length; i++) {
    const c = lower[i]
    if (c === ' ' || c === '-') continue
    sq += c; map.push(i)
  }
  return { lower, sq, map }
}

// ชื่ออังกฤษต้องเป็นคำเต็ม ไม่งั้นตำบล "Mo" (เหมาะ) จะไปแมตช์กลางคำว่า "Moo 3"
// ภาษาไทยไม่มีตัวคั่นคำ จึงเช็คแบบนี้ไม่ได้และไม่ต้องเช็ค
const LATIN_NAME = /^[a-z][a-z\s.'-]*$/
const wordEdge = (hay, a, b) => !/[a-z]/.test(hay[a - 1] || '') && !/[a-z]/.test(hay[b] || '')

function spansOf(H, name) {
  const out = []
  const n = String(name ?? '').toLowerCase()
  if (!n) return out
  const latin = LATIN_NAME.test(n)
  let i = H.lower.indexOf(n)
  while (i >= 0) {
    if (!latin || wordEdge(H.lower, i, i + n.length)) out.push([i, i + n.length])
    i = H.lower.indexOf(n, i + 1)
  }
  if (out.length) return out
  const c = n.replace(/[\s-]/g, '')
  if (c.length < 4 || c === n) return out
  let j = H.sq.indexOf(c)
  while (j >= 0) {
    const a = H.map[j], b = H.map[j + c.length - 1] + 1
    if (!latin || wordEdge(H.lower, a, b)) out.push([a, b])
    j = H.sq.indexOf(c, j + 1)
  }
  return out
}

// รูปแบบ regex ที่ยอมให้ชื่อภาษาอังกฤษเว้นวรรคหรือไม่เว้นก็ได้ ใช้ตอนเก็บกวาดเศษที่ค้างใน line1
const looseRe = (name) => new RegExp(
  String(name).trim().split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'gi'
)

// คำนำหน้าที่บอกว่าข้อความถัดไปเป็นระดับไหน — ใช้ตัดสินตอนชื่อชนกัน
const ROLE_MARKS = {
  p: ['จังหวัด', 'จ.', 'province', 'changwat'],
  d: ['อำเภอ', 'อ.', 'เขต', 'amphoe', 'amphur', 'khet', 'district'],
  s: ['ตำบล', 'ต.', 'แขวง', 'tambon', 'khwaeng', 'subdistrict', 'sub district', 'sub-district'],
}

// +1 ถ้าคำนำหน้าตรงกับระดับที่กำลังจับ, -1 ถ้าเป็นคำนำหน้าของระดับอื่น, 0 ถ้าไม่มีคำนำหน้า
// จำเป็นเพราะ "อ.เมือง" ในจังหวัดเลยตรงกับทั้งอำเภอเมืองเลยและตำบลชื่อ "เมือง" คำนำหน้าเป็นตัวชี้ขาด
function markScore(hay, role, span) {
  const before = hay.slice(Math.max(0, span[0] - 14), span[0]).replace(/\s+$/, '')
  let owner = null, longest = 0
  for (const r of Object.keys(ROLE_MARKS)) {
    for (const m of ROLE_MARKS[r]) {
      if (m.length > longest && before.endsWith(m)) { owner = r; longest = m.length }
    }
  }
  if (!owner) return 0
  return owner === role ? 1 : -1
}

const THAI_CH = /[ก-๙]/
const LATIN_CH = /[a-z]/

// ชื่อสำรองอย่าง "เมือง"/"Mueang" สั้นและไปโผล่ในชื่อตำบลได้ง่าย (ในเมือง / Nai Mueang / Mueang Mi)
// จึงรับเฉพาะตอนที่มีคำนำหน้าระดับตัวเองกำกับ หรือยืนเดี่ยวจริงๆ ไม่มีคำอื่นติดกัน
function aliasOk(hay, role, sp) {
  if (markScore(hay, role, sp) > 0) return true
  const before = hay.slice(0, sp[0]), after = hay.slice(sp[1])
  if (THAI_CH.test(before.slice(-1)) || THAI_CH.test(after.slice(0, 1))) return false
  return !LATIN_CH.test(before.replace(/ $/, '').slice(-1)) && !LATIN_CH.test(after.replace(/^ /, '').slice(0, 1))
}

// จองช่วงข้อความให้แต่ละส่วน (จังหวัด/อำเภอ/ตำบล) โดยห้ามทับกัน ชื่อยาวได้จองก่อน
// จำเป็นเพราะชื่ออำเภอมักซ้อนอยู่ในชื่อตำบล เช่น "เกาะลันตา" อยู่ใน "เกาะลันตาใหญ่"
// และตำบลกับอำเภออาจชื่อเดียวกัน เช่น แขวงคลองเตย/เขตคลองเตย หรือ Thung Khru ทั้งเขตและแขวง ซึ่งต้องกินคนละช่วง
// ชื่อเดียวกันที่โผล่หลายที่ ให้เลือกช่วงที่คำนำหน้าตรงระดับก่อน
const DEPTH = { s: 0, d: 1, p: 2 }

// เทียบคะแนนแบบเรียงลำดับความสำคัญ ตัวแรกต่างกันก็ตัดสินเลย
const cmpRank = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0 }

function placeParts(H, roles) {
  // ชื่อยาวได้จองก่อน ถ้ายาวเท่ากันให้ระดับเล็กจองก่อน เพราะที่อยู่ไทยเขียนเล็กไปใหญ่
  // (จังหวัดชัยนาทกับตำบลชัยนาทชื่อเท่ากัน ตัวซ้ายคือตำบลเสมอ)
  const order = [...roles.keys()].sort((a, b) => {
    const la = Math.max(...roles[a][1].map(n => n.length))
    const lb = Math.max(...roles[b][1].map(n => n.length))
    return lb !== la ? lb - la : DEPTH[roles[a][0]] - DEPTH[roles[b][0]]
  })
  const used = []
  const got = {}
  let marks = 0
  for (const i of order) {
    const [role, names, aliases] = roles[i]
    // จังหวัดชื่อซ้ำได้ในชื่ออำเภอ (Bangkok ใน "Bangkok Noi") ตัวจริงจึงเป็นตัวขวาสุด
    const preferLast = role === 'p'
    let hit = null
    for (const n of [...names].filter(Boolean).sort((a, b) => b.length - a.length)) {
      const isAlias = aliases ? aliases.includes(n) : false
      let cand = null
      for (const sp of spansOf(H, n)) {
        if (!used.every(([u, v]) => sp[1] <= u || sp[0] >= v)) continue
        if (isAlias && !aliasOk(H.lower, role, sp)) continue
        const sc = markScore(H.lower, role, sp)
        if (!cand || sc > cand.sc || (sc === cand.sc && preferLast && sp[0] > cand.sp[0])) cand = { sp, sc }
      }
      // ชื่อเรียงจากยาวไปสั้นแล้ว ชื่อสั้นกว่าจะแทนที่ได้ก็ต่อเมื่อคำนำหน้าตรงระดับกว่าเท่านั้น
      // ไม่งั้นชื่อย่อ "อยุธยา" จะไปแย่งช่วงของ "พระนครศรีอยุธยา" แล้วเหลือ "พระนครศรี" ค้างไว้
      if (cand && (!hit || cand.sc > hit.sc)) hit = cand
      if (hit && hit.sc > 0) break
    }
    if (hit) { used.push(hit.sp); got[role] = hit.sp; marks += hit.sc }
  }
  return { got, used, marks }
}

// เบอร์โทรที่ปนมาในที่อยู่ — มือถือ 10 หลักขึ้นต้น 0 / เบอร์บ้าน 9 หลัก / +66
// ยอมให้มี - . หรือเว้นวรรคคั่นระหว่างตัวเลขได้ แต่ต้องไม่ติดกับตัวเลขอื่น (กันไปกินบ้านเลขที่กับรหัสไปรษณีย์)
const PHONE_RE = /(?:\+66[-.\s]?|0)(?:[-.\s]?\d){8,9}/g
const PHONE_HINT = /(?:โทร|เบอร์|มือถือ|tel|phone|mobile)[\s:.]*$/i

function grabPhone(text) {
  let pick = null
  for (const m of text.matchAll(PHONE_RE)) {
    const a = m.index, b = a + m[0].length
    if (/\d/.test(text[a - 1] || '') || /\d/.test(text[b] || '')) continue
    let digits = m[0].replace(/\D/g, '')
    if (m[0].trim().startsWith('+66')) digits = '0' + digits.slice(2)
    if (!/^0\d{8,9}$/.test(digits)) continue
    const hinted = PHONE_HINT.test(text.slice(Math.max(0, a - 12), a))
    // มีคำนำหน้าว่า "โทร" ชนะทันที ไม่มีก็เอาชุดท้ายสุด เพราะเบอร์มักอยู่ท้ายที่อยู่
    if (!pick || hinted || !pick.hinted) pick = { a, b, digits, hinted }
    if (hinted) break
  }
  if (!pick) return { phone: '', rest: text }
  let rest = text.slice(0, pick.a) + ' ' + text.slice(pick.b)
  rest = rest.replace(/(?:โทร|เบอร์โทร|เบอร์|มือถือ|tel|phone|mobile)[\s:.]*(?=\s|$)/gi, ' ')
  return { phone: pick.digits, rest: squash(rest) }
}

// ชื่อผู้รับ — เอาเฉพาะที่มั่นใจ: มีคำนำหน้า (คุณ/นาย/ผู้รับ/Attn) หรือเป็นข้อความล้วนหน้าสุดก่อนถึงตัวเลขแรก
// กรณีหลังจะทำต่อเมื่อแยกที่อยู่ได้จริงแล้วเท่านั้น และต้องไม่มีคำที่บอกว่าเป็นส่วนของที่อยู่
// 1) มีคำนำหน้าชื่อ (คุณ/นาย/K.) — กินคำว่า "ติดต่อ/ผู้รับ" ที่นำหน้าอยู่ไปด้วย จะได้ไม่ค้างใน line1
const NAME_TITLE = /(?:^|[\s,(])(?:(?:ชื่อผู้รับ|ผู้รับ|ผู้ติดต่อ|ติดต่อ)[\s:.]*)?(?:คุณ|นางสาว|น\.ส\.|นาง|นาย|khun|k\.)[\s:.]*([^\d,()\n]{2,40})/i
// 2) ไม่มีคำนำหน้า แต่มีป้ายบอกว่าเป็นชื่อผู้รับ
const NAME_LABEL = /(?:^|[\s,(])(?:ชื่อผู้รับ|ผู้รับ|ผู้ติดต่อ|attn)[\s:.]*([^\d,()\n]{2,40})/i
// คำที่บอกว่าข้อความท่อนนั้นเป็นส่วนของที่อยู่หรือข้อมูลบริษัท ไม่ใช่ชื่อคน — กันเดาผิดตอนไม่มีคำนำหน้า
const ADDRESS_WORD = /(?:ถนน|ถ\.|ซอย|ซ\.|หมู่บ้าน|หมู่|ม\.|เลขที่|เลขประจำตัว|ภาษี|ที่อยู่|จัดส่ง|ส่งของ|อาคาร|ตึก|ชั้น|ห้อง|แขวง|เขต|ตำบล|อำเภอ|จังหวัด|soi|road|floor|room|building|address|tax)/i

function grabName(text, allowLeading) {
  for (const re of [NAME_TITLE, NAME_LABEL]) {
    const m = text.match(re)
    if (!m) continue
    const name = squash(m[1])
    if (name.length >= 2) return { name, rest: squash(text.replace(m[0], ' ')) }
  }
  if (!allowLeading) return { name: '', rest: text }
  const lead = text.match(/^([^\d,()\n]{3,40}?)\s+(?=\d)/)
  if (lead && !ADDRESS_WORD.test(lead[1])) {
    return { name: squash(lead[1]), rest: squash(text.slice(lead[0].length)) }
  }
  return { name: '', rest: text }
}

/**
 * แยกที่อยู่ก้อนเดียวออกเป็นช่อง โดยเทียบกับรายชื่อจริงของกรมการปกครอง
 * รองรับทั้งชื่อไทยและชื่ออังกฤษทางการ (เช่น "Bang Mot Thung Khru Bangkok 10140")
 * จังหวัด/อำเภอ/ตำบล ที่คืนกลับมาผ่านการยืนยันกับข้อมูลจริงแล้วทั้งหมด
 * line1 คือเศษที่เหลือหลังตัดทุกอย่างออก (บ้านเลขที่ หมู่ ถนน อาคาร)
 * phone/name ดึงเพิ่มให้ถ้ามีปนมาในก้อนเดียวกัน — ว่างได้ถ้าไม่มั่นใจ
 * unmatched บอกว่าอะไรหาไม่เจอ เพื่อให้หน้าจอชี้ให้คนกรอกเลือกเอง
 */
export function parseThaiAddress(raw, idx) {
  const blank = { line1: '', subdistrict: '', district: '', province: '', postcode: '', phone: '', name: '', unmatched: [] }
  let text = squash(String(raw ?? '').replace(/\n/g, ' '))
  if (!text) return blank
  if (!idx) return { ...blank, line1: text, unmatched: ['จังหวัด', 'อำเภอ/เขต', 'ตำบล/แขวง'] }

  // 1) รหัสไปรษณีย์ = เลข 5 หลักชุดท้ายสุดที่มีอยู่จริง — เป็นตัวจำกัดขอบเขตที่แม่นที่สุด
  let pcMatch = null
  for (const m of text.matchAll(/\d+/g)) if (m[0].length === 5) pcMatch = m
  let postcode = ''
  if (pcMatch && idx.byPostcode.has(pcMatch[0])) {
    postcode = pcMatch[0]
    text = squash(text.slice(0, pcMatch.index) + ' ' + text.slice(pcMatch.index + postcode.length))
  }

  // 2) เบอร์โทร — ตัดออกก่อนหาชื่อสถานที่ ไม่งั้นตัวเลขจะไปค้างใน line1
  const ph = grabPhone(text)
  text = ph.rest

  const enOf = (...k) => idx.english.get(k.join('|')) || ''
  // คนเขียน "อ.เมือง" กันทั้งประเทศ ทั้งที่ชื่อจริงมีชื่อจังหวัดต่อท้าย (เมืองขอนแก่น)
  // ใส่ไว้เป็นชื่อสำรองท้ายสุด ชื่อเต็มจึงยังได้จองก่อนเสมอ และคำนำหน้า "อ./อำเภอ" เป็นตัวยืนยัน
  const districtAliases = (p, d) => {
    const en = enOf(p, d)
    const out = []
    if (/^เมือง./.test(d)) out.push('เมือง')
    if (/^mueang\s/i.test(en)) out.push('Mueang')
    return out
  }

  // 3) ชุดผู้สมัคร — มีรหัสไปรษณีย์ก็เหลือไม่กี่ตัว ไม่มีก็ไล่จากจังหวัดที่ชื่อ (ไทยหรืออังกฤษ) โผล่ในข้อความ
  const H = makeHay(text)
  let triples
  if (postcode) {
    triples = idx.byPostcode.get(postcode)
  } else {
    const provs = idx.provinces.filter(p =>
      [...namesFor(p), enOf(p)].some(n => spansOf(H, n).length > 0)
    )
    triples = []
    for (const p of provs) {
      for (const [d, , subs] of idx.byProvince.get(p)) {
        for (const [s] of subs) triples.push([p, d, s])
      }
    }
  }

  // 4) เลือกชุดที่แมตช์ได้มากที่สุด (จำนวนส่วนที่เจอก่อน แล้วค่อยดูความยาวรวม)
  let best = null
  for (const [p, d, s] of triples) {
    const { got, used, marks } = placeParts(H, [
      ['p', [...namesFor(p), enOf(p)]],
      ['d', [d, enOf(p, d), ...districtAliases(p, d)], districtAliases(p, d)],
      ['s', [s, enOf(p, d, s)]],
    ])
    const hits = Object.keys(got).length
    const chars = used.reduce((n, [a, b]) => n + (b - a), 0)
    // เจอตำบลมีค่ากว่าเจอจังหวัด เพราะจังหวัด/อำเภอเดาจากรหัสไปรษณีย์ได้อยู่แล้ว แต่ตำบลเดาไม่ได้
    const depth = (got.s ? 4 : 0) + (got.d ? 2 : 0) + (got.p ? 1 : 0)
    // เรียงตาม จำนวนส่วนที่เจอ -> คำนำหน้าตรงระดับ -> ระดับที่เจอ -> ความยาวรวมที่แมตช์
    const rank = [hits, marks, depth, chars]
    if (!best || cmpRank(rank, best.rank) > 0) best = { rank, p, d, s, got, used }
  }

  if (!best) {
    const noPlace = squash(text.replace(MARKERS, ' ')).replace(/^[,\s]+|[,\s]+$/g, '')
    const nm = grabName(noPlace, false)
    return { ...blank, postcode, phone: ph.phone, name: nm.name, line1: nm.rest, unmatched: ['จังหวัด', 'อำเภอ/เขต', 'ตำบล/แขวง'] }
  }

  // ตัดเฉพาะช่วงที่แมตช์จริงออก แล้วเก็บกวาดคำนำหน้าที่ค้าง
  let rest = text
  for (const [a, b] of [...best.used].sort((x, y) => y[0] - x[0])) rest = rest.slice(0, a) + ' ' + rest.slice(b)

  const province = (best.got.p || postcode) ? best.p : ''
  const district = (best.got.d || postcode) ? best.d : ''
  const subdistrict = best.got.s ? best.s : ''

  let line1 = squash(rest.replace(MARKERS, ' '))
  // "อ.เมือง" เป็นวิธีเขียนปกติของอำเภอเมือง ชื่อจริงมีชื่อจังหวัดต่อท้าย (เมืองขอนแก่น) จับไม่ติด
  // จังหวัด/รหัสไปรษณีย์บอกอำเภอได้อยู่แล้ว จึงเก็บกวาดคำว่า "เมือง" ที่ค้างทิ้ง — เฉพาะที่ยืนเดี่ยว
  // ไม่แตะคำที่มีตัวอักษรไทยติดกัน อย่าง "หมู่บ้านกลางเมือง" ที่เป็นส่วนหนึ่งของที่อยู่จริง
  if (/^เมือง./.test(district)) line1 = line1.replace(/(^|[^ก-๙])เมือง(?![ก-๙])/g, '$1 ')
  if (/^mueang\s/i.test(enOf(province, district))) line1 = line1.replace(/\bmueang\b/gi, ' ')
  line1 = squash(line1).replace(/^(?:ที่อยู่จัดส่ง|ที่อยู่|จัดส่งที่|address|ship\s*to)[\s:.]*/i, '')
  // ชื่อย่อจังหวัดอาจค้างอยู่ (เช่น "กทม." ตอนที่จังหวัดมาจากรหัสไปรษณีย์ ไม่ได้มาจากการแมตช์ชื่อ)
  if (province) {
    for (const n of [...namesFor(province), enOf(province)].filter(Boolean).sort((a, b) => b.length - a.length)) {
      line1 = line1.replace(looseRe(n), ' ')
    }
    line1 = squash(line1)
  }
  // คอมมาที่ค้างติดกันเพราะเพิ่งตัดชื่อตำบล/อำเภอออกไป — ยุบให้เหลือตัวเดียว
  line1 = squash(line1.replace(/,(?:\s*,)+/g, ',')).replace(/^[,.\s-]+|[,.\s-]+$/g, '')

  // ชื่อผู้รับ: ยอมเดาจากข้อความหน้าสุดได้ ก็ต่อเมื่อจับจังหวัดได้แล้วจริงๆ (แปลว่าเป็นที่อยู่เต็มก้อน)
  const nm = grabName(line1, Boolean(province))

  const unmatched = []
  if (!province) unmatched.push('จังหวัด')
  if (!district) unmatched.push('อำเภอ/เขต')
  if (!subdistrict) unmatched.push('ตำบล/แขวง')

  return {
    line1: nm.rest.replace(/^[,.\s-]+|[,.\s-]+$/g, ''),
    subdistrict, district, province,
    postcode: postcode || findPostcode(idx, province, district, subdistrict),
    phone: ph.phone,
    name: nm.name,
    unmatched,
  }
}
