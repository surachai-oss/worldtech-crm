import { useEffect, useMemo, useRef, useState } from 'react'
import { saveDocumentTemplate, uploadDocumentLogo } from '../lib/api'
import { mergeDocumentTemplate, templateLogoUrl, TEMPLATE_DEFAULTS, DEFAULT_LOGO_URL, TEMPLATE_SETTING_KEY } from '../lib/documentTemplate'
import { buildQuotationHtml } from '../lib/printQuotation'
import { useUi } from './UiContext'

// หน้า "ตั้งค่าเอกสาร" — แอดมินแก้หัวกระดาษ โลโก้ เงื่อนไข และหมายเหตุตั้งต้นของใบเสนอราคาได้เอง
// โดยไม่ต้องแก้โค้ดและไม่ต้อง deploy ใหม่ ค่าทั้งหมดเก็บในตาราง settings คีย์ DOCUMENT_TEMPLATE
//
// สิ่งที่หน้านี้ "ไม่" ควบคุม โดยตั้งใจ: ตารางรายการสินค้า ราคาต่อหน่วย ส่วนลด VAT และยอดรวม
// ทั้งหมดนั้นยังคำนวณจากข้อมูลจริงของใบเสนอราคาเหมือนเดิม การแก้เทมเพลตจึงเปลี่ยนแค่รูปเล่มเอกสาร
//
// ข้อควรรู้: PDF สร้างสดทุกครั้งที่กดพิมพ์ ไม่ได้เก็บไฟล์ไว้ตอนออกใบ
// แก้เงื่อนไขวันนี้แล้วย้อนไปพิมพ์ใบเก่า จะได้เงื่อนไขชุดใหม่ — จงใจให้เป็นแบบนี้ เพราะที่อยู่/โลโก้บริษัท
// ควรเป็นของปัจจุบันเสมอ ถ้าภายหลังต้องการล็อกเงื่อนไขไว้กับใบแต่ละใบ ต้องเพิ่มคอลัมน์เก็บสำเนาในตาราง quotations

const CSS = `
.ds-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
@media(max-width:1100px){.ds-grid{grid-template-columns:1fr}}
.ds-panel{background:var(--white,#fff);border:1px solid var(--border,#e3e8ef);border-radius:8px;margin-bottom:16px}
.ds-panel-h{padding:10px 14px;border-bottom:1px solid var(--border,#e3e8ef);font-weight:600;font-size:13px}
.ds-panel-b{padding:14px}
.ds-hint{font-size:11.5px;color:var(--text-light,#7a8699);margin-top:4px;line-height:1.5}
.ds-term{display:flex;gap:8px;align-items:flex-start;margin-bottom:8px}
.ds-term-no{width:22px;text-align:right;padding-top:9px;font-size:12px;color:var(--text-light,#7a8699);flex-shrink:0}
.ds-term textarea{flex:1;min-height:48px;resize:vertical}
.ds-term-btns{display:flex;flex-direction:column;gap:2px;flex-shrink:0}
.ds-mini{border:1px solid var(--border,#e3e8ef);background:#fff;border-radius:4px;width:26px;height:22px;cursor:pointer;font-size:11px;line-height:1;padding:0}
.ds-mini:disabled{opacity:.35;cursor:default}
.ds-mini.del{color:#c0392b}
.ds-logo-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.ds-logo-box{width:150px;height:60px;border:1px dashed var(--border,#e3e8ef);border-radius:6px;display:flex;align-items:center;justify-content:center;background:#fafbfc;overflow:hidden}
.ds-logo-box img{max-width:100%;max-height:100%;object-fit:contain}
.ds-preview-wrap{position:sticky;top:0}
.ds-preview-wrap .ds-panel{margin-bottom:0}
.ds-preview{width:100%;height:calc(100vh - 190px);min-height:420px;border:1px solid var(--border,#e3e8ef);border-radius:8px;background:#fff}
`

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

function Panel({ title, children }) {
  return (
    <div className="ds-panel">
      <div className="ds-panel-h">{title}</div>
      <div className="ds-panel-b">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="ds-hint">{hint}</div>}
    </div>
  )
}

