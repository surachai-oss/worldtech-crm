import { useCallback, useEffect, useRef, useState } from 'react'
import { lineHref, isDark } from '../lib/catalogBackCover'

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
/* คอมโพเนนต์นี้แบกสไตล์ของตัวเองมาทั้งชุด จึงต้องตั้ง box-sizing เองด้วย
   ไม่พึ่ง reset จาก App.css ข้างนอก — ไม่งั้นช่องกรอกที่ width:100% + padding จะล้นออกนอกกรอบ */
.wtc-root,.wtc-root *{box-sizing:border-box}
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
/* หน้าสุดท้ายของรูปสินค้าจะขึ้น "4 / 4" ซึ่งอ่านได้ว่าจบแล้ว ทั้งที่ยังมีปกหลังต่อ
   จึงเน้นปุ่มถัดไปให้ทึบ และเพิ่มคำเชิญที่กดได้ ให้รู้ว่ายังไปต่อได้ */
.wtc-nav.hot{background:var(--wtc-blue);color:#fff;border-color:var(--wtc-blue);
  animation:wtc-pulse 2.4s ease-in-out infinite}
@keyframes wtc-pulse{0%,100%{box-shadow:0 0 0 0 rgba(27,118,255,.45)}50%{box-shadow:0 0 0 7px rgba(27,118,255,0)}}
@media (prefers-reduced-motion:reduce){.wtc-nav.hot{animation:none}}
.wtc-more{display:block;width:100%;border:0;background:none;padding:0;cursor:pointer;
  font-family:inherit;font-size:12.5px;font-weight:600;color:var(--wtc-blue);line-height:1.4}
