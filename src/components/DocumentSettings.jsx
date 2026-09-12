import { useEffect, useMemo, useRef, useState } from 'react'
import { saveDocumentTemplate, uploadDocumentLogo, deleteDocumentLogo, TEMPLATE_CONFLICT } from '../lib/api'
import { mergeDocumentTemplate, templateLogoUrl, TEMPLATE_DEFAULTS, DEFAULT_LOGO_URL, TEMPLATE_SETTING_KEY, normalizeHexColor } from '../lib/documentTemplate'
import { buildQuotationHtml } from '../lib/printQuotation'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// หน้า "ตั้งค่าเอกสาร" — แอดมินแก้ข้อความ สี โลโก้ และเงื่อนไขบนเอกสารได้เอง ไม่ต้องแก้โค้ดและไม่ต้อง deploy
// ค่าทั้งหมดเก็บเป็น JSON ก้อนเดียวในตาราง settings คีย์ DOCUMENT_TEMPLATE
//
// การจัดหน้า: ช่องกรอกอยู่ซ้ายทั้งหมด เรียงตามลำดับที่ปรากฏบนกระดาษจากบนลงล่าง ตัวอย่างเอกสารอยู่ขวาแบบปักหมุด
// ตั้งใจไม่ใส่คำอธิบายใต้ช่อง เพราะแก้แล้วเห็นผลในตัวอย่างทันที ลองเองจากของจริงเข้าใจกว่าอ่านคำบรรยาย
// และตั้งใจบีบช่องไฟให้แน่น เพื่อให้เห็นหลายส่วนพร้อมกันโดยไม่ต้องเลื่อนยาว
//
// สิ่งที่หน้านี้ "ไม่" ควบคุม โดยตั้งใจ: ตัวเลขในตารางสินค้า ราคา ส่วนลด VAT และยอดรวม
// ทั้งหมดยังคำนวณจากข้อมูลจริงของใบเสนอราคาเหมือนเดิม แก้ที่นี่เปลี่ยนแค่ข้อความและรูปเล่ม
//
// ข้อควรรู้: PDF สร้างสดทุกครั้งที่กดพิมพ์ แก้เงื่อนไขวันนี้แล้วย้อนไปพิมพ์ใบเก่า จะได้เงื่อนไขชุดใหม่

const CSS = `
.ds-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}
@media(max-width:1150px){.ds-grid{grid-template-columns:1fr}}
.ds-panel{background:var(--white);border:1px solid var(--border);border-left:4px solid var(--p);border-radius:7px;margin-bottom:8px}
.ds-panel-h{padding:6px 11px;border-bottom:1px solid var(--border);font-weight:600;font-size:12.5px;
            background:var(--gray-bg);
            background:color-mix(in srgb, var(--p) 9%, transparent);color:var(--p);
            display:flex;align-items:center;gap:7px;border-radius:0 7px 0 0}
.ds-dot{width:8px;height:8px;border-radius:50%;background:var(--p);flex-shrink:0}
.ds-panel-b{padding:9px 11px}
/* ช่องกรอกชิดกว่าค่ามาตรฐานของแอป เพื่อให้ทั้ง 10 ส่วนอยู่ในระยะเลื่อนสั้นๆ */
.ds-panel-b .form-group{margin-bottom:7px}
.ds-panel-b .form-group:last-child{margin-bottom:0}
.ds-panel-b .form-label{font-size:11.5px;margin-bottom:3px;color:var(--text-light)}
.ds-panel-b .form-control{padding:6px 9px;font-size:12.5px;border-radius:5px}
.ds-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ds-row-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.ds-term{display:flex;gap:6px;align-items:flex-start;margin-bottom:5px}
.ds-term-no{width:16px;text-align:right;padding-top:7px;font-size:11px;color:var(--text-light);flex-shrink:0}
.ds-term textarea{flex:1;min-height:40px;resize:vertical;line-height:1.35}
.ds-term-btns{display:flex;flex-direction:column;gap:2px;flex-shrink:0}
.ds-mini{border:1px solid var(--border);background:var(--white);border-radius:4px;width:22px;height:18px;cursor:pointer;font-size:10px;line-height:1;padding:0}
.ds-mini:disabled{opacity:.35;cursor:default}
.ds-mini.del{color:var(--danger)}
.ds-logo-row{display:flex;gap:9px;align-items:center}
.ds-logo-box{width:104px;height:40px;border:1px dashed var(--border);border-radius:5px;display:flex;align-items:center;justify-content:center;background:var(--gray-bg);overflow:hidden;flex-shrink:0}
.ds-logo-box img{max-width:100%;max-height:100%;object-fit:contain}
.ds-logo-btns{display:flex;flex-direction:column;gap:3px;min-width:0}
.ds-color{display:flex;gap:7px;align-items:center}
.ds-color input[type=color]{width:36px;height:30px;padding:2px;border:1px solid var(--border);border-radius:5px;background:var(--white);cursor:pointer;flex-shrink:0}
.ds-color input[type=text]{font-family:ui-monospace,Menlo,monospace}
.ds-preview-wrap{position:sticky;top:0}
.ds-preview-wrap .ds-panel{margin-bottom:0}
.ds-preview{width:100%;height:calc(100vh - 150px);min-height:460px;border:1px solid var(--border);border-radius:7px;background:var(--white)}
.ds-warn{border:1px solid var(--warning);background:#fffaf0;border-radius:7px;padding:10px 12px;margin-bottom:10px;font-size:12.5px;line-height:1.55}
`