export default function DocumentSettings({ settings = {}, isAdmin, onSaved, onBack }) {
  const { toast } = useUi()
  const [tpl, setTpl] = useState(() => mergeDocumentTemplate(settings))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dirty, setDirty] = useState(false)
  const fileRef = useRef(null)

  // settings ถูกโหลดแบบ async ตอนเปิดแอป ถ้าหน้านี้ mount ก่อนโหลดเสร็จจะได้ฟอร์มเปล่า
  // sync ใหม่เฉพาะตอนที่ผู้ใช้ยังไม่ได้แก้อะไร เพื่อไม่ให้ค่าที่กำลังพิมพ์อยู่ถูกเขียนทับ
  useEffect(() => { if (!dirty) setTpl(mergeDocumentTemplate(settings)) }, [settings])

  const setCompany = (k, v) => { setDirty(true); setTpl(p => ({ ...p, company: { ...p.company, [k]: v } })) }
  const setQuot = (k, v) => { setDirty(true); setTpl(p => ({ ...p, quotation: { ...p.quotation, [k]: v } })) }
  const setTerms = (fn) => { setDirty(true); setTpl(p => ({ ...p, quotation: { ...p.quotation, terms: fn(p.quotation.terms) } })) }

  const editTerm = (i, v) => setTerms(ts => ts.map((t, j) => (j === i ? v : t)))
  const addTerm = () => setTerms(ts => [...ts, ''])
  const delTerm = (i) => setTerms(ts => ts.filter((_, j) => j !== i))
  const moveTerm = (i, d) => setTerms(ts => {
    const j = i + d
    if (j < 0 || j >= ts.length) return ts
    const out = ts.slice()
      ;[out[i], out[j]] = [out[j], out[i]]
    return out
  })

  const pickLogo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''            // เลือกไฟล์เดิมซ้ำต้องยิง onChange ได้อีก
    if (!file) return
    if (!file.type.startsWith('image/')) return toast('รองรับเฉพาะไฟล์รูปภาพ', 'error')
    setUploading(true)
    try {
      const url = await uploadDocumentLogo(file)
      setCompany('logoUrl', url)
      toast('อัปโหลดโลโก้แล้ว — กด "บันทึก" เพื่อใช้งานจริง')
    } catch (err) { toast('อัปโหลดโลโก้ไม่สำเร็จ: ' + err.message, 'error') }
    finally { setUploading(false) }
  }

  const save = async () => {
    // เงื่อนไขที่เว้นว่างไว้ถือว่าไม่ได้ตั้งใจใส่ ตัดทิ้งก่อนบันทึก จะได้ไม่มีบรรทัดว่างโผล่บนกระดาษ
    const clean = { ...tpl, quotation: { ...tpl.quotation, terms: tpl.quotation.terms.map(t => t.trim()).filter(Boolean) } }
    if (!clean.company.name.trim()) return toast('กรุณากรอกชื่อบริษัท', 'error')
    setSaving(true)
    try {
      await saveDocumentTemplate(clean)
      setTpl(clean)
      setDirty(false)
      onSaved?.()
      toast('บันทึกการตั้งค่าเอกสารแล้ว')
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const resetTerms = () => {
    if (!window.confirm('คืนค่าเงื่อนไขกลับเป็นชุดตั้งต้นของระบบ ข้อความที่แก้ไว้จะหายทั้งหมด ยืนยันหรือไม่')) return
    setTerms(() => TEMPLATE_DEFAULTS.quotation.terms.slice())
  }

  // พรีวิวเรียกตัวสร้าง HTML ตัวเดียวกับที่ใช้พิมพ์จริง จึงไม่มีทางที่พรีวิวกับของจริงจะไม่ตรงกัน
  const previewHtml = useMemo(() => {
    try {
      // ส่งเทมเพลตที่กำลังแก้อยู่เข้าไปในรูปเดียวกับที่เก็บใน settings จริง (คีย์ DOCUMENT_TEMPLATE)
      // พรีวิวจึงเดินเส้นทางเดียวกับตอนพิมพ์จริงทุกขั้น ไม่ใช่ทางลัดที่อาจเพี้ยนจากของจริง
      return buildQuotationHtml(
        { ...SAMPLE_QUOT, note: tpl.quotation.defaultNote, sale_phone: tpl.quotation.defaultSalePhone },
        SAMPLE_COMPANY,
        { [TEMPLATE_SETTING_KEY]: JSON.stringify(tpl) },
        templateLogoUrl(tpl, window.location.origin),
        SAMPLE_ITEMS,
        { autoPrint: false },
      )
    } catch (e) { return `<p style="font-family:sans-serif;padding:20px;color:#c0392b">แสดงตัวอย่างไม่ได้: ${e.message}</p>` }
  }, [tpl])

  const logoSrc = tpl.company.logoUrl || DEFAULT_LOGO_URL

  return (
    <div className="scroll-view">
      <style>{CSS}</style>

      <div className="section-header">
        <div>
          {/* หน้านี้ไม่มีรายการในเมนูด้านซ้าย เข้ามาจากปุ่มในหน้าใบเสนอราคา จึงต้องมีทางกลับในตัวเอง */}
          {onBack && <button className="btn btn-outline btn-xs" onClick={onBack} style={{ marginBottom: 6 }}>← กลับไปใบเสนอราคา</button>}
          <div className="section-title">ตั้งค่าเอกสาร</div>
          <div className="ds-hint" style={{ marginTop: 2 }}>
            หัวกระดาษ โลโก้ เงื่อนไข และหมายเหตุตั้งต้นของใบเสนอราคา — แก้ที่นี่แล้วมีผลกับเอกสารที่พิมพ์ครั้งต่อไปทันที
            ส่วนรายการสินค้าและราคายังดึงจากข้อมูลจริงเหมือนเดิม
          </div>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
            {saving ? 'กำลังบันทึก...' : dirty ? 'บันทึก' : 'บันทึกแล้ว'}
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="ds-panel" style={{ borderColor: '#f0c36d', background: '#fffaf0' }}>
          <div className="ds-panel-b" style={{ fontSize: 12.5 }}>
            หน้านี้ดูได้อย่างเดียว การแก้ไขเทมเพลตเอกสารสงวนไว้สำหรับผู้ดูแลระบบ
          </div>
        </div>
      )}

      <fieldset disabled={!isAdmin} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="ds-grid">
          {/* ===== ซ้าย: ตัวแก้ไข ===== */}
          <div>
            <Panel title="ข้อมูลบริษัทบนหัวเอกสาร">
              <Field label="โลโก้" hint="แนะนำไฟล์ PNG พื้นหลังโปร่ง สูงประมาณ 120 พิกเซลขึ้นไป ระบบย่อให้พอดีหัวกระดาษเอง">
                <div className="ds-logo-row">
                  <div className="ds-logo-box"><img src={logoSrc} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden' }} /></div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-outline btn-xs" disabled={uploading} onClick={() => fileRef.current?.click()}>
                      {uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์โลโก้'}
                    </button>
                    {tpl.company.logoUrl && (
                      <button type="button" className="btn btn-outline btn-xs" onClick={() => setCompany('logoUrl', '')}>ใช้โลโก้เดิมของระบบ</button>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pickLogo} />
                </div>
              </Field>

              <Field label="ชื่อบริษัท">
                <input className="form-control" value={tpl.company.name} onChange={e => setCompany('name', e.target.value)} />
              </Field>
              <Field label="ที่อยู่" hint="ขึ้นบรรทัดใหม่ได้ ระบบจะพิมพ์ตามบรรทัดที่กรอก">
                <textarea className="form-control" rows={3} value={tpl.company.address} onChange={e => setCompany('address', e.target.value)} />
              </Field>
              <Field label="เลขประจำตัวผู้เสียภาษี">
                <input className="form-control" value={tpl.company.taxId} onChange={e => setCompany('taxId', e.target.value)} />
              </Field>
              <Field label="เบอร์โทร">
                <input className="form-control" value={tpl.company.phone} onChange={e => setCompany('phone', e.target.value)} />
              </Field>
              <Field label="อีเมล">
                <input className="form-control" value={tpl.company.email} onChange={e => setCompany('email', e.target.value)} />
              </Field>
              <Field label="Line@" hint="ข้อมูลชุดนี้ใช้ร่วมกันทั้งใบเสนอราคาและใบอนุมัติตรวจสอบยอดโอน">
                <input className="form-control" value={tpl.company.line} onChange={e => setCompany('line', e.target.value)} />
              </Field>
            </Panel>

            <Panel title="เงื่อนไขการเสนอราคาและการสั่งซื้อ">
              <Field label="หัวข้อของกล่องเงื่อนไข">
                <input className="form-control" value={tpl.quotation.termsTitle} onChange={e => setQuot('termsTitle', e.target.value)} />
              </Field>
              <Field label="สัญลักษณ์นำหน้าแต่ละข้อ" hint='เว้นว่างได้ถ้าไม่ต้องการสัญลักษณ์นำหน้า'>
                <input className="form-control" style={{ maxWidth: 90 }} value={tpl.quotation.termsBullet} onChange={e => setQuot('termsBullet', e.target.value)} />
              </Field>

              <label className="form-label">รายการเงื่อนไข</label>
              {tpl.quotation.terms.length === 0 && (
                <div className="ds-hint" style={{ marginBottom: 8 }}>ยังไม่มีเงื่อนไข — เอกสารจะไม่พิมพ์กล่องนี้เลย</div>
              )}
              {tpl.quotation.terms.map((term, i) => (
                <div className="ds-term" key={i}>
                  <div className="ds-term-no">{i + 1}.</div>
                  <textarea className="form-control" value={term} onChange={e => editTerm(i, e.target.value)} />
                  <div className="ds-term-btns">
                    <button type="button" className="ds-mini" title="เลื่อนขึ้น" disabled={i === 0} onClick={() => moveTerm(i, -1)}>↑</button>
                    <button type="button" className="ds-mini" title="เลื่อนลง" disabled={i === tpl.quotation.terms.length - 1} onClick={() => moveTerm(i, 1)}>↓</button>
                    <button type="button" className="ds-mini del" title="ลบข้อนี้" onClick={() => delTerm(i)}>✕</button>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button type="button" className="btn btn-outline btn-xs" onClick={addTerm}>+ เพิ่มเงื่อนไข</button>
                <button type="button" className="btn btn-outline btn-xs" onClick={resetTerms}>คืนค่าตั้งต้น</button>
              </div>
              <div className="ds-hint" style={{ marginTop: 10 }}>
                เอกสาร PDF ถูกสร้างใหม่ทุกครั้งที่กดพิมพ์ การแก้เงื่อนไขจึงมีผลกับใบเสนอราคาเก่าที่นำกลับมาพิมพ์ซ้ำด้วย
              </div>
            </Panel>
            <Panel title="หัวข้อและคำบนกระดาษ">
              <Field label="ชื่อเอกสาร (ไทย)">
                <input className="form-control" value={tpl.quotation.titleTh} onChange={e => setQuot('titleTh', e.target.value)} />
              </Field>
              <Field label="ชื่อเอกสาร (อังกฤษ)">
                <input className="form-control" value={tpl.quotation.titleEn} onChange={e => setQuot('titleEn', e.target.value)} />
              </Field>
              <Field label="คำนำหน้าเลขผู้เสียภาษี">
                <input className="form-control" value={tpl.quotation.taxIdLabel} onChange={e => setQuot('taxIdLabel', e.target.value)} />
              </Field>
              <Field label="หัวข้อกล่องลูกค้า">
                <input className="form-control" value={tpl.quotation.customerLabel} onChange={e => setQuot('customerLabel', e.target.value)} />
              </Field>
              <Field label="หัวข้อกล่องหมายเหตุ">
                <input className="form-control" value={tpl.quotation.noteTitle} onChange={e => setQuot('noteTitle', e.target.value)} />
              </Field>
              <Field label="หัวข้อกล่องติดต่อ">
                <input className="form-control" value={tpl.quotation.contactTitle} onChange={e => setQuot('contactTitle', e.target.value)} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="ป้ายลายเซ็นซ้าย">
                  <input className="form-control" value={tpl.quotation.signLeftLabel} onChange={e => setQuot('signLeftLabel', e.target.value)} />
                </Field>
                <Field label="ป้ายลายเซ็นขวา">
                  <input className="form-control" value={tpl.quotation.signRightLabel} onChange={e => setQuot('signRightLabel', e.target.value)} />
                </Field>
              </div>
            </Panel>
          </div>

          {/* ===== ขวา: ค่าตั้งต้น หัวข้อบนกระดาษ และตัวอย่าง ===== */}
          <div>
            <Panel title="ค่าตั้งต้นของใบเสนอราคาใหม่">
              <Field label="หมายเหตุตั้งต้น" hint="เติมให้อัตโนมัติในช่องหมายเหตุตอนสร้างใบใหม่ เซลล์ยังแก้เป็นรายใบได้ตามปกติ และใบที่ออกไปแล้วไม่ถูกกระทบ">
                <textarea className="form-control" rows={6} value={tpl.quotation.defaultNote} onChange={e => setQuot('defaultNote', e.target.value)} />
              </Field>
              <Field label="เบอร์ติดต่อเซลล์ตั้งต้น">
                <input className="form-control" value={tpl.quotation.defaultSalePhone} onChange={e => setQuot('defaultSalePhone', e.target.value)} />
              </Field>
            </Panel>


            <div className="ds-preview-wrap">
              <Panel title="ตัวอย่างเอกสาร (ข้อมูลสินค้าและราคาเป็นตัวอย่างสมมติ)">
                <iframe className="ds-preview" title="ตัวอย่างใบเสนอราคา" srcDoc={previewHtml} />
              </Panel>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  )
}