.wtc-bar-mid{flex:1;min-width:0;text-align:center}
.wtc-cap{font-size:12px;line-height:1.5;color:var(--wtc-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wtc-count{font-size:12px;color:var(--wtc-muted);font-variant-numeric:tabular-nums}
.wtc-foot{flex:none;text-align:center;font-size:10px;color:var(--wtc-muted);padding:0 8px 7px;background:#fff}
.wtc-foot b{font-weight:700;letter-spacing:.8px;color:var(--wtc-ink)}

/* ปกหลัง — หน้าสุดท้ายของเล่ม
   ทุกสีอ่านจากตัวแปรที่ชุดหน้าตา (theme) กำหนดมาเป็นชุด ไม่ได้เลือกทีละสี
   จึงไม่มีทางได้คู่สีที่ตัวหนังสืออ่านไม่ออกบนพื้นของมันเอง */
.wtc-page > .wtc-back{align-self:stretch;width:100%}
.wtc-back{flex:1;min-height:0;overflow-y:auto;display:flex;padding:18px 20px;
  background:var(--bc-bg);color:var(--bc-fg)}
.wtc-back-in{margin:auto;width:100%;max-width:380px;display:flex;flex-direction:column;
  align-items:stretch;gap:11px;text-align:center}
.wtc-back[data-align="left"] .wtc-back-in{text-align:left;align-items:flex-start}
.wtc-back[data-align="right"] .wtc-back-in{text-align:right;align-items:flex-end}
.wtc-back[data-align="left"] .wtc-back-logo{margin-left:0}
.wtc-back[data-align="right"] .wtc-back-logo{margin-right:0}
/* ตัวหนังสือ WORLDTECH ในไฟล์โลโก้เป็นสีดำ วางบนพื้นเข้มแล้วอ่านไม่ออก
   ชุดสีเข้มจึงรองพื้นขาวให้เป็นป้าย ดีกว่าซ่อนโลโก้หรือกลับสีจนตัว W เพี้ยน */
.wtc-back-logo[data-plate="1"]{background:#fff;padding:9px 13px;border-radius:10px;
  height:calc(var(--wtc-logo-h,48px) + 18px);max-height:none;width:auto}
.wtc-back-logo{display:block;margin:0 auto;width:auto;max-width:72%;
  height:var(--wtc-logo-h,48px);max-height:var(--wtc-logo-h,48px);
  object-fit:contain;border-radius:0;box-shadow:none;background:none}
.wtc-back-mark{font-size:15px;font-weight:600;letter-spacing:.1em;color:var(--bc-fg)}
.wtc-back-h{font-size:16px;font-weight:500;line-height:1.5;margin:0;text-wrap:balance;color:var(--bc-fg)}
.wtc-back-p{font-size:12.5px;line-height:1.65;color:var(--bc-sub);margin:0;white-space:pre-wrap}
.wtc-form{display:flex;flex-direction:column;gap:8px;width:100%}
.wtc-fld{height:40px;border:1px solid var(--bc-fld-bd);border-radius:9px;background:var(--bc-fld);
  font-family:inherit;font-size:14px;color:var(--bc-fg);padding:0 13px;width:100%}
.wtc-fld:focus{outline:none;border-color:var(--bc-btn);box-shadow:0 0 0 3px rgba(27,118,255,.15)}
.wtc-fld::placeholder{color:var(--bc-sub);opacity:.85}
.wtc-send{height:44px;border:0;border-radius:10px;background:var(--bc-btn);color:var(--bc-btn-fg);
  font-family:inherit;font-size:15px;font-weight:600;cursor:pointer;width:100%}
.wtc-send:disabled{opacity:.55;cursor:default}
.wtc-alt{font-size:13px;color:var(--bc-link);text-decoration:none;font-weight:500}
.wtc-tel{font-size:13px;color:var(--bc-fg);font-weight:500;text-decoration:none}
.wtc-err{font-size:12.5px;color:#D0342C;margin:0}
.wtc-done{display:flex;flex-direction:column;gap:8px;align-items:center}
.wtc-back[data-align="left"] .wtc-done{align-items:flex-start}
.wtc-done-i{width:52px;height:52px;border-radius:50%;background:var(--bc-btn);color:var(--bc-btn-fg);
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
// สีที่ตั้งไว้ แปลงเป็น CSS variable ให้สไตล์ทั้งหน้าใช้ร่วมกัน
function colorVars(c) {
  return {
    '--bc-bg': c.bg, '--bc-fg': c.fg, '--bc-sub': c.sub,
    '--bc-btn': c.btn, '--bc-btn-fg': c.btnFg,
    '--bc-fld': c.fld, '--bc-fld-bd': c.fldBd, '--bc-link': c.link,
  }
}

// ปกหลัง — เรนเดอร์ตามลำดับบล็อกที่ผู้ออกแบบจัดไว้ ไม่มีโครงตายตัวในโค้ด
// onSubmit ส่งมาจากภายนอก หน้าจริงส่งเข้าระบบผู้ติดต่อ ส่วนตัวอย่างในระบบส่งตัวที่ไม่ทำงาน
function BackCover({ cfg, logoSrc, onSubmit }) {
  const [values, setValues] = useState({})
  const [state, setState] = useState('idle')   // idle | sending | done
  const [err, setErr] = useState('')

  const shown = cfg.blocks.filter(b => b.visible !== false)
  const fields = shown.filter(b => b.type === 'field')
  const nameB  = fields.find(b => b.role === 'name')
  const phoneB = fields.find(b => b.role === 'phone')
  const dark = isDark(cfg.colors.bg)

  const send = async (e) => {
    e.preventDefault()
    const name = (values[nameB?.id] || '').trim()
    const phone = (values[phoneB?.id] || '').trim()
    if (!name || !phone) { setErr('กรุณากรอกชื่อและหมายเลขโทรศัพท์'); return }
    // ช่องที่เพิ่มเองรวมเป็นข้อความเดียว ติดไปกับลีดให้ทีมขายเห็นครบ
    const extra = fields
      .filter(b => b.role === 'extra' && (values[b.id] || '').trim())
      .map(b => `${b.label || 'เพิ่มเติม'}: ${values[b.id].trim()}`)
      .join(' / ')
    setErr(''); setState('sending')
    try {
      await onSubmit({ name, phone, interest: extra })
      setState('done')
    } catch (e2) {
      setErr(e2.message || 'ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
      setState('idle')
    }
  }

  const renderBlock = (b) => {
    if (b.type === 'logo') {
      const src = b.src || logoSrc
      if (!src) return null
      return <img key={b.id} className="wtc-back-logo" src={src} alt="" data-plate={dark ? '1' : undefined}
        style={{ '--wtc-logo-h': `${b.size}px` }}
        onError={e => { e.currentTarget.style.display = 'none' }} />
    }
    if (b.type === 'text') {
      if (!String(b.text || '').trim()) return null
      return b.style === 'heading'
        ? <p key={b.id} className="wtc-back-h">{b.text}</p>
        : <p key={b.id} className="wtc-back-p">{b.text}</p>
    }
    if (b.type === 'field') {
      return <input key={b.id} className="wtc-fld" value={values[b.id] || ''}
        onChange={e => setValues(v => ({ ...v, [b.id]: e.target.value }))}
        placeholder={b.label} aria-label={b.label || 'ข้อมูล'}
        inputMode={b.role === 'phone' ? 'tel' : undefined}
        autoComplete={b.role === 'name' ? 'name' : b.role === 'phone' ? 'tel' : 'off'} />
    }
    if (b.type === 'submit') {
      return (
        <button key={b.id} className="wtc-send" type="submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'กำลังส่ง...' : b.label}
        </button>
      )
    }
    if (b.type === 'line') {
      const href = lineHref(b.url)
      if (!href) return null
      return <a key={b.id} className="wtc-alt" href={href} target="_blank" rel="noreferrer">{b.text}</a>
    }
    if (!String(b.number || '').trim()) return null
    return (
      <a key={b.id} className="wtc-tel" href={`tel:${String(b.number).replace(/[^\d+]/g, '')}`}>
        {[b.text, b.number].filter(Boolean).join(' ')}
      </a>
    )
  }

  const style = colorVars(cfg.colors)

  if (state === 'done') {
    const logo = shown.find(b => b.type === 'logo')
    return (
      <div className="wtc-back" data-align={cfg.align} style={style}>
        <div className="wtc-back-in">
          {logo && renderBlock(logo)}
          <div className="wtc-done">
            <div className="wtc-done-i">✓</div>
            <p className="wtc-back-h">{cfg.done.title}</p>
            {cfg.done.text && <p className="wtc-back-p">{cfg.done.text}</p>}
          </div>
          {shown.filter(b => b.type === 'line' || b.type === 'phone').map(renderBlock)}
        </div>
      </div>
    )
  }

  // ทั้งหน้าอยู่ในฟอร์มเดียว ปุ่มส่งจึงวางตรงไหนของลำดับก็ยังทำงาน
  return (
    <div className="wtc-back" data-align={cfg.align} style={style}>
      <form className="wtc-back-in" onSubmit={send}>
        {shown.map(renderBlock)}
        {err && <p className="wtc-err">{err}</p>}
      </form>
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
  const nextIsBack = hasBack && page === images.length - 1
  const caption = onBack ? '' : (images[Math.min(page, images.length - 1)]?.caption || '')
  const counter = onBack ? 'ปกหลัง' : `${Math.min(page + 1, images.length)} / ${images.length}`
  // ข้อความเชิญ ดึงจากปุ่มส่งข้อมูลที่ตั้งไว้ จะได้สอดคล้องกับสิ่งที่รออยู่หน้าถัดไป
  const moreLabel = (backCover?.blocks || []).find(b => b.type === 'submit' && b.visible !== false)?.label
    || 'ติดต่อทีมขาย'

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
            {nextIsBack
              ? <button className="wtc-more" onClick={() => goTo(page + 1)}>{moreLabel} ›</button>
              : caption && <div className="wtc-cap">{caption}</div>}
            <div className="wtc-count">{counter}</div>
          </div>
          <button className={`wtc-nav${nextIsBack ? ' hot' : ''}`} onClick={() => goTo(page + 1)}
            disabled={page >= total - 1} aria-label="หน้าถัดไป">›</button>
        </div>
        <div className="wtc-foot"><b>WORLDTECH</b> · Official product catalog by Worldtech</div>
      </div>
    </div>
  )
}