// สีประจำแต่ละส่วนของฟอร์ม — เป็นสีบนหน้าจอเท่านั้น ไม่เกี่ยวกับสีที่พิมพ์ลงเอกสาร
const GROUP = {
  header: '#8e44ad', title: '#2b6cb0', company: '#1b6ca8', customer: '#0f766e',
  items: '#2f855a', terms: '#c0622d', note: '#b7791f', contact: '#7c3aed',
  sign: '#4a5568', tagline: '#be185d', preview: '#4a5568',
}

// ใบตัวอย่างสำหรับพรีวิว — ตัวเลขสมมติล้วน ใช้แค่ให้เห็นว่าเทมเพลตออกมาหน้าตาแบบไหน
const SAMPLE_QUOT = {
  quot_no: 'QT-2569-0001',
  quot_date: new Date().toISOString().split('T')[0],
  expire_date: new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
  subject: 'ตัวอย่างรายการสินค้า',
  credit_term: 'เงินสด',
  proposer_name: 'ตัวอย่าง ผู้เสนอราคา',
  sale_phone: '',
  note: '',
  discount_type: '', discount_value: 0,
}
const SAMPLE_COMPANY = { name: 'บริษัท ตัวอย่างลูกค้า จำกัด', address: '123 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10000', tax_id: '0000000000000', phone: '02-000-0000' }
const SAMPLE_ITEMS = [
  { description: 'ตู้แช่เย็น 2 ประตู รุ่นตัวอย่าง', quantity: 2, unit_price: 18500, imageUrl: null },
  { description: 'เครื่องซักผ้าฝาหน้า รุ่นตัวอย่าง', quantity: 1, unit_price: 12900, imageUrl: null },
]

function Panel({ title, color, children }) {
  return (
    <div className="ds-panel" style={{ '--p': color }}>
      <div className="ds-panel-h"><span className="ds-dot" />{title}</div>
      <div className="ds-panel-b">{children}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      {children}
    </div>
  )
}

