import { useCallback, useEffect, useRef, useState } from 'react'
import { lineHref } from '../lib/api'

// หน้าตาแคตตาล็อกที่ลูกค้าเห็น — เป็น presentational ล้วน ไม่ยุ่งกับ Supabase หรือ auth
// ใช้ร่วมกันสองที่: หน้าสาธารณะจริง (/catalog/:slug) กับ Preview ในหลังบ้าน
// ที่ต้องใช้ตัวเดียวกันเพราะ preview ที่หน้าตาไม่ตรงของจริง ไม่มีประโยชน์อะไรเลย
//
// เปิดทีละหน้า เลื่อนไปข้างเหมือนพลิกแคตตาล็อกเล่มจริง ไม่ใช่สกrollยาวลงล่าง
// ใช้ scroll-snap ของเบราว์เซอร์เอง ไม่ได้เขียน carousel เอง — ได้ปัดนิ้วลื่นๆ แบบ native
// บนมือถือฟรี และยังซูมสองนิ้วดูรายละเอียดใน Artwork ได้ตามปกติ
//
// สี CI ของ WORLDTECH: Blue #1B76FF, Yellow #FFDD42, Orange #F9631F พื้นขาว/เทาอ่อน

const CSS = `
.wtc-root{--wtc-blue:#1B76FF;--wtc-yellow:#FFDD42;--wtc-orange:#F9631F;--wtc-ink:#15233b;--wtc-muted:#6b7688;--wtc-line:#e6eaf0;
  background:#f5f7fa;color:var(--wtc-ink);font-family:'Mitr',system-ui,sans-serif;height:100%}
.wtc-root.wtc-fixed{position:fixed;inset:0}
.wtc-book{display:flex;flex-direction:column;height:100%;min-height:0}
.wtc-accent{height:4px;flex:none;background:linear-gradient(90deg,var(--wtc-blue) 0 45%,var(--wtc-yellow) 45% 75%,var(--wtc-orange) 75% 100%)}
.wtc-head{flex:none;background:#fff;border-bottom:1px solid var(--wtc-line);padding:10px 16px;
  display:flex;align-items:center;gap:12px}
.wtc-logo{height:26px;width:auto;flex:none}
.wtc-logo-text{font-size:14px;font-weight:700;letter-spacing:.5px;color:var(--wtc-blue);flex:none}
.wtc-head-txt{min-width:0}
.wtc-title{font-size:16px;line-height:1.35;font-weight:600;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wtc-desc{font-size:12px;line-height:1.5;color:var(--wtc-muted);margin-top:1px;
  display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}

.wtc-viewer{flex:1;min-height:0;display:flex;overflow-x:auto;overflow-y:hidden;
  scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.wtc-viewer::-webkit-scrollbar{display:none}
.wtc-page{flex:0 0 100%;scroll-snap-align:center;scroll-snap-stop:always;
  display:flex;align-items:center;justify-content:center;padding:14px 14px 6px;min-width:0}
/* ">" สำคัญ — ถ้าเขียน ".wtc-page img" เฉยๆ จะไปครอบโลโก้ในปกหลังด้วย
   แล้ว height:auto ตรงนี้จะทับความสูงของโลโก้ กลายเป็นรูปขนาดไฟล์จริงเต็มหน้า */
.wtc-page > img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;
  background:#fff;border-radius:10px;box-shadow:0 2px 10px rgba(21,35,59,.10)}

.wtc-bar{flex:none;background:#fff;border-top:1px solid var(--wtc-line);padding:8px 10px;
  display:flex;align-items:center;gap:10px}
.wtc-nav{flex:none;width:40px;height:40px;border-radius:50%;border:1px solid var(--wtc-line);background:#fff;
  color:var(--wtc-blue);font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center}
.wtc-nav:disabled{color:#c7ced9;background:#fafbfc}
.wtc-bar-mid{flex:1;min-width:0;text-align:center}
.wtc-cap{font-size:12px;line-height:1.5;color:var(--wtc-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wtc-count{font-size:12px;color:var(--wtc-muted);font-variant-numeric:tabular-nums}
.wtc-foot{flex:none;text-align:center;font-size:10px;color:var(--wtc-muted);padding:0 8px 7px;background:#fff}
.wtc-foot b{font-weight:700;letter-spacing:.8px;color:var(--wtc-ink)}

/* ปกหลัง — หน้าสุดท้ายของเล่ม ดีไซน์ตายตัว มีแค่ข้อความกับช่องทางที่ตั้งค่าได้
   จงใจให้มีปุ่มหลักปุ่มเดียว ที่เหลือเป็นลิงก์ตัวเล็ก ไม่ให้แย่งกันเอง */
.wtc-page > .wtc-back{align-self:stretch;width:100%}
/* จัดกลางด้วย margin:auto ของลูก ไม่ใช่ justify-content:center ของพ่อ
   เพราะพอเนื้อหาสูงเกินกรอบ (จอเตี้ย/โลโก้ใหญ่) justify-content:center จะดันส่วนบนออกนอก
   ขอบเขต scroll แล้วเลื่อนขึ้นไปดูไม่ได้ — margin:auto ยุบเองเมื่อที่ไม่พอ */
.wtc-back{flex:1;min-height:0;overflow-y:auto;background:#fff;display:flex;padding:18px 20px}
.wtc-back-in{margin:auto;width:100%;display:flex;flex-direction:column;gap:11px;text-align:center}
.wtc-back-logo{display:block;margin:0 auto;width:auto;max-width:72%;
  height:var(--wtc-logo-h,48px);max-height:var(--wtc-logo-h,48px);
  object-fit:contain;border-radius:0;box-shadow:none;background:none}
.wtc-back-mark{font-size:15px;font-weight:600;letter-spacing:.1em;color:var(--wtc-ink)}
.wtc-back-h{font-size:16px;font-weight:500;line-height:1.5;margin:0;text-wrap:balance}
.wtc-back-p{font-size:12.5px;line-height:1.65;color:var(--wtc-muted);margin:0}
.wtc-form{display:flex;flex-direction:column;gap:8px;max-width:340px;width:100%;margin:0 auto}
.wtc-fld{height:40px;border:1px solid #DDE3EB;border-radius:9px;background:#FBFCFD;
  font-family:inherit;font-size:14px;color:var(--wtc-ink);padding:0 13px;width:100%}
.wtc-fld:focus{outline:none;border-color:var(--wtc-blue);box-shadow:0 0 0 3px rgba(27,118,255,.15)}
.wtc-fld::placeholder{color:#9BA5B4}
.wtc-send{height:44px;border:0;border-radius:10px;background:var(--wtc-blue);color:#fff;
  font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;width:100%}
.wtc-send:disabled{background:#A9C7F5;cursor:default}
.wtc-alt{font-size:13px;color:var(--wtc-blue);text-decoration:none;font-weight:500}
.wtc-tel{font-size:13px;color:var(--wtc-ink);font-weight:500;text-decoration:none}
.wtc-err{font-size:12.5px;color:#D0342C;margin:0}
.wtc-done{display:flex;flex-direction:column;gap:8px;align-items:center}
.wtc-done-i{width:52px;height:52px;border-radius:50%;background:#E8F7EE;color:#1F9254;
  display:grid;place-items:center;font-size:26px;line-height:1}

.wtc-state{max-width:520px;margin:0 auto;padding:64px 24px;text-align:center}
.wtc-state-t{font-size:17px;font-weight:600;margin-bottom:6px}
.wtc-state-s{font-size:14px;color:var(--wtc-muted);line-height:1.7}
.wtc-footer{margin-top:28px;padding:20px 16px 8px;text-align:center;border-top:1px solid var(--wtc-line)}
.wtc-footer-b{font-size:14px;font-weight:700;letter-spacing:1px;color:var(--wtc-ink)}
.wtc-footer-s{font-size:11px;color:var(--wtc-muted);margin-top:4px}
@media (min-width:721px){ .wtc-title{font-size:19px} .wtc-page{padding:20px 24px 8px} }
`

