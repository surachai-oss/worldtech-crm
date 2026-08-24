// ===== แยกที่อยู่ไทยที่พิมพ์มาเป็นก้อนเดียว ออกเป็นช่องๆ =====
// ใช้ตอนเปิดออเดอร์ใหม่: เซลล์วางที่อยู่เต็มที่ลูกค้าส่งมา (จากไลน์/อีเมล) แล้วระบบเติมช่องให้
// ผลลัพธ์เป็น "ตัวตั้งต้นให้ตรวจ" ไม่ใช่คำตอบสุดท้าย — คนเปิดออเดอร์ต้องดูอีกรอบเสมอ
// จึงคืน guessed มาด้วย เพื่อให้หน้าจอเน้นช่องที่ระบบเดาเอง (ไม่ได้มีคำนำหน้าให้ยึด)

// 77 จังหวัด — ใช้จับจังหวัดในกรณีที่ไม่ได้เขียน "จ." นำหน้า
const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น', 'จันทบุรี', 'ฉะเชิงเทรา',
  'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่', 'ตรัง', 'ตราด', 'ตาก', 'นครนายก',
  'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช', 'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน',
  'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี', 'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา',
  'พังงา', 'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'พะเยา', 'ภูเก็ต',
  'มหาสารคาม', 'มุกดาหาร', 'แม่ฮ่องสอน', 'ยะลา', 'ยโสธร', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี',
  'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล', 'สมุทรปราการ',
  'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี', 'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี',
  'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู', 'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี',
  'อุบลราชธานี',
]

// ชื่อที่คนเขียนกันจริงแต่ไม่ใช่ชื่อทางการ
const ALIASES = {
  'กรุงเทพ': 'กรุงเทพมหานคร', 'กรุงเทพฯ': 'กรุงเทพมหานคร', 'กทม': 'กรุงเทพมหานคร', 'กทม.': 'กรุงเทพมหานคร',
  'บางกอก': 'กรุงเทพมหานคร', 'อยุธยา': 'พระนครศรีอยุธยา', 'โคราช': 'นครราชสีมา',
}

// เรียงยาวไปสั้น กันชื่อสั้นไปแมตช์ทับชื่อยาวที่มีมันเป็นส่วนหนึ่ง
const PROVINCE_LOOKUP = [...PROVINCES, ...Object.keys(ALIASES)].sort((a, b) => b.length - a.length)

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const cutOut = (text, start, end) => squash(text.slice(0, start) + ' ' + text.slice(end))

// รหัสไปรษณีย์ = ตัวเลข 5 หลักชุดท้ายสุด (ที่อยู่ไทยเอาไว้ท้าย) — เลี่ยง lookbehind ให้รองรับเบราว์เซอร์เก่า
function takePostcode(text) {
  let found = null
  for (const m of text.matchAll(/\d+/g)) {
    if (m[0].length === 5) found = m
  }
  if (!found) return { text, postcode: '' }
  return { text: cutOut(text, found.index, found.index + found[0].length), postcode: found[0] }
}

function takeProvince(text) {
  // เขียน "จ.xxx" หรือ "จังหวัด xxx" มา = เชื่อได้เลย
  const m = text.match(/(?:จังหวัด|จ\.)\s*(\S+)/)
  if (m) {
    const raw = m[1]
    return { text: cutOut(text, m.index, m.index + m[0].length), province: ALIASES[raw] || raw }
  }
  // ไม่มีคำนำหน้า — หาจากรายชื่อจังหวัดแทน
  for (const name of PROVINCE_LOOKUP) {
    const i = text.indexOf(name)
    if (i >= 0) return { text: cutOut(text, i, i + name.length), province: ALIASES[name] || name }
  }
  return { text, province: '' }
}

/**
 * แยกที่อยู่ก้อนเดียวเป็น { line1, subdistrict, district, province, postcode, guessed }
 * guessed.subdistrict / guessed.district = true เมื่อระบบเดาจากลำดับคำ ไม่ได้อ่านจากคำนำหน้า
 */
export function parseThaiAddress(raw) {
  const empty = { line1: '', subdistrict: '', district: '', province: '', postcode: '', guessed: {} }
  let text = squash(String(raw ?? '').replace(/\n/g, ' '))
  if (!text) return empty

  const pc = takePostcode(text); text = pc.text
  const pv = takeProvince(text); text = pv.text

  // ตำแหน่งของคำนำหน้าทั้งหมด แล้วตัดค่าระหว่าง marker หนึ่งไปถึง marker ถัดไป
  const hits = []
  for (const m of text.matchAll(/ตำบล|ต\.|แขวง/g)) hits.push({ s: m.index, e: m.index + m[0].length, key: 'subdistrict' })
  for (const m of text.matchAll(/อำเภอ|อ\.|เขต/g)) hits.push({ s: m.index, e: m.index + m[0].length, key: 'district' })
  hits.sort((a, b) => a.s - b.s)

  let line1 = text, subdistrict = '', district = ''
  const guessed = {}

  if (hits.length) {
    line1 = text.slice(0, hits[0].s)
    hits.forEach((h, i) => {
      const stop = i + 1 < hits.length ? hits[i + 1].s : text.length
      const val = text.slice(h.e, stop).replace(/[,\s]+$/, '').trim()
      if (h.key === 'subdistrict' && !subdistrict) subdistrict = val
      if (h.key === 'district' && !district) district = val
    })
  } else {
    // ไม่มีคำนำหน้าเลย เช่น "79ม.5 เกาะลันตาใหญ่ เกาะลันตา" — ที่อยู่ไทยเรียง ...ที่อยู่ ตำบล อำเภอ
    // เดาจากสองคำท้าย แล้วบอกว่าเดา ให้คนตรวจก่อนบันทึก
    const parts = text.split(' ').filter(Boolean)
    if (parts.length >= 3) {
      district = parts[parts.length - 1]
      subdistrict = parts[parts.length - 2]
      line1 = parts.slice(0, -2).join(' ')
      guessed.subdistrict = true
      guessed.district = true
    }
  }

  return {
    line1: line1.replace(/[,\s]+$/, '').trim(),
    subdistrict, district,
    province: pv.province,
    postcode: pc.postcode,
    guessed,
  }
}