function ColorField({ label, value, onChange }) {
  const [raw, setRaw] = useState(value)
  // จำค่าล่าสุดที่ตัวเองส่งขึ้นไป เพื่อแยกว่า value ที่เปลี่ยนมาจากการพิมพ์ของเราเอง
  // หรือมาจากข้างนอก (เช่นกดทิ้งการแก้ไขแล้วดึงค่าเดิมกลับมา) — กรณีหลังเท่านั้นที่ต้องเขียนทับช่อง
  const emitted = useRef(value)
  useEffect(() => { if (value !== emitted.current) { emitted.current = value; setRaw(value) } }, [value])

  const emit = (v) => { emitted.current = v; onChange(v) }
  // ระหว่างพิมพ์ ส่งค่าขึ้นไปเฉพาะตอนครบ 6 หลัก ไม่ขยายรูปแบบย่อ 3 หลักให้กลางคัน
  // ไม่งั้นพิมพ์ "0f5132" พอถึง "0f5" จะกลายเป็น "#00ff55" คาช่องไว้ แล้วพิมพ์ต่อไม่ได้
  const type = (v) => {
    setRaw(v)
    if (/^#?[0-9a-f]{6}$/i.test(v.trim())) emit(normalizeHexColor(v, value))
  }
  const done = () => { const n = normalizeHexColor(raw, value); setRaw(n); emit(n) }

  return (
    <Field label={label}>
      <div className="ds-color">
        <input type="color" value={value} onChange={e => { setRaw(e.target.value); emit(e.target.value) }} />
        <input type="text" className="form-control" value={raw} spellCheck={false} placeholder="#1b315e"
          onChange={e => type(e.target.value)} onBlur={done} />
      </div>
    </Field>
  )
}

export default function DocumentSettings({ settings = {}, isAdmin, onSaved, onBack }) {
  const { toast } = useUi()
  const { t } = useLanguage()
  const [tpl, setTpl] = useState(() => mergeDocumentTemplate(settings))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [conflict, setConflict] = useState(false)
  const fileRef = useRef(null)

  // ก้อน JSON ที่หน้าจอนี้โหลดมาตอนเปิด — ส่งกลับไปให้ saveDocumentTemplate ใช้ทำ compare-and-swap
  // ถ้าแอดมินอีกคนบันทึกแซงไประหว่างที่เราเปิดหน้าค้างไว้ การบันทึกจะถูกปฏิเสธแทนที่จะทับงานเขาเงียบๆ
  const savedRawRef = useRef(settings[TEMPLATE_SETTING_KEY] ?? null)
  // โลโก้ที่บันทึกลงฐานข้อมูลแล้ว กับโลโก้ที่เพิ่งอัปโหลดแต่ยังไม่ได้กดบันทึก — ใช้รู้ว่าไฟล์ไหนลบทิ้งได้
  const savedLogoRef = useRef(mergeDocumentTemplate(settings).company.logoUrl)
  const pendingLogoRef = useRef(null)

  // settings ถูกโหลดแบบ async ตอนเปิดแอป ถ้าหน้านี้ mount ก่อนโหลดเสร็จจะได้ฟอร์มเปล่า
  // sync ใหม่เฉพาะตอนที่ผู้ใช้ยังไม่ได้แก้อะไร เพื่อไม่ให้ค่าที่กำลังพิมพ์อยู่ถูกเขียนทับ
  useEffect(() => {
    if (dirty) return
    const merged = mergeDocumentTemplate(settings)
    setTpl(merged)
    savedRawRef.current = settings[TEMPLATE_SETTING_KEY] ?? null
    savedLogoRef.current = merged.company.logoUrl
    setConflict(false)
  }, [settings])

  const setCompany = (k, v) => { setDirty(true); setTpl(p => ({ ...p, company: { ...p.company, [k]: v } })) }
  const setQuot = (k, v) => { setDirty(true); setTpl(p => ({ ...p, quotation: { ...p.quotation, [k]: v } })) }
  const setTerms = (fn) => { setDirty(true); setTpl(p => ({ ...p, quotation: { ...p.quotation, terms: fn(p.quotation.terms) } })) }

  // ช่องข้อความบรรทัดเดียวมีเยอะมากในหน้านี้ ย่อให้เรียกได้สั้นๆ จะได้อ่านโครงของฟอร์มออก
  const qField = (key, label) => (
    <Field label={label}>
      <input className="form-control" value={tpl.quotation[key]} onChange={e => setQuot(key, e.target.value)} />
    </Field>
  )
  const cField = (key, label) => (
    <Field label={label}>
      <input className="form-control" value={tpl.company[key]} onChange={e => setCompany(key, e.target.value)} />
    </Field>
  )

  const editTerm = (i, v) => setTerms(ts => ts.map((t2, j) => (j === i ? v : t2)))
  const addTerm = () => setTerms(ts => [...ts, ''])
  const delTerm = (i) => setTerms(ts => ts.filter((_, j) => j !== i))
  const moveTerm = (i, d) => setTerms(ts => {
    const j = i + d
    if (j < 0 || j >= ts.length) return ts
    const out = ts.slice()
      ;[out[i], out[j]] = [out[j], out[i]]
    return out
  })

  // ทิ้งไฟล์ที่อัปโหลดไว้แต่ยังไม่เคยถูกบันทึก — เกิดตอนกดเลือกโลโก้ใหม่ซ้ำหลายรอบก่อนกดบันทึก
  const dropPendingLogo = async () => {
    const url = pendingLogoRef.current
    pendingLogoRef.current = null
    if (url && url !== savedLogoRef.current) { try { await deleteDocumentLogo(url) } catch { /* ไม่ต้องทำอะไร */ } }
  }

  const pickLogo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''            // เลือกไฟล์เดิมซ้ำต้องยิง onChange ได้อีก
    if (!file) return
    if (!file.type.startsWith('image/')) return toast(t('รองรับเฉพาะไฟล์รูปภาพ'), 'error')
    setUploading(true)
    try {
      const url = await uploadDocumentLogo(file)
      await dropPendingLogo()
      pendingLogoRef.current = url
      setCompany('logoUrl', url)
      toast(t('อัปโหลดโลโก้แล้ว — กด "บันทึก" เพื่อใช้งานจริง'))
    } catch (err) { toast(t('อัปโหลดโลโก้ไม่สำเร็จ') + ': ' + err.message, 'error') }
    finally { setUploading(false) }
  }

  const useBuiltInLogo = async () => {
    await dropPendingLogo()
    setCompany('logoUrl', '')
  }

  const save = async () => {
    // เงื่อนไขที่เว้นว่างไว้ถือว่าไม่ได้ตั้งใจใส่ ตัดทิ้งก่อนบันทึก จะได้ไม่มีบรรทัดว่างโผล่บนกระดาษ
    const clean = { ...tpl, quotation: { ...tpl.quotation, terms: tpl.quotation.terms.map(x => x.trim()).filter(Boolean) } }
    if (!clean.company.name.trim()) return toast(t('กรุณากรอกชื่อบริษัท'), 'error')
    setSaving(true)
    try {
      const raw = await saveDocumentTemplate(clean, savedRawRef.current)
      const replaced = savedLogoRef.current
      savedRawRef.current = raw
      savedLogoRef.current = clean.company.logoUrl
      pendingLogoRef.current = null
      setTpl(clean)
      setDirty(false)
      setConflict(false)
      // โลโก้ตัวเก่าไม่มีใครอ้างถึงแล้ว (เอกสารสร้างสดทุกครั้ง ไม่ได้เก็บไฟล์ที่ฝังรูปไว้) จึงลบทิ้งได้
      if (replaced && replaced !== clean.company.logoUrl) { try { await deleteDocumentLogo(replaced) } catch { /* ไม่ต้องทำอะไร */ } }
      onSaved?.()
      toast(t('บันทึกการตั้งค่าเอกสารแล้ว'))
    } catch (e) {
      if (e.message === TEMPLATE_CONFLICT) setConflict(true)
      else toast(t('บันทึกไม่สำเร็จ') + ': ' + e.message, 'error')
    }
    finally { setSaving(false) }
  }

  // ทิ้งสิ่งที่แก้ค้างไว้แล้วดึงค่าล่าสุดจากฐานข้อมูลมาแทน — ใช้ตอนชนกับการแก้ไขของแอดมินอีกคน
  const discardAndReload = async () => {
    await dropPendingLogo()
    setDirty(false)
    setConflict(false)
    setTpl(mergeDocumentTemplate(settings))
    onSaved?.()
  }

  const resetTerms = () => {
    if (!window.confirm(t('คืนค่าเงื่อนไขกลับเป็นชุดตั้งต้นของระบบ ข้อความที่แก้ไว้จะหายทั้งหมด ยืนยันหรือไม่'))) return
    setTerms(() => TEMPLATE_DEFAULTS.quotation.terms.slice())
  }

  // พรีวิวเรียกตัวสร้าง HTML ตัวเดียวกับที่ใช้พิมพ์จริง จึงไม่มีทางที่พรีวิวกับของจริงจะไม่ตรงกัน
  const previewHtml = useMemo(() => {
    try {
      return buildQuotationHtml(
        { ...SAMPLE_QUOT, note: tpl.quotation.defaultNote, sale_phone: tpl.quotation.defaultSalePhone },
        SAMPLE_COMPANY,
        { [TEMPLATE_SETTING_KEY]: JSON.stringify(tpl) },
        templateLogoUrl(tpl, window.location.origin),
        SAMPLE_ITEMS,
        { autoPrint: false },
      )
    } catch (e) { return `<p style="font-family:sans-serif;padding:20px;color:#c0392b">${t('แสดงตัวอย่างไม่ได้')}: ${e.message}</p>` }
  }, [tpl, t])

  const logoSrc = tpl.company.logoUrl || DEFAULT_LOGO_URL

  return (
    <div className="scroll-view">
      <style>{CSS}</style>

      <div className="section-header" style={{ marginBottom: 8 }}>
        <div>
          {/* หน้านี้ไม่มีรายการในเมนูด้านซ้าย เข้ามาจากปุ่มในหน้าใบเสนอราคา จึงต้องมีทางกลับในตัวเอง */}
          {onBack && <button className="btn btn-outline btn-xs" onClick={onBack} style={{ marginBottom: 5 }}>← {t('กลับไปใบเสนอราคา')}</button>}
          <div className="section-title">{t('ตั้งค่าเอกสาร')}</div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
            {saving ? t('กำลังบันทึก...') : dirty ? t('บันทึก') : t('บันทึกแล้ว')}
          </button>
        )}
      </div>

      {conflict && (
        <div className="ds-warn">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('มีผู้ดูแลระบบอีกคนบันทึกการตั้งค่านี้ไปแล้ว')}</div>
          <div>{t('ระบบยังไม่บันทึกของคุณ เพื่อไม่ให้ทับงานของเขา กรุณาคัดลอกข้อความที่แก้ไว้เก็บก่อน แล้วกดปุ่มด้านล่างเพื่อดึงค่าล่าสุดมาแก้ใหม่')}</div>
          <button className="btn btn-outline btn-xs" style={{ marginTop: 8 }} onClick={discardAndReload}>
            {t('ทิ้งที่แก้ไว้ แล้วดึงค่าล่าสุด')}
          </button>
        </div>
      )}

      {!isAdmin && (
        <div className="ds-warn">{t('หน้านี้ดูได้อย่างเดียว การแก้ไขเทมเพลตเอกสารสงวนไว้สำหรับผู้ดูแลระบบ')}</div>
      )}

      <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="ds-grid">
          {/* ===== ซ้าย: ช่องกรอกทั้งหมด เรียงตามลำดับที่ปรากฏบนกระดาษจากบนลงล่าง ===== */}
          <div>
            <Panel title={t('หัวกระดาษ')} color={GROUP.header}>
              <div className="ds-row">
                <ColorField label={t('สีเอกสาร')} value={tpl.company.brandColor} onChange={v => setCompany('brandColor', v)} />
                <Field label={t('โลโก้')}>
                  <div className="ds-logo-row">
                    <div className="ds-logo-box"><img src={logoSrc} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden' }} /></div>
                    <div className="ds-logo-btns">
                      <button type="button" className="btn btn-outline btn-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
                        {uploading ? t('กำลังอัปโหลด...') : t('เลือกไฟล์โลโก้')}
                      </button>
                      {tpl.company.logoUrl && (
                        <button type="button" className="btn btn-outline btn-xs" onClick={useBuiltInLogo}>{t('ใช้โลโก้เดิมของระบบ')}</button>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickLogo} />
                  </div>
                </Field>
              </div>
            </Panel>

            <Panel title={t('หัวข้อ ใบเสนอราคา')} color={GROUP.title}>
              <div className="ds-row">
                {qField('titleTh', t('ภาษาไทย'))}
                {qField('titleEn', t('ภาษาอังกฤษ'))}
              </div>
            </Panel>

            <Panel title={t('ข้อมูลบริษัท', 'Company details')} color={GROUP.company}>
              {cField('name', t('ชื่อบริษัท'))}
              <Field label={t('ที่อยู่')}>
                <textarea className="form-control" rows={2} value={tpl.company.address} onChange={e => setCompany('address', e.target.value)} />
              </Field>
              <div className="ds-row">
                {qField('taxIdLabel', t('คำนำหน้าเลขผู้เสียภาษี'))}
                {cField('taxId', t('เลขประจำตัวผู้เสียภาษี'))}
              </div>
            </Panel>

            <Panel title={t('ข้อมูลลูกค้า', 'Customer block')} color={GROUP.customer}>
              {qField('customerLabel', t('หัวข้อส่วนลูกค้า'))}
            </Panel>

            <Panel title={t('ข้อมูลสินค้า', 'Items table')} color={GROUP.items}>
              <div className="ds-row-3">
                {qField('colQty', t('คอลัมน์จำนวน'))}
                {qField('colItem', t('คอลัมน์รายการ'))}
                {qField('colUnitPrice', t('คอลัมน์ราคาต่อหน่วย'))}
              </div>
              <div className="ds-row">
                {qField('colDiscount', t('คอลัมน์ส่วนลด'))}
                {qField('colTotal', t('คอลัมน์ยอดรวม'))}
              </div>
            </Panel>

            <Panel title={t('เงื่อนไข')} color={GROUP.terms}>
              <div className="ds-row">
                {qField('termsTitle', t('หัวข้อส่วนเงื่อนไข'))}
                {qField('termsBullet', t('สัญลักษณ์นำหน้าแต่ละข้อ'))}
              </div>
              {tpl.quotation.terms.map((term, i) => (
                <div className="ds-term" key={i}>
                  <div className="ds-term-no">{i + 1}.</div>
                  <textarea className="form-control" value={term} onChange={e => editTerm(i, e.target.value)} />
                  <div className="ds-term-btns">
                    <button type="button" className="ds-mini" title={t('เลื่อนขึ้น')} disabled={i === 0} onClick={() => moveTerm(i, -1)}>↑</button>
                    <button type="button" className="ds-mini" title={t('เลื่อนลง')} disabled={i === tpl.quotation.terms.length - 1} onClick={() => moveTerm(i, 1)}>↓</button>
                    <button type="button" className="ds-mini del" title={t('ลบข้อนี้')} onClick={() => delTerm(i)}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-outline btn-xs" onClick={addTerm}>+ {t('เพิ่มเงื่อนไข')}</button>
                <button type="button" className="btn btn-outline btn-xs" onClick={resetTerms}>{t('คืนค่าตั้งต้น')}</button>
              </div>
            </Panel>

            <Panel title={t('หมายเหตุ')} color={GROUP.note}>
              {qField('noteTitle', t('หัวข้อส่วนหมายเหตุ'))}
              <Field label={t('หมายเหตุตั้งต้น')}>
                <textarea className="form-control" rows={4} value={tpl.quotation.defaultNote} onChange={e => setQuot('defaultNote', e.target.value)} />
              </Field>
            </Panel>

            <Panel title={t('ข้อมูลเพิ่มเติม')} color={GROUP.contact}>
              {qField('contactTitle', t('หัวข้อส่วนติดต่อ'))}
              <div className="ds-row-3">
                {cField('line', 'Line@')}
                {cField('phone', t('เบอร์โทร'))}
                {cField('email', t('อีเมล'))}
              </div>
              {qField('defaultSalePhone', t('เบอร์ติดต่อเซลล์ตั้งต้น'))}
            </Panel>

            <Panel title={t('ป้ายลายเซ็น')} color={GROUP.sign}>
              <div className="ds-row">
                {qField('signLeftLabel', t('ด้านซ้าย'))}
                {qField('signRightLabel', t('ด้านขวา'))}
              </div>
            </Panel>

            <Panel title={t('สโลแกนท้ายกระดาษ')} color={GROUP.tagline}>
              <div className="ds-row">
                {cField('taglineTh', t('ภาษาไทย'))}
                {cField('taglineEn', t('ภาษาอังกฤษ'))}
              </div>
            </Panel>
          </div>

          {/* ===== ขวา: ตัวอย่างเอกสารอย่างเดียว ปักหมุดไว้ให้เห็นตลอดที่เลื่อนกรอก ===== */}
          <div>
            <div className="ds-preview-wrap">
              <Panel title={t('ตัวอย่างเอกสาร')} color={GROUP.preview}>
                <iframe className="ds-preview" title={t('ตัวอย่างใบเสนอราคา')} srcDoc={previewHtml} />
              </Panel>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  )
}
