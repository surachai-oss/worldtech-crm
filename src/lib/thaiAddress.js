// ===== ที่อยู่ไทย: รายชื่อจังหวัด/อำเภอ/ตำบล + รหัสไปรษณีย์ =====
// ข้อมูลจริงจากกรมการปกครอง (DOPA) — 77 จังหวัด / 928 อำเภอ / 7,537 ตำบล พร้อมรหัสไปรษณีย์
// เก็บเป็น JSON แยกไฟล์แล้วโหลดแบบ lazy ตอนเปิดฟอร์มออเดอร์ครั้งแรก (~55 KB gzip)
// ไม่รวมเข้า bundle หลักเพราะหน้าอื่นไม่ได้ใช้
//
// รูปแบบ: [ [จังหวัด, [ [อำเภอ, [ [ตำบล, รหัสไปรษณีย์], ... ]], ... ]], ... ]
// อำเภอของกรุงเทพฯ ตัด "เขต" ออกแล้ว เก็บชื่อเปล่าเหมือนจังหวัดอื่น — คำนำหน้าให้ฝั่งแสดงผลเติมเอง

let cache = null

function buildIndex(raw) {
  const provinces = []
  const byProvince = new Map()   // จังหวัด -> [[อำเภอ, [[ตำบล, รหัส], ...]], ...]
  const byPostcode = new Map()   // รหัสไปรษณีย์ -> [[จังหวัด, อำเภอ, ตำบล], ...]

  raw.forEach(([province, districts]) => {
    provinces.push(province)
    byProvince.set(province, districts)
    districts.forEach(([district, subs]) => {
      subs.forEach(([subdistrict, postcode]) => {
        if (!postcode) return
        if (!byPostcode.has(postcode)) byPostcode.set(postcode, [])
        byPostcode.get(postcode).push([province, district, subdistrict])
      })
    })
  })
  return { provinces, byProvince, byPostcode }
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
  return row ? row[1].map(([s]) => s) : []
}
export function findPostcode(idx, province, district, subdistrict) {
  const row = (idx?.byProvince.get(province) ?? []).find(([d]) => d === district)
  const sub = row?.[1].find(([s]) => s === subdistrict)
  return sub ? sub[1] : ''
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
const MARKERS = /(?:ตำบล|ต\.|แขวง|อำเภอ|อ\.|เขต|จังหวัด|จ\.)/g

function spansOf(text, name) {
  const out = []
  let i = text.indexOf(name)
  while (i >= 0) { out.push([i, i + name.length]); i = text.indexOf(name, i + 1) }
  return out
}

// จองช่วงข้อความให้แต่ละส่วน (จังหวัด/อำเภอ/ตำบล) โดยห้ามทับกัน ชื่อยาวได้จองก่อน
// จำเป็นเพราะชื่ออำเภอมักซ้อนอยู่ในชื่อตำบล เช่น "เกาะลันตา" อยู่ใน "เกาะลันตาใหญ่"
// และตำบลกับอำเภออาจชื่อเดียวกัน เช่น แขวงคลองเตย/เขตคลองเตย ซึ่งต้องกินคนละช่วง
function placeParts(text, roles) {
  const order = [...roles.keys()].sort(
    (a, b) => Math.max(...roles[b][1].map(n => n.length)) - Math.max(...roles[a][1].map(n => n.length))
  )
  const used = []
  const got = {}
  for (const i of order) {
    const [role, names] = roles[i]
    let hit = null
    for (const n of [...names].sort((a, b) => b.length - a.length)) {
      for (const [a, b] of spansOf(text, n)) {
        if (used.every(([u, v]) => b <= u || a >= v)) { hit = [a, b]; break }
      }
      if (hit) break
    }
    if (hit) { used.push(hit); got[role] = hit }
  }
  return { got, used }
}

/**
 * แยกที่อยู่ก้อนเดียวออกเป็นช่อง โดยเทียบกับรายชื่อจริงของกรมการปกครอง
 * จังหวัด/อำเภอ/ตำบล ที่คืนกลับมาผ่านการยืนยันกับข้อมูลจริงแล้วทั้งหมด
 * line1 คือเศษที่เหลือหลังตัดทุกอย่างออก (บ้านเลขที่ หมู่ ถนน อาคาร)
 * unmatched บอกว่าอะไรหาไม่เจอ เพื่อให้หน้าจอชี้ให้คนกรอกเลือกเอง
 */
export function parseThaiAddress(raw, idx) {
  const blank = { line1: '', subdistrict: '', district: '', province: '', postcode: '', unmatched: [] }
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

  // 2) ชุดผู้สมัคร — มีรหัสไปรษณีย์ก็เหลือไม่กี่ตัว ไม่มีก็ไล่จากจังหวัดที่ชื่อโผล่ในข้อความ
  let triples
  if (postcode) {
    triples = idx.byPostcode.get(postcode)
  } else {
    const provs = idx.provinces.filter(p => namesFor(p).some(n => text.includes(n)))
    triples = []
    for (const p of provs) {
      for (const [d, subs] of idx.byProvince.get(p)) {
        for (const [s] of subs) triples.push([p, d, s])
      }
    }
  }

  // 3) เลือกชุดที่แมตช์ได้มากที่สุด (จำนวนส่วนที่เจอก่อน แล้วค่อยดูความยาวรวม)
  let best = null
  for (const [p, d, s] of triples) {
    const { got, used } = placeParts(text, [['p', namesFor(p)], ['d', [d]], ['s', [s]]])
    const hits = Object.keys(got).length
    const chars = used.reduce((n, [a, b]) => n + (b - a), 0)
    if (!best || hits > best.hits || (hits === best.hits && chars > best.chars)) {
      best = { hits, chars, p, d, s, got, used }
    }
  }

  if (!best) {
    return { ...blank, postcode, line1: squash(text.replace(MARKERS, ' ')).replace(/^[,\s]+|[,\s]+$/g, ''), unmatched: ['จังหวัด', 'อำเภอ/เขต', 'ตำบล/แขวง'] }
  }

  // ตัดเฉพาะช่วงที่แมตช์จริงออก แล้วเก็บกวาดคำนำหน้าที่ค้าง
  let rest = text
  for (const [a, b] of [...best.used].sort((x, y) => y[0] - x[0])) rest = rest.slice(0, a) + ' ' + rest.slice(b)

  const province = (best.got.p || postcode) ? best.p : ''
  const district = (best.got.d || postcode) ? best.d : ''
  const subdistrict = best.got.s ? best.s : ''

  let line1 = squash(rest.replace(MARKERS, ' '))
  // ชื่อย่อจังหวัดอาจค้างอยู่ (เช่น "กทม." ตอนที่จังหวัดมาจากรหัสไปรษณีย์ ไม่ได้มาจากการแมตช์ชื่อ)
  if (province) {
    for (const n of namesFor(province).sort((a, b) => b.length - a.length)) line1 = line1.split(n).join(' ')
    line1 = squash(line1)
  }
  line1 = line1.replace(/^[,.\s]+|[,.\s]+$/g, '')

  const unmatched = []
  if (!province) unmatched.push('จังหวัด')
  if (!district) unmatched.push('อำเภอ/เขต')
  if (!subdistrict) unmatched.push('ตำบล/แขวง')

  return {
    line1, subdistrict, district, province,
    postcode: postcode || findPostcode(idx, province, district, subdistrict),
    unmatched,
  }
}
