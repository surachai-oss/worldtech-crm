// Meta (Facebook) Pixel — โหลดเฉพาะหน้าสาธารณะเท่านั้น (ฟอร์มลีด /lead และแคตตาล็อก /catalog/:slug)
//
// ตั้งใจไม่ติดผ่าน Snippet injection ของ Netlify ด้วยเหตุผล 2 ข้อ:
//
// 1) Snippet ของ Netlify ใส่ให้ "ทุกหน้า" รวมหลังบ้านที่เซลล์เปิดทำงานทั้งวัน
//    ทุกการเปิดหน้าในระบบจะถูกส่งไป Facebook ซึ่งนอกจากไม่จำเป็นแล้ว ยังทำให้ข้อมูลเสีย —
//    Facebook จะเรียนรู้ว่า "คนที่สนใจ" หน้าตาเหมือนพนักงานเราเอง แล้วเอาไปหา Lookalike ผิดกลุ่ม
//
// 2) Event "Lead" ต้องยิงตอน "ส่งสำเร็จจริง" ไม่ใช่ตอนกดปุ่ม
//    ถ้าไปผูกปุ่มด้วย Event Setup Tool มันยิงตั้งแต่คลิก กรอกไม่ครบแล้วระบบปฏิเสธก็ยังนับเป็น Lead
//    ต้นทุนต่อ Lead ที่เห็นจะต่ำกว่าความจริง และ Facebook จะไปหาคนที่ "ชอบกดปุ่ม" ไม่ใช่คนที่กรอกจริง
//
// ไม่ส่งข้อมูลส่วนบุคคล (ชื่อ/เบอร์/อีเมล) ไป Facebook โดยตั้งใจ — ยิงแค่ว่ามีเหตุการณ์เกิดขึ้น

const PIXEL_ID = import.meta.env.VITE_FACEBOOK_PIXEL_ID

// สุ่ม id ต่อหนึ่งเหตุการณ์ เผื่อวันข้างหน้าเพิ่ม Conversions API ฝั่งเซิร์ฟเวอร์
// ส่ง eventID เดียวกันทั้งสองทาง Facebook จะรู้ว่าเป็นเหตุการณ์เดียวกัน ไม่นับซ้ำเป็นสองลีด
function newEventId() {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

export function initFacebookPixel() {
  if (!PIXEL_ID || typeof window === 'undefined' || window.fbq) return false
  /* eslint-disable */
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments) }
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'
    n.queue = []; t = b.createElement(e); t.async = !0
    t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s)
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  /* eslint-enable */
  window.fbq('init', PIXEL_ID)
  window.fbq('track', 'PageView')
  return true
}

// ยิงตอนลูกค้าส่งฟอร์มสำเร็จแล้วเท่านั้น (ลีดเข้า CRM เรียบร้อย)
// content_name ใส่ไว้ให้แยกได้ว่าลีดมาจากฟอร์มไหน เช่น ฟอร์มสาธารณะ หรือปกหลังแคตตาล็อกเล่มไหน
export function trackLead(contentName) {
  if (!PIXEL_ID || typeof window === 'undefined' || !window.fbq) return null
  const eventID = newEventId()
  window.fbq('track', 'Lead', contentName ? { content_name: contentName } : {}, { eventID })
  return eventID
}