// ปกหลัง: ฟอร์มสั้นสามช่อง + ทางเลือกรองเป็นลิงก์ LINE/เบอร์
// onSubmit ถูกส่งมาจากข้างนอก — หน้าจริงส่งเข้าท่อลีด ส่วนพรีวิวหลังบ้านส่งฟังก์ชันที่ไม่ทำอะไร
// ขนาดโลโก้บนปกหลัง — ให้เลือกจากชุดที่จัดไว้ ไม่ให้กรอกตัวเลขเอง
// ทุกค่าในชุดนี้ผ่านตาแล้วว่าไม่ล้นและไม่เล็กจนอ่านไม่ออก
export const LOGO_SIZES = { off: 0, sm: 32, md: 48, lg: 72 }

function BackCover({ cfg, logoSrc, onSubmit }) {
  const [f, setF] = useState({ name: '', phone: '', interest: '' })
  const [state, setState] = useState('idle')   // idle | sending | done
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const send = async (e) => {
    e.preventDefault()
    if (!f.name.trim() || !f.phone.trim()) { setErr('กรุณากรอกชื่อและเบอร์โทร'); return }
    setErr(''); setState('sending')
    try {
      await onSubmit({ name: f.name.trim(), phone: f.phone.trim(), interest: f.interest.trim() })
      setState('done')
    } catch (e2) {
      setErr(e2.message || 'ส่งข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง')
      setState('idle')
    }
  }

  const line = lineHref(cfg.line)
  const logoH = LOGO_SIZES[cfg.logo] ?? LOGO_SIZES.md
  const mark = (cfg.logo === 'off' || !logoSrc)
    ? <div className="wtc-back-mark">WORLDTECH</div>
    : <img className="wtc-back-logo" src={logoSrc} alt="Worldtech"
        style={{ '--wtc-logo-h': `${logoH}px` }}
        onError={e => { e.currentTarget.style.display = 'none' }} />

  if (state === 'done') {
    return (
      <div className="wtc-back">
        <div className="wtc-back-in">
          {mark}
          <div className="wtc-done">
            <div className="wtc-done-i">✓</div>
            <p className="wtc-back-h">ได้รับข้อมูลแล้ว</p>
            <p className="wtc-back-p">ทีมขาย WORLDTECH จะติดต่อกลับที่เบอร์ {f.phone} ในเวลาทำการ</p>
          </div>
          {line && <a className="wtc-alt" href={line} target="_blank" rel="noreferrer">อยากคุยเลย ทักแชท LINE ได้</a>}
        </div>
      </div>
    )
  }

  return (
    <div className="wtc-back">
      <div className="wtc-back-in">
      {mark}
      <p className="wtc-back-h">{cfg.heading}</p>
      {cfg.note && <p className="wtc-back-p">{cfg.note}</p>}
      <form className="wtc-form" onSubmit={send}>
        <input className="wtc-fld" value={f.name} onChange={set('name')} placeholder="ชื่อผู้ติดต่อ" aria-label="ชื่อผู้ติดต่อ" autoComplete="name" />
        <input className="wtc-fld" value={f.phone} onChange={set('phone')} placeholder="เบอร์โทร" aria-label="เบอร์โทร" inputMode="tel" autoComplete="tel" />
        {cfg.showInterest !== false && (
          <input className="wtc-fld" value={f.interest} onChange={set('interest')}
            placeholder="สนใจสินค้าอะไร (ไม่ใส่ก็ได้)" aria-label="สนใจสินค้าอะไร" />
        )}
        {err && <p className="wtc-err">{err}</p>}
        <button className="wtc-send" type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'กำลังส่ง...' : (cfg.button || 'ให้ทีมขายติดต่อกลับ')}
        </button>
      </form>
      {line && <a className="wtc-alt" href={line} target="_blank" rel="noreferrer">หรือทักแชท LINE ทันที</a>}
      {cfg.phone && <a className="wtc-tel" href={`tel:${cfg.phone.replace(/[^\d+]/g, '')}`}>โทร {cfg.phone}</a>}
      </div>
    </div>
  )
}

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

