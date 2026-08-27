// หน้าตาแคตตาล็อกที่ลูกค้าเห็น — เป็น presentational ล้วน ไม่ยุ่งกับ Supabase หรือ auth
// ใช้ร่วมกันสองที่: หน้าสาธารณะจริง (/catalog/:slug) กับ Preview ในหลังบ้าน
// ที่ต้องใช้ตัวเดียวกันเพราะ preview ที่หน้าตาไม่ตรงของจริง ไม่มีประโยชน์อะไรเลย
//
// สี CI ของ WORLDTECH: Blue #1B76FF, Yellow #FFDD42, Orange #F9631F พื้นขาว/เทาอ่อน
// ปุ่ม LINE ใช้เขียว #06C755 ของ LINE เอง ตั้งใจแหกสี CI ตรงนี้จุดเดียว
// เพราะคนไทยจำสีปุ่ม LINE ได้ทันที ปุ่มติดต่อที่กดถูกตั้งแต่ครั้งแรกสำคัญกว่าความเนี้ยบของชุดสี

const CSS = `
.wtc-root{--wtc-blue:#1B76FF;--wtc-yellow:#FFDD42;--wtc-orange:#F9631F;--wtc-ink:#15233b;--wtc-muted:#6b7688;--wtc-line:#e6eaf0;
  background:#f5f7fa;color:var(--wtc-ink);min-height:100%;font-family:'Mitr',system-ui,sans-serif;padding-bottom:24px}
.wtc-accent{height:4px;background:linear-gradient(90deg,var(--wtc-blue) 0 45%,var(--wtc-yellow) 45% 75%,var(--wtc-orange) 75% 100%)}
.wtc-wrap{max-width:760px;margin:0 auto;padding:0 16px}
.wtc-header{background:#fff;border-bottom:1px solid var(--wtc-line)}
.wtc-header-in{max-width:760px;margin:0 auto;padding:18px 16px 22px}
.wtc-logo{height:30px;width:auto;display:block;margin-bottom:14px}
.wtc-logo-text{font-size:15px;font-weight:700;letter-spacing:.5px;color:var(--wtc-blue);margin-bottom:14px}
.wtc-title{font-size:23px;line-height:1.3;font-weight:600;margin:0}
.wtc-desc{font-size:14px;line-height:1.6;color:var(--wtc-muted);margin-top:8px;white-space:pre-wrap}
.wtc-gallery{padding-top:18px;display:flex;flex-direction:column;gap:18px}
.wtc-figure{margin:0;background:#fff;border:1px solid var(--wtc-line);border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(21,35,59,.06)}
.wtc-figure img{display:block;width:100%;height:auto;background:#fff}
.wtc-cap{font-size:13px;line-height:1.6;color:var(--wtc-muted);padding:10px 14px 12px}
.wtc-contact{margin-top:26px;background:#fff;border:1px solid var(--wtc-line);border-radius:12px;padding:18px 16px}
.wtc-contact-h{font-size:15px;font-weight:600;margin-bottom:4px}
.wtc-contact-s{font-size:13px;color:var(--wtc-muted);margin-bottom:14px}
.wtc-btns{display:flex;flex-direction:column;gap:10px}
.wtc-btn{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:10px;
  font-size:15px;font-weight:600;text-decoration:none;border:1.5px solid transparent;padding:0 16px}
.wtc-btn-line{background:#06C755;color:#fff}
.wtc-btn-tel{background:var(--wtc-blue);color:#fff}
.wtc-btn-mail{background:#fff;color:var(--wtc-orange);border-color:var(--wtc-orange)}
.wtc-who{font-size:13px;color:var(--wtc-muted);margin-top:12px;text-align:center}
.wtc-footer{margin-top:28px;padding:20px 16px 8px;text-align:center;border-top:1px solid var(--wtc-line)}
.wtc-footer-b{font-size:14px;font-weight:700;letter-spacing:1px;color:var(--wtc-ink)}
.wtc-footer-s{font-size:11px;color:var(--wtc-muted);margin-top:4px}
.wtc-state{max-width:520px;margin:0 auto;padding:64px 24px;text-align:center}
.wtc-state-t{font-size:17px;font-weight:600;margin-bottom:6px}
.wtc-state-s{font-size:14px;color:var(--wtc-muted);line-height:1.7}
@media (min-width:721px){ .wtc-btns{flex-direction:row} .wtc-btn{flex:1} .wtc-title{font-size:27px} }
/* กรอบพรีวิวมือถือในหลังบ้านแคบ แต่ media query วัดจากขนาดหน้าจอ ไม่ใช่ขนาดกรอบ — บังคับกลับเป็นเลย์เอาต์มือถือ */
.wtc-root.wtc-mobile .wtc-btns{flex-direction:column}
.wtc-root.wtc-mobile .wtc-title{font-size:20px}
.wtc-root.wtc-mobile .wtc-header-in,.wtc-root.wtc-mobile .wtc-wrap{padding-left:12px;padding-right:12px}
`

