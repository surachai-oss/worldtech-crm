// ใส่ Open Graph meta ให้หน้าแคตตาล็อกสาธารณะ ตอนลิงก์ถูกแชร์ลง LINE / Facebook / Messenger
//
// ทำไมต้องมี: แอปเป็น SPA ไฟล์เดียว ทุก URL เสิร์ฟ index.html ตัวเดียวกัน
// ตัวอ่านลิงก์ของ LINE/Facebook ไม่รัน JavaScript มันอ่านแค่ HTML ดิบที่เซิร์ฟเวอร์ส่งกลับ
// ถ้าไม่แทรกตรงนี้ ทุกแคตตาล็อกจะขึ้นการ์ดเหมือนกันหมดว่า "Worldtech CRM" ไม่มีรูปหน้าปก
//
// ดึงข้อมูลผ่านฟังก์ชัน catalog-public เดิม ไม่ต้องถือ service key ไว้ที่ edge อีกชุด
// และได้ผลพลอยได้คือใช้ whitelist คอลัมน์ชุดเดียวกัน ไม่มีทางหลุดฟิลด์ที่ไม่ตั้งใจโชว์
// ถ้าดึงไม่สำเร็จ ปล่อยหน้าเดิมผ่านไปเฉยๆ — หน้าลูกค้าต้องเปิดได้เสมอแม้ meta จะไม่สวย

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export default async (request, context) => {
  const url = new URL(request.url)
  const raw = url.pathname.replace(/^\/catalog\//, '').replace(/\/$/, '')
  let slug = raw
  try { slug = decodeURIComponent(raw) } catch { /* ลิงก์ที่ encode มาพัง — ปล่อยผ่านไปให้หน้าเว็บจัดการเอง */ }

  const res = await context.next()
  if (!slug || slug.length > 120 || !SLUG_RE.test(slug)) return res
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res

  let data
  try {
    const api = new URL(`/.netlify/functions/catalog-public?slug=${encodeURIComponent(slug)}`, url.origin)
    const r = await fetch(api.toString())
    if (!r.ok) return res
    data = await r.json()
  } catch {
    return res
  }
  if (data?.state !== 'ok' || !data.catalog) return res

  const c = data.catalog
  const title = `${c.name} | Worldtech`
  const desc = c.description || 'แคตตาล็อกสินค้าจาก Worldtech'
  const image = c.cover_image_url || data.images?.[0]?.url || ''
  const canonical = `${url.origin}/catalog/${slug}`

  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Worldtech" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(canonical)}" />`,
    image ? `<meta property="og:image" content="${esc(image)}" />` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    image ? `<meta name="twitter:image" content="${esc(image)}" />` : '',
  ].filter(Boolean).join('\n    ')

  let html = await res.text()
  // index.html มี <title> ของแอปหลักอยู่แล้ว ต้องถอดออกก่อน ไม่งั้นจะมีสองอันแล้ว crawler หยิบอันแรก
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '')
  html = html.replace(/<\/head>/i, `    ${tags}\n  </head>`)

  // คัดลอก header เดิมมา แต่ต้องทิ้ง content-length/content-encoding เพราะตัว HTML เพิ่งยาวขึ้นแล้ว
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.delete('content-encoding')
  headers.set('content-type', 'text/html; charset=utf-8')
  return new Response(html, { status: res.status, headers })
}