export default function CatalogGalleryView({
  catalog, images, backCover = null, onSubmitLead, logoSrc = '/worldtech-logo.png', mobile = false,
}) {
  const viewerRef = useRef(null)
  const [page, setPage] = useState(0)
  // ปกหลังนับเป็นอีกหนึ่งหน้าในเครื่องอ่าน แต่ไม่นับรวมใน "หน้าที่ x จาก y" ของรูปสินค้า
  const hasBack = Boolean(backCover?.enabled && images.length && onSubmitLead)
  const total = images.length + (hasBack ? 1 : 0)

  // อ่านหน้าปัจจุบันจากตำแหน่ง scroll จริง ไม่ได้เก็บ state คู่ขนาน
  // เพราะผู้ใช้เลื่อนเองด้วยนิ้วได้ตลอด ถ้าเก็บแยกจะเพี้ยนจากของจริงทันที
  const onScroll = useCallback(() => {
    const el = viewerRef.current
    if (!el || !el.clientWidth) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    setPage(p => (p === i ? p : i))
  }, [])

  const goTo = useCallback((i) => {
    const el = viewerRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(total - 1, i))
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
  }, [total])

  // ปุ่มลูกศรบนคีย์บอร์ด — ลูกค้าที่เปิดบนคอมคาดหวังแบบนี้เป็นปกติ
  // ผูกเฉพาะหน้าจริง ไม่ผูกในพรีวิวหลังบ้าน ไม่งั้นจะไปแย่งลูกศรของช่องกรอกข้อมูล
  useEffect(() => {
    if (mobile) return
    const onKey = (e) => {
      // ปกหลังมีช่องกรอก — ลูกศรซ้าย/ขวาในช่องต้องเลื่อนเคอร์เซอร์ ไม่ใช่พลิกหน้าหนีไป
      const el = e.target
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      if (e.key === 'ArrowRight') goTo(page + 1)
      else if (e.key === 'ArrowLeft') goTo(page - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobile, page, goTo])

  const header = (
    <header className="wtc-head">
      {logoSrc
        ? <img className="wtc-logo" src={logoSrc} alt="Worldtech" onError={e => { e.currentTarget.style.display = 'none' }} />
        : <div className="wtc-logo-text">WORLDTECH</div>}
      <div className="wtc-head-txt">
        <h1 className="wtc-title">{catalog.name}</h1>
        {catalog.description && <div className="wtc-desc">{catalog.description}</div>}
      </div>
    </header>
  )

  if (!total) {
    return (
      <div className={`wtc-root${mobile ? '' : ' wtc-fixed'}`}>
        <style>{CSS}</style>
        <div className="wtc-book">
          <div className="wtc-accent" />
          {header}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div className="wtc-state">
              <div className="wtc-state-t">ยังไม่มีรูปในแคตตาล็อกนี้</div>
              <div className="wtc-state-s">ทีมงานกำลังจัดเตรียมอยู่ ติดต่อทีมขายเพื่อสอบถามข้อมูลเพิ่มเติมได้เลย</div>
            </div>
          </div>
          <div className="wtc-foot"><b>WORLDTECH</b> · Official product catalog by Worldtech</div>
        </div>
      </div>
    )
  }

  const onBack = hasBack && page >= images.length
  const caption = onBack ? '' : (images[Math.min(page, images.length - 1)]?.caption || '')
  const counter = onBack ? 'ปกหลัง' : `${Math.min(page + 1, images.length)} / ${images.length}`

  return (
    <div className={`wtc-root${mobile ? '' : ' wtc-fixed'}`}>
      <style>{CSS}</style>
      <div className="wtc-book">
        <div className="wtc-accent" />
        {header}

        <div className="wtc-viewer" ref={viewerRef} onScroll={onScroll}>
          {images.map((img, i) => (
            <div className="wtc-page" key={img.url + i}>
              {/* object-fit:contain — Artwork แต่ละใบสัดส่วนไม่เท่ากัน ครอปทีเดียวข้อความในรูปหายเลย */}
              <img src={img.url} alt={img.caption || `${catalog.name} ${i + 1}`}
                loading={Math.abs(i - page) <= 1 ? 'eager' : 'lazy'} decoding="async" draggable={false} />
            </div>
          ))}
          {hasBack && (
            <div className="wtc-page" style={{ padding: 0 }} key="__back">
              <BackCover cfg={backCover} logoSrc={logoSrc} onSubmit={onSubmitLead} />
            </div>
          )}
        </div>

        <div className="wtc-bar">
          <button className="wtc-nav" onClick={() => goTo(page - 1)} disabled={page <= 0} aria-label="หน้าก่อน">‹</button>
          <div className="wtc-bar-mid">
            {caption && <div className="wtc-cap">{caption}</div>}
            <div className="wtc-count">{counter}</div>
          </div>
          <button className="wtc-nav" onClick={() => goTo(page + 1)} disabled={page >= total - 1} aria-label="หน้าถัดไป">›</button>
        </div>
        <div className="wtc-foot"><b>WORLDTECH</b> · Official product catalog by Worldtech</div>
      </div>
    </div>
  )
}