// contact_line รับได้ทั้งลิงก์เต็มที่ก๊อปจากแอป LINE และไอดีเปล่าๆ ที่คนพิมพ์เอง
// เดาให้ถูกทั้งสองแบบ ดีกว่าบังคับให้คนกรอกจำรูปแบบเดียว แล้วได้ปุ่มที่กดแล้วไม่ไปไหน
export function lineHref(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  if (v.startsWith('@')) return `https://line.me/R/ti/p/${encodeURIComponent(v)}`
  return `https://line.me/ti/p/~${encodeURIComponent(v)}`
}

const telHref = (v) => `tel:${String(v || '').replace(/[^\d+]/g, '')}`

export function CatalogStateMessage({ title, detail }) {
  return (
    <div className="wtc-root">
      <style>{CSS}</style>
      <div className="wtc-accent" />
      <div className="wtc-state">
        <div className="wtc-state-t">{title}</div>
        <div className="wtc-state-s">{detail}</div>
        <div className="wtc-footer" style={{ marginTop: 32 }}>
          <div className="wtc-footer-b">WORLDTECH</div>
          <div className="wtc-footer-s">Official product catalog by Worldtech</div>
        </div>
      </div>
    </div>
  )
}

export default function CatalogGalleryView({ catalog, images, logoSrc = '/worldtech-logo.png', mobile = false }) {
  const hasContact = catalog.contact_line || catalog.contact_phone || catalog.contact_email

  return (
    <div className={`wtc-root${mobile ? ' wtc-mobile' : ''}`}>
      <style>{CSS}</style>
      <div className="wtc-accent" />

      <header className="wtc-header">
        <div className="wtc-header-in">
          {logoSrc
            ? <img className="wtc-logo" src={logoSrc} alt="Worldtech" onError={e => { e.currentTarget.style.display = 'none' }} />
            : <div className="wtc-logo-text">WORLDTECH</div>}
          <h1 className="wtc-title">{catalog.name}</h1>
          {catalog.description && <div className="wtc-desc">{catalog.description}</div>}
        </div>
      </header>

      <div className="wtc-wrap">
        {images.length ? (
          <div className="wtc-gallery">
            {images.map((img, i) => (
              <figure className="wtc-figure" key={img.url + i}>
                {/* ไม่ครอป ไม่ fix ความสูง — Artwork แต่ละใบสัดส่วนไม่เท่ากัน ครอปทีเดียวข้อความในรูปหายเลย */}
                <img src={img.url} alt={img.caption || `${catalog.name} ${i + 1}`}
                  loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
                {img.caption && <figcaption className="wtc-cap">{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        ) : (
          <div className="wtc-state">
            <div className="wtc-state-t">ยังไม่มีรูปในแคตตาล็อกนี้</div>
            <div className="wtc-state-s">ทีมงานกำลังจัดเตรียมอยู่ ติดต่อทีมขายเพื่อสอบถามข้อมูลเพิ่มเติมได้เลย</div>
          </div>
        )}

        {hasContact && (
          <section className="wtc-contact">
            <div className="wtc-contact-h">สนใจสินค้า / ขอใบเสนอราคา</div>
            <div className="wtc-contact-s">ติดต่อทีมขาย WORLDTECH ได้ตามช่องทางด้านล่าง</div>
            <div className="wtc-btns">
              {catalog.contact_line && (
                <a className="wtc-btn wtc-btn-line" href={lineHref(catalog.contact_line)} target="_blank" rel="noreferrer">
                  ทักแชท LINE
                </a>
              )}
              {catalog.contact_phone && (
                <a className="wtc-btn wtc-btn-tel" href={telHref(catalog.contact_phone)}>
                  โทร {catalog.contact_phone}
                </a>
              )}
              {catalog.contact_email && (
                <a className="wtc-btn wtc-btn-mail" href={`mailto:${catalog.contact_email}`}>
                  ส่งอีเมล
                </a>
              )}
            </div>
            {catalog.contact_name && <div className="wtc-who">ผู้ดูแล: {catalog.contact_name}</div>}
          </section>
        )}

        <footer className="wtc-footer">
          <div className="wtc-footer-b">WORLDTECH</div>
          <div className="wtc-footer-s">Official product catalog by Worldtech</div>
        </footer>
      </div>
    </div>
  )
}
