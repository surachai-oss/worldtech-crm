// แปลงไฟล์ PDF เป็นรูปทีละหน้า ตอนอัปโหลดเข้าแคตตาล็อก
//
// ทำไมต้องแปลง: หน้าลูกค้าเป็นแกลเลอรีรูปที่เลื่อนดูทีละหน้าบนมือถือ
// ถ้าฝัง PDF ไว้ตรงๆ ผู้ใช้จะเจอโปรแกรมอ่าน PDF ของเบราว์เซอร์ ซึ่งใน in-app browser
// ของ LINE บางเครื่องเปิดไม่ขึ้นเลย หรือเด้งไปดาวน์โหลดแทน — แปลงเป็นรูปแล้วจบ เปิดได้ทุกที่
//
// แปลงในเบราว์เซอร์ของคนอัปโหลด ไม่ต้องมีเซิร์ฟเวอร์แปลงไฟล์
// pdfjs โหลดแบบ dynamic import — ไลบรารีก้อนใหญ่ ไม่ควรติดไปกับ bundle ของหน้าอื่น
// โดยเฉพาะหน้าแคตตาล็อกสาธารณะที่ต้องโหลดเร็วที่สุด

// เรนเดอร์ที่ 2 เท่าของขนาดจริง — Artwork มีตัวหนังสือเล็ก ถ้าเรนเดอร์ 1:1 แล้วซูมบนมือถือจะอ่านไม่ออก
const SCALE = 2
// เพดานความกว้าง กัน PDF หน้าใหญ่ๆ (A1/โปสเตอร์) กลายเป็นไฟล์ 10MB ต่อหน้า
const MAX_WIDTH = 2400
const MAX_PAGES = 50

let pdfjsPromise = null

async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist')
      try {
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      } catch {
        // หา worker ไม่เจอ (เวอร์ชันเปลี่ยน path) — pdfjs ยังทำงานได้ในโหมดไม่มี worker แค่ช้าลง
        // ยอมช้าดีกว่าอัปโหลดไม่ได้เลย
      }
      return pdfjs
    })().catch(e => { pdfjsPromise = null; throw e })
  }
  return pdfjsPromise
}

const blobToFile = (blob, name) => new File([blob], name, { type: 'image/jpeg' })

/**
 * แปลง PDF หนึ่งไฟล์เป็น File รูป JPEG ทีละหน้า
 * onProgress(done, total) เรียกทุกหน้าที่เสร็จ เพราะ PDF หลายสิบหน้าใช้เวลานานพอที่คนกดจะคิดว่าค้าง
 */
export async function pdfToImageFiles(file, onProgress) {
  const pdfjs = await loadPdfjs()
  const buf = await file.arrayBuffer()
  const task = pdfjs.getDocument({ data: buf })
  const doc = await task.promise

  const total = Math.min(doc.numPages, MAX_PAGES)
  const baseName = file.name.replace(/\.pdf$/i, '')
  const out = []

  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(SCALE, MAX_WIDTH / base.width)
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)

    // ส่ง canvas ตรงๆ ไม่ใช่ canvasContext — pdfjs รุ่นใหม่ถือว่า canvasContext เป็นของเก่าไว้รองรับย้อนหลัง
    // background ขาวจำเป็น เพราะ PDF ส่วนใหญ่พื้นหลังโปร่ง ถ้าไม่ทาจะได้ JPEG พื้นดำ
    await page.render({ canvas, viewport, background: '#ffffff' }).promise

    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92))
    canvas.width = canvas.height = 0   // คืนหน่วยความจำทันที PDF ยาวๆ ไม่งั้นแท็บค้าง
    if (blob) out.push(blobToFile(blob, `${baseName}-${String(n).padStart(2, '0')}.jpg`))
    onProgress?.(n, total)
  }

  // pdfjs v6 เอา doc.destroy() ออกแล้ว เหลือ doc.cleanup() ส่วน destroy() ย้ายไปอยู่ที่ loading task
  // เช็คก่อนเรียกทุกตัว และครอบ try ไว้ — การคืนหน่วยความจำพลาดไม่ควรทิ้งรูปที่แปลงเสร็จแล้วทั้งหมด
  // (บั๊กเดิมคือ doc.destroy() โยน TypeError ออกมาก่อนที่ .catch() จะได้ทำงาน)
  try {
    if (typeof task?.destroy === 'function') await task.destroy()
    else if (typeof doc?.cleanup === 'function') await doc.cleanup()
  } catch { /* ปล่อยผ่าน */ }

  if (!out.length) throw new Error(`${file.name}: แปลงไฟล์ PDF ไม่สำเร็จ`)
  return { files: out, skipped: Math.max(0, doc.numPages - total) }
}
