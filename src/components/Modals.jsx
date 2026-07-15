import { useEffect, useState } from 'react'
import EditableSelect from './EditableSelect'
import SearchableSelect from './SearchableSelect'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import { listProducts, listDealItems, listQuotationItems, computeDealTotals, getProductImageUrl } from '../lib/api'
import DiscountField from './DiscountField'
import { POSITION_OPTIONS, BUSINESS_TYPE_OTHER, BUSINESS_TYPE_OPTIONS, APPLIANCE_OTHER, APPLIANCE_OPTIONS, PURCHASE_REASON_OPTIONS } from '../lib/leadOptions'

function Field({ label, required, children }) {
  return (
    <div className="form-group">
      <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
      {children}
    </div>
  )
}

function CompanySelect({ companies, value, onChange }) {
  const { lang } = useLanguage()
  return (
    <SearchableSelect
      options={companies}
      value={value}
      onChange={onChange}
      placeholder={lang === 'en' ? '-- Select a company (type to search) --' : '-- เลือกบริษัท (พิมพ์เพื่อค้นหา) --'}
      getOptionLabel={c => c.name}
    />
  )
}

function ModalShell({ title, onClose, onSave, saveLabel = 'บันทึก', children, wide }) {
  const { t } = useLanguage()
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={wide ? { maxWidth: 720 } : undefined}>
        <div className="modal-header">
          <div className="modal-title">{t(title)}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('ยกเลิก')}</button>
          <button className="btn btn-primary" onClick={onSave}>{t(saveLabel)}</button>
        </div>
      </div>
    </div>
  )
}

export function CompanyModal({ initial, isAdmin, onClose, onSave }) {
  const { t, lang } = useLanguage()
  const [f, setF] = useState(() => {
    const base = { name: '', customer_type: 'นิติบุคคล/บริษัท', industry: '', status: 'Active', phone: '', email: '', website: '', address: '', tax_id: '', owner: '', lead_source: '', credit_term: '', note: '' }
    return initial ? { ...base, ...initial } : base
  })
  const [files, setFiles] = useState([])
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const onFilesChange = (e) => setFiles(Array.from(e.target.files || []))

  // บุคคลธรรมดา (ลูกค้าซื้อไปใช้เอง) ใช้ฟอร์มย่อกว่า — ไม่บังคับอุตสาหกรรม/เว็บไซต์/เลขผู้เสียภาษีที่มีแต่นิติบุคคล
  const isIndividual = f.customer_type === 'บุคคลธรรมดา'

  return (
    <ModalShell title={initial?.id ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'} onClose={onClose} onSave={() => onSave(f, files)}>
      <Field label={t('ประเภทลูกค้า')}>
        <EditableSelect listKey="customer_types" value={f.customer_type} onChange={v => setF(s => ({ ...s, customer_type: v }))} isAdmin={isAdmin} />
      </Field>
      <Field label={isIndividual ? t('ชื่อ-นามสกุล') : t('ชื่อบริษัท')} required>
        <input className="form-control" value={f.name} onChange={set('name')} placeholder={isIndividual ? t('ชื่อ-นามสกุลลูกค้า') : t('บริษัท ตัวอย่าง จำกัด')} />
      </Field>
      <Field label={t('เอกสารแนบ (ภพ20, หนังสือรับรองบริษัท ฯลฯ)')}>
        <input className="form-control" type="file" multiple onChange={onFilesChange} />
        {files.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
            {lang === 'en' ? `Selected ${files.length} file(s): ` : `เลือกแล้ว ${files.length} ไฟล์: `}{files.map(file => file.name).join(', ')}
          </div>
        )}
      </Field>
      <div className="form-row">
        {!isIndividual && (
          <Field label={t('อุตสาหกรรม')}>
            <EditableSelect listKey="industries" value={f.industry} onChange={v => setF(s => ({ ...s, industry: v }))} isAdmin={isAdmin} />
          </Field>
        )}
        <Field label={t('สถานะ')}>
          <EditableSelect listKey="company_statuses" value={f.status} onChange={v => setF(s => ({ ...s, status: v }))} isAdmin={isAdmin} />
        </Field>
      </div>
      <div className="form-row">
        <Field label={t('โทรศัพท์')}><input className="form-control" value={f.phone || ''} onChange={set('phone')} placeholder="02-xxx-xxxx" /></Field>
        <Field label={t('อีเมล')}><input className="form-control" type="email" value={f.email || ''} onChange={set('email')} /></Field>
      </div>
      {!isIndividual && <Field label={t('เว็บไซต์')}><input className="form-control" value={f.website || ''} onChange={set('website')} placeholder="https://www.company.com" /></Field>}
      <Field label={t('ที่อยู่')}><textarea className="form-control" rows={2} value={f.address || ''} onChange={set('address')} /></Field>
      <div className="form-row">
        {!isIndividual && <Field label={t('เลขประจำตัวผู้เสียภาษี')}><input className="form-control" value={f.tax_id || ''} onChange={set('tax_id')} placeholder="0-0000-00000-00-0" /></Field>}
        <Field label={t('ผู้รับผิดชอบ')}><input className="form-control" value={f.owner || ''} onChange={set('owner')} /></Field>
      </div>
      <Field label={t('ที่มา')}>
        <EditableSelect listKey="lead_sources" value={f.lead_source} onChange={v => setF(s => ({ ...s, lead_source: v }))} placeholder={t('-- ไม่ระบุ --')} isAdmin={isAdmin} />
      </Field>
      <Field label={t('เงื่อนไขเครดิต')}>
        <EditableSelect listKey="credit_terms" value={f.credit_term} onChange={v => setF(s => ({ ...s, credit_term: v }))} placeholder={t('-- ไม่ใช่ลูกค้าเครดิต (เงินสด) --')} isAdmin={isAdmin} />
      </Field>
      <Field label={t('หมายเหตุ')}><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}

export function ContactModal({ initial, companies, defaultCompanyId, onClose, onSave }) {
  const { t } = useLanguage()
  const [f, setF] = useState(() => initial || { company_id: defaultCompanyId || '', full_name: '', position: '', department: '', phone: '', email: '', line_id: '', note: '' })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  return (
    <ModalShell title={initial?.id ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อ'} onClose={onClose} onSave={() => onSave(f)}>
      <Field label={t('บริษัท')}><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v }))} /></Field>
      <div className="form-row">
        <Field label={t('ชื่อ-นามสกุล')} required><input className="form-control" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label={t('ตำแหน่ง')}><input className="form-control" value={f.position || ''} onChange={set('position')} /></Field>
      </div>
      <div className="form-row">
        <Field label={t('แผนก')}><input className="form-control" value={f.department || ''} onChange={set('department')} /></Field>
        <Field label="Line ID"><input className="form-control" value={f.line_id || ''} onChange={set('line_id')} /></Field>
      </div>
      <div className="form-row">
        <Field label={t('โทรศัพท์')}><input className="form-control" value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label={t('อีเมล')}><input className="form-control" type="email" value={f.email || ''} onChange={set('email')} /></Field>
      </div>
      <Field label={t('หมายเหตุ')}><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}

// ให้เซลล์กรอกผู้ติดต่อ/ลีดเองตอนลูกค้าทักมาเอง หรือได้นามบัตรมาจากงานอีเวนต์ ฯลฯ — ฟิลด์เดียวกับฟอร์มสาธารณะ /lead ทุกอย่าง
// ต่างจากฟอร์มสาธารณะที่ status เริ่มที่ "ใหม่" เสมอ — ที่นี่ default เป็น "ติดต่อแล้ว" เพราะเซลล์คุยกับลูกค้าไปแล้วก่อนจะมากรอก แก้เป็นอย่างอื่นได้ถ้าไม่ตรง
export function LeadModal({ initial, isAdmin, onClose, onSave }) {
  const { t } = useLanguage()
  const [f, setF] = useState(() => {
    const base = {
      subject: '', full_name: '', phone: '', email: '', position: '', business_type: '', businessTypeOther: '',
      appliance_interest: [], applianceOther: '', purchase_reason: '', message: '', source: '', status: 'ติดต่อแล้ว'
    }
    if (!initial) return base
    // ค่าเก่าที่เคยพิมพ์ระบุเอง (ไม่ตรงกับตัวเลือกคงที่) ให้ถือเป็น "อื่นๆ" แล้วเติมข้อความเดิมไว้ในช่องระบุ
    const customAppliance = (initial.appliance_interest || []).filter(v => !APPLIANCE_OPTIONS.includes(v))
    const knownAppliance = (initial.appliance_interest || []).filter(v => APPLIANCE_OPTIONS.includes(v))
    return {
      ...base, ...initial,
      businessTypeOther: BUSINESS_TYPE_OPTIONS.includes(initial.business_type) ? '' : (initial.business_type || ''),
      appliance_interest: customAppliance.length ? [...knownAppliance, APPLIANCE_OTHER] : knownAppliance,
      applianceOther: customAppliance.join(', '),
    }
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const toggleAppliance = (value) => setF(s => ({
    ...s,
    appliance_interest: s.appliance_interest.includes(value) ? s.appliance_interest.filter(v => v !== value) : [...s.appliance_interest, value]
  }))

  const isOtherBusiness = f.business_type === BUSINESS_TYPE_OTHER || (f.businessTypeOther && !BUSINESS_TYPE_OPTIONS.includes(f.business_type))
  const isOtherAppliance = f.appliance_interest.includes(APPLIANCE_OTHER)

  const submit = () => {
    const { businessTypeOther, applianceOther, ...rest } = f
    const appliance_interest = f.appliance_interest.filter(v => v !== APPLIANCE_OTHER)
    if (isOtherAppliance && applianceOther.trim()) appliance_interest.push(applianceOther.trim())
    onSave({ ...rest, business_type: isOtherBusiness ? businessTypeOther.trim() : (f.business_type || null), appliance_interest })
  }

  return (
    <ModalShell title={initial?.id ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อ'} onClose={onClose} onSave={submit}>
      <div className="form-row">
        <Field label={t('ชื่อ-นามสกุล')} required><input className="form-control" value={f.full_name} onChange={set('full_name')} placeholder={t('เช่น สมชาย ใจดี')} /></Field>
        <Field label={t('เบอร์โทรศัพท์')} required><input className="form-control" value={f.phone} onChange={set('phone')} placeholder="08x-xxx-xxxx" /></Field>
      </div>
      <Field label={t('อีเมล')}><input className="form-control" type="email" value={f.email || ''} onChange={set('email')} placeholder={t('ไม่บังคับ')} /></Field>
      <Field label={t('หัวข้อที่ติดต่อ')} required><input className="form-control" value={f.subject} onChange={set('subject')} placeholder={t('เช่น สอบถามราคาเครื่องฟอกอากาศ')} /></Field>
      <div className="form-row">
        <Field label={t('ตำแหน่ง')}>
          <select className="form-control" value={f.position || ''} onChange={set('position')}>
            <option value="">{t('-- เลือก --')}</option>
            {POSITION_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label={t('เหตุผลในการซื้อ')}>
          <select className="form-control" value={f.purchase_reason || ''} onChange={set('purchase_reason')}>
            <option value="">{t('-- เลือก --')}</option>
            {PURCHASE_REASON_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t('ประเภทธุรกิจ')}>
        <select className="form-control" value={f.business_type || ''} onChange={set('business_type')}>
          <option value="">{t('-- เลือก --')}</option>
          {BUSINESS_TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        {isOtherBusiness && (
          <input className="form-control" style={{ marginTop: 8 }} value={f.businessTypeOther} onChange={set('businessTypeOther')} placeholder={t('ระบุประเภทธุรกิจ')} />
        )}
      </Field>
      <Field label={t('ประเภทเครื่องใช้ไฟฟ้าที่สนใจ (เลือกได้หลายข้อ)')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          {APPLIANCE_OPTIONS.map(v => (
            <label key={v} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={f.appliance_interest.includes(v)} onChange={() => toggleAppliance(v)} /> {v}
            </label>
          ))}
        </div>
        {isOtherAppliance && (
          <input className="form-control" style={{ marginTop: 8 }} value={f.applianceOther} onChange={set('applianceOther')} placeholder={t('ระบุเครื่องใช้ไฟฟ้าที่สนใจ')} />
        )}
      </Field>
      <div className="form-row">
        <Field label={t('ที่มา')}>
          <EditableSelect listKey="lead_sources" value={f.source} onChange={v => setF(s => ({ ...s, source: v }))} placeholder={t('-- ไม่ระบุ --')} isAdmin={isAdmin} />
        </Field>
        <Field label={t('สถานะ')}>
          <EditableSelect listKey="lead_statuses" value={f.status} onChange={v => setF(s => ({ ...s, status: v }))} isAdmin={isAdmin} />
        </Field>
      </div>
      <Field label={t('ข้อความเพิ่มเติม')}><textarea className="form-control" rows={2} value={f.message || ''} onChange={set('message')} placeholder={t('ไม่บังคับ')} /></Field>
    </ModalShell>
  )
}

// แถวรายการสินค้าว่างเปล่า 1 แถวเริ่มต้น — quantity เริ่มที่ 1 เพื่อลดการพิมพ์ซ้ำๆ
const EMPTY_ITEM = { product_id: '', description: '', quantity: 1, unit_price: '' }

export function DealModal({ initial, companies, defaultCompanyId, defaultStage, isAdmin, onClose, onSave }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [f, setF] = useState(() => {
    const base = { company_id: defaultCompanyId || '', name: '', stage: defaultStage || 'Lead', close_date: '', follow_up_date: '', source: '', owner: '', note: '', discount_type: '', discount_value: 0 }
    if (!initial) return base
    const { items: _seedItems, ...rest } = initial // items เป็นแค่ค่าตั้งต้นสำหรับ seed ไม่ใช่คอลัมน์ในตาราง deals ตัดออกก่อนเก็บใน f
    return { ...base, ...rest }
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const [products, setProducts] = useState(null) // null = กำลังโหลดรายการสินค้า
  // initial.items = รายการที่ก็อปมาจากใบเสนอราคา (ตอนยังไม่มี initial.id) — ถ้ามีให้ใช้เป็นค่าเริ่มต้นแทนแถวเปล่า
  const [items, setItems] = useState(() => initial?.items?.length ? initial.items.map(it => ({ product_id: it.product_id || '', description: it.description || '', quantity: it.quantity, unit_price: it.unit_price })) : [{ ...EMPTY_ITEM }])

  // ตัวกรองประเภทลูกค้า (บุคคลธรรมดา/นิติบุคคล) ก่อนค้นหาบริษัท — แค่ช่วยแคบรายการให้หาง่ายขึ้น ไม่ใช่ฟิลด์ของดีล ไม่ถูกบันทึก
  // ตั้งค่าเริ่มต้นจาก customer_type ของบริษัทที่เลือกไว้แล้ว (ตอนแก้ไข) กันไม่ให้ดูเหมือนรีเซ็ตทุกครั้งที่เปิดหน้าแก้ไข
  const [customerTypeFilter, setCustomerTypeFilter] = useState(() => companies.find(c => c.id === (initial?.company_id || defaultCompanyId))?.customer_type || '')
  const filteredCompanies = customerTypeFilter ? companies.filter(c => c.customer_type === customerTypeFilter) : companies

  useEffect(() => {
    listProducts().then(setProducts).catch(e => { toast(lang === 'en' ? 'Failed to load products: ' + e.message : 'โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error'); setProducts([]) })
  }, [])

  useEffect(() => {
    if (!initial?.id) return
    listDealItems(initial.id)
      .then(rows => { if (rows.length) setItems(rows.map(r => ({ product_id: r.product_id || '', description: r.description || '', quantity: r.quantity, unit_price: r.unit_price }))) })
      .catch(e => toast(lang === 'en' ? "Failed to load the deal's line items: " + e.message : 'โหลดรายการสินค้าของดีลไม่สำเร็จ: ' + e.message, 'error'))
  }, [initial?.id])

  const updateItem = (i, patch) => setItems(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addItem = () => setItems(rows => [...rows, { ...EMPTY_ITEM }])
  const removeItem = (i) => setItems(rows => rows.filter((_, idx) => idx !== i))

  // เลือกสินค้าแล้วเติมชื่อรายการให้อัตโนมัติจากชื่อสินค้า (แก้เองต่อได้) — เหมือนพฤติกรรมในใบเสนอราคา
  const onProductChange = (i, productId) => {
    const p = (products || []).find(x => x.id === productId)
    updateItem(i, { product_id: productId, description: p ? p.name : items[i].description })
  }

  const totals = computeDealTotals(items, { type: f.discount_type, value: f.discount_value })

  // แถวที่ไม่ได้เลือกสินค้าและไม่ได้พิมพ์ชื่อรายการเอง ถือว่าเป็นช่องว่างที่ยังไม่ได้ใช้ ตัดทิ้งก่อนบันทึก
  // close_date/follow_up_date ไม่บังคับ ถ้าไม่ได้กรอก/เคลียร์ทิ้งจะได้ "" มา ต้องแปลงเป็น null ก่อนส่ง ไม่งั้น Postgres ปฏิเสธ (invalid input syntax for type date)
  const submit = () => onSave(
    { ...f, close_date: f.close_date || null, follow_up_date: f.follow_up_date || null },
    items.filter(it => it.product_id || it.description?.trim())
  )

  return (
    <ModalShell title={initial?.id ? 'แก้ไขดีล' : 'เพิ่มดีล'} onClose={onClose} onSave={submit} wide>
      <Field label={t('ประเภทลูกค้า')}>
        <EditableSelect listKey="customer_types" value={customerTypeFilter} onChange={setCustomerTypeFilter} placeholder={t('-- ทุกประเภท (เลือกเพื่อกรองรายชื่อบริษัทด้านล่าง) --')} isAdmin={isAdmin} />
      </Field>
      <Field label={t('บริษัท')}><CompanySelect companies={filteredCompanies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v }))} /></Field>
      <Field label={t('ชื่อดีล')} required><input className="form-control" value={f.name} onChange={set('name')} placeholder={t('โปรเจกต์ / สินค้าที่ขาย')} /></Field>
      <div className="form-row">
        <Field label="Stage">
          <EditableSelect listKey="deal_stages" value={f.stage} onChange={v => setF(s => ({ ...s, stage: v }))} isAdmin={isAdmin} />
        </Field>
        <Field label={t('ที่มาของดีล')}>
          <EditableSelect listKey="deal_sources" value={f.source} onChange={v => setF(s => ({ ...s, source: v }))} placeholder={t('-- ไม่ระบุ --')} isAdmin={isAdmin} />
        </Field>
      </div>
      <div className="form-row">
        <Field label={t('วันที่คาดว่าปิดดีล')}><input className="form-control" type="date" value={f.close_date || ''} onChange={set('close_date')} /></Field>
        <Field label={t('วันที่ต้อง Follow up')}><input className="form-control" type="date" value={f.follow_up_date || ''} onChange={set('follow_up_date')} /></Field>
      </div>
      <Field label={t('ผู้รับผิดชอบ')}><input className="form-control" value={f.owner || ''} onChange={set('owner')} /></Field>

      <Field label={t('รายการสินค้า (ราคาต่อหน่วยกรอกแบบรวม VAT แล้ว)')}>
        <div className="table-wrap" style={{ marginBottom: 8 }}>
          <table>
            <thead><tr><th>{t('สินค้า / รายการ')}</th><th style={{ width: 90 }}>{t('จำนวน')}</th><th style={{ width: 120 }}>{t('ราคา/หน่วย')}</th><th style={{ width: 110 }}>{t('รวม')}</th><th></th></tr></thead>
            <tbody>
              {items.map((it, i) => {
                const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
                return (
                  <tr key={i}>
                    <td>
                      <SearchableSelect
                        options={products || []}
                        value={it.product_id}
                        onChange={v => onProductChange(i, v)}
                        freeText={it.description}
                        onFreeTextChange={v => updateItem(i, { description: v })}
                        placeholder={products ? t('-- พิมพ์ชื่อสินค้าเพื่อค้นหา หรือพิมพ์ชื่อรายการเอง --') : t('กำลังโหลด...')}
                        getOptionLabel={p => `${p.code} - ${p.name}`}
                        disabled={!products}
                      />
                    </td>
                    <td><input className="form-control" type="number" min="0" value={it.quantity} onChange={e => updateItem(i, { quantity: e.target.value })} /></td>
                    <td><input className="form-control" type="number" min="0" value={it.unit_price} onChange={e => updateItem(i, { unit_price: e.target.value })} /></td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{lineTotal.toLocaleString('th-TH')}</td>
                    <td><button type="button" className="btn btn-danger btn-xs" onClick={() => removeItem(i)}>{t('ลบ')}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>{t('+ เพิ่มรายการ')}</button>
      </Field>

      <Field label={t('ส่วนลดท้ายบิล')}>
        <DiscountField type={f.discount_type} value={f.discount_value} onChangeType={v => setF(s => ({ ...s, discount_type: v }))} onChangeValue={v => setF(s => ({ ...s, discount_value: v }))} />
      </Field>

      <div className="card" style={{ marginTop: 4, marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13 }}>
          <div>{t('ไม่รวม VAT')}: <b>{totals.exVat.toLocaleString('th-TH')}</b></div>
          <div>VAT 7%: <b>{totals.vatAmount.toLocaleString('th-TH')}</b></div>
          {totals.discountAmount > 0 && <div>{t('ส่วนลด')}: <b style={{ color: 'var(--danger)' }}>-{totals.discountAmount.toLocaleString('th-TH')}</b></div>}
          <div>{t('รวมทั้งสิ้น')}: <b style={{ color: 'var(--navy)' }}>{totals.grandTotal.toLocaleString('th-TH')}</b></div>
        </div>
      </div>

      <Field label={t('หมายเหตุ')}><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}

// lead: เปิดจากหน้า "ผู้ติดต่อ" (Leads.jsx) — บันทึกผูกกับลีดโดยตรง (lead_id) แทนการเลือกบริษัท เพราะลีดอาจยังไม่ถูกแปลงเป็นลูกค้า
// ถ้าลีดนี้แปลงเป็นลูกค้าแล้ว (มี converted_company_id) จะผูก company_id ให้ด้วยอัตโนมัติ ไปโผล่ในแท็บกิจกรรมของบริษัทนั้นด้วย
// follow_up_date: ถ้ากรอก จะสร้างงานติดตาม (tasks) ให้อัตโนมัติตอนบันทึก (ดู saveActivity ใน App.jsx) — ไม่ต้องไปกรอกซ้ำที่หน้า "งานติดตาม"
// lead_status: แก้สถานะของลีดได้จากที่นี่เลย (เฉพาะตอนเปิดจากหน้าผู้ติดต่อ) ไม่ต้องปิด popup แล้วไปเลือกที่ตารางแยกอีกที
export function ActivityModal({ companies, contacts, defaultCompanyId, lead, currentUserName, isAdmin, onClose, onSave }) {
  const { t, lang } = useLanguage()
  const [f, setF] = useState({
    company_id: defaultCompanyId || lead?.converted_company_id || '', contact_id: '', type: '',
    subject: lead?.subject || '', detail: '', activity_date: new Date().toISOString().split('T')[0], recorded_by: currentUserName || '',
    follow_up_date: '', lead_status: lead?.status || ''
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  const contactOptions = contacts.filter(c => c.company_id === f.company_id)
  // company_id/contact_id เป็น uuid ในฐานข้อมูล ส่ง '' ไปตรงๆ จะพัง (invalid input syntax for type uuid) ต้องแปลงเป็น null ก่อนเสมอ
  const submit = () => onSave({ ...f, company_id: f.company_id || null, contact_id: f.contact_id || null, lead_id: lead?.id || null })
  return (
    <ModalShell title="บันทึกการติดต่อ" onClose={onClose} onSave={submit}>
      {lead
        ? <Field label={lang === 'en' ? 'Contact' : 'ผู้ติดต่อ'}><input className="form-control" value={lead.full_name} disabled /></Field>
        : <Field label={t('บริษัท')}><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v, contact_id: '' }))} /></Field>}
      <div className="form-row">
        <Field label={t('ประเภทการติดต่อ')} required>
          <EditableSelect listKey="activity_types" value={f.type} onChange={v => setF(s => ({ ...s, type: v }))} isAdmin={isAdmin} />
        </Field>
        <Field label={t('วันที่')}><input className="form-control" type="date" value={f.activity_date} onChange={set('activity_date')} /></Field>
      </div>
      <Field label={t('หัวข้อ')} required><input className="form-control" value={f.subject} onChange={set('subject')} placeholder={t('สรุปการติดต่อสั้นๆ')} /></Field>
      {!lead && (
        <Field label={lang === 'en' ? 'Contact' : 'ผู้ติดต่อ'}>
          <select className="form-control" value={f.contact_id} onChange={set('contact_id')}>
            <option value="">{t('-- ไม่ระบุ --')}</option>
            {contactOptions.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </Field>
      )}
      {lead && (
        <Field label={t('สถานะ')}>
          <EditableSelect listKey="lead_statuses" value={f.lead_status} onChange={v => setF(s => ({ ...s, lead_status: v }))} isAdmin={isAdmin} />
        </Field>
      )}
      <Field label={t('วันที่ติดตาม')}>
        <input className="form-control" type="date" value={f.follow_up_date} onChange={set('follow_up_date')} />
        <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('ถ้ากรอก ระบบจะสร้างงานติดตามในวันที่นี้ให้อัตโนมัติ ไม่ต้องไปกรอกซ้ำที่หน้างานติดตาม')}</div>
      </Field>
      <Field label={t('รายละเอียด')}><textarea className="form-control" rows={3} value={f.detail} onChange={set('detail')} placeholder={t('บันทึกรายละเอียดการสนทนา...')} /></Field>
      <Field label={t('ผู้บันทึก')}><input className="form-control" value={f.recorded_by} onChange={set('recorded_by')} /></Field>
    </ModalShell>
  )
}

export function TaskModal({ initial, companies, defaultCompanyId, currentUserName, isAdmin, onClose, onSave }) {
  const { t } = useLanguage()
  const [f, setF] = useState(() => initial || {
    company_id: defaultCompanyId || '', subject: '', due_date: '', priority: 'ปกติ', status: 'รอดำเนินการ', owner: currentUserName || '', note: ''
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  // due_date ไม่บังคับ ถ้าไม่ได้กรอก/เคลียร์ทิ้งจะได้ "" มา ต้องแปลงเป็น null ก่อนส่ง ไม่งั้น Postgres ปฏิเสธ (invalid input syntax for type date)
  const submit = () => onSave({ ...f, due_date: f.due_date || null })
  return (
    <ModalShell title={initial?.id ? 'แก้ไขงาน' : 'เพิ่มงานติดตาม'} onClose={onClose} onSave={submit}>
      <Field label={t('บริษัท')}><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v }))} /></Field>
      <Field label={t('หัวข้องาน')} required><input className="form-control" value={f.subject} onChange={set('subject')} placeholder={t('เช่น โทรติดตามใบเสนอราคา')} /></Field>
      <div className="form-row">
        <Field label={t('วันครบกำหนด')}><input className="form-control" type="date" value={f.due_date || ''} onChange={set('due_date')} /></Field>
        <Field label={t('ลำดับความสำคัญ')}>
          <EditableSelect listKey="task_priorities" value={f.priority} onChange={v => setF(s => ({ ...s, priority: v }))} isAdmin={isAdmin} />
        </Field>
      </div>
      <div className="form-row">
        <Field label={t('สถานะ')}>
          <EditableSelect listKey="task_statuses" value={f.status} onChange={v => setF(s => ({ ...s, status: v }))} isAdmin={isAdmin} />
        </Field>
        <Field label={t('ผู้รับผิดชอบ')}><input className="form-control" value={f.owner || ''} onChange={set('owner')} /></Field>
      </div>
      <Field label={t('หมายเหตุ')}><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}

// เงื่อนไข/หมายเหตุมาตรฐานของบริษัท — เติมให้อัตโนมัติตอนสร้างใบเสนอราคาใหม่ เซลล์แก้ไขได้ตามเงื่อนไขที่ตกลงกับลูกค้าจริง
const DEFAULT_QUOTATION_NOTE = `*ทางบริษัทไม่มีบริการติดตั้งสินค้าหลังการขาย
*การจัดส่งสินค้า หลังจากได้รับการชำระค่าสินค้าเสร็จสมบูรณ์ ภายใน 3-7 วันทำการ
*รับประกันเปลี่ยนเครื่องใหม่ภายใน 15 วัน (บริษัทรับผิดชอบในเรื่องค่าจัดส่งสินค้าเคลม)
*เครื่องใช้ไฟฟ้า , TV ,เครื่องชงกาแฟ , เตาอบไฟฟ้า , รับประกันซ่อมฟรี 1 ปี (รวมค่าอะไหล่และค่าแรงช่าง)
*ตู้เย็น, ตู้แช่ , เครื่องซักผ้า รับประกันซ่อมฟรี 3 ปี (รวมค่าอะไหล่และค่าแรงช่าง)
*เครื่องเสียงติดรถยนต์ รับประกันซ่อมฟรี 1 ปี (รวมค่าอะไหล่และค่าแรงช่าง)`

const EMPTY_QUOT_ITEM = { product_id: '', description: '', quantity: 1, unit_price: '' }

export function QuotationModal({ initial, companies, defaultCompanyId, currentUserName, isAdmin, onClose, onSave }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [f, setF] = useState(() => {
    const base = {
      company_id: defaultCompanyId || '', subject: '', status: 'Draft', sale_phone: '0918086924', proposer_name: currentUserName || '',
      quot_date: new Date().toISOString().split('T')[0], expire_date: '', note: DEFAULT_QUOTATION_NOTE, deal_id: null,
      credit_term: '', payment_due_date: '', payment_status: 'ยังไม่ชำระ', discount_type: '', discount_value: 0
    }
    if (!initial) return base
    // items เป็นแค่ค่าตั้งต้นสำหรับ seed ไม่ใช่คอลัมน์ในตาราง quotations, company/product เป็น relation ที่ join มาตอน select (ไม่ใช่คอลัมน์จริง) — ต้องตัดออกก่อนเก็บใน f ไม่งั้น update จะพังเพราะ Supabase หาคอลัมน์ชื่อนี้ไม่เจอ
    const { items: _seedItems, company: _company, product: _product, ...rest } = initial
    return { ...base, ...rest }
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  // สลับใบเสนอราคาแบบธรรมดา/เครดิต — เป็น state แยกจาก f.credit_term เพื่อให้กดปุ่ม "เครดิต" แล้วเห็นช่องกรอกได้ทันทีก่อนเลือกจำนวนวัน
  const [isCredit, setIsCredit] = useState(() => !!(initial?.credit_term))

  const [products, setProducts] = useState(null) // null = กำลังโหลดรายการสินค้า
  // initial.items = รายการที่ก็อปมาจากดีล (ตอนยังไม่มี initial.id) — ถ้ามีให้ใช้เป็นค่าเริ่มต้นแทนแถวเปล่า
  const [items, setItems] = useState(() => initial?.items?.length ? initial.items.map(it => ({ product_id: it.product_id || '', description: it.description || '', quantity: it.quantity, unit_price: it.unit_price })) : [{ ...EMPTY_QUOT_ITEM }])

  // ตัวกรองประเภทลูกค้า (บุคคลธรรมดา/นิติบุคคล) ก่อนค้นหาบริษัท — แค่ช่วยแคบรายการให้หาง่ายขึ้น ไม่ใช่ฟิลด์ของใบเสนอราคา ไม่ถูกบันทึก
  // ตั้งค่าเริ่มต้นจาก customer_type ของบริษัทที่เลือกไว้แล้ว (ตอนแก้ไข) กันไม่ให้ดูเหมือนรีเซ็ตทุกครั้งที่เปิดหน้าแก้ไข
  const [customerTypeFilter, setCustomerTypeFilter] = useState(() => companies.find(c => c.id === (initial?.company_id || defaultCompanyId))?.customer_type || '')
  const filteredCompanies = customerTypeFilter ? companies.filter(c => c.customer_type === customerTypeFilter) : companies

  useEffect(() => {
    listProducts().then(setProducts).catch(e => { toast(lang === 'en' ? 'Failed to load products: ' + e.message : 'โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error'); setProducts([]) })
  }, [])

  useEffect(() => {
    if (!initial?.id) return
    listQuotationItems(initial.id)
      .then(rows => {
        if (rows.length) setItems(rows.map(r => ({ product_id: r.product_id || '', description: r.description || '', quantity: r.quantity, unit_price: r.unit_price })))
        // ใบเสนอราคาเก่าก่อนมีรายการสินค้า (มีแค่ subject/value เดิม) — แปลงเป็นรายการเดียวให้ ไม่ให้มูลค่าหายตอนแก้ไขครั้งแรก
        else if (Number(initial.value) > 0) setItems([{ product_id: '', description: initial.subject || '', quantity: 1, unit_price: initial.value }])
      })
      .catch(e => toast(lang === 'en' ? "Failed to load the quotation's line items: " + e.message : 'โหลดรายการสินค้าของใบเสนอราคาไม่สำเร็จ: ' + e.message, 'error'))
  }, [initial?.id])

  const updateItem = (i, patch) => setItems(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addItem = () => setItems(rows => [...rows, { ...EMPTY_QUOT_ITEM }])
  const removeItem = (i) => setItems(rows => rows.filter((_, idx) => idx !== i))

  // เลือกสินค้าแล้วเติมชื่อรายการให้อัตโนมัติจากชื่อสินค้า (แก้เองต่อได้) — ถ้ามีแค่ 1 รายการ เติมหัวข้อใบเสนอราคาให้ด้วย (ถ้ายังไม่ได้กรอก)
  const onProductChange = (i, productId) => {
    const p = (products || []).find(x => x.id === productId)
    updateItem(i, { product_id: productId, description: p ? p.name : items[i].description })
    if (p && items.length === 1) setF(s => ({ ...s, subject: s.subject || p.name }))
  }

  const totals = computeDealTotals(items, { type: f.discount_type, value: f.discount_value })

  // เลือกบริษัทแล้วเช็คว่าบริษัทนี้ตั้งเงื่อนไขเครดิตไว้ไหม — ถ้ามีและยังไม่ได้เลือกเครดิตเอง ช่วยสลับโหมดเป็นเครดิตให้อัตโนมัติ (แก้กลับเป็นธรรมดาได้ถ้าใบนี้ไม่ต้องการ)
  const onCompanyChange = (companyId) => {
    const co = companies.find(c => c.id === companyId)
    const autoSuggestCredit = co?.credit_term && !f.credit_term
    if (autoSuggestCredit) setIsCredit(true)
    setF(s => ({ ...s, company_id: companyId, credit_term: autoSuggestCredit ? co.credit_term : s.credit_term }))
  }

  // แถวที่ไม่ได้เลือกสินค้าและไม่ได้พิมพ์ชื่อรายการเอง ถือว่าเป็นช่องว่างที่ยังไม่ได้ใช้ ตัดทิ้งก่อนบันทึก
  // ช่องวันที่ที่ไม่บังคับ (expire_date/payment_due_date) ถ้าเคลียร์ค่าจนว่างจะได้ "" มา ต้องแปลงเป็น null ก่อนส่ง ไม่งั้น Postgres ปฏิเสธ (invalid input syntax for type date)
  const submit = () => onSave(
    { ...f, expire_date: f.expire_date || null, payment_due_date: f.payment_due_date || null },
    items.filter(it => it.product_id || it.description?.trim())
  )

  return (
    <ModalShell title={initial?.id ? 'แก้ไขใบเสนอราคา' : 'สร้างใบเสนอราคา'} onClose={onClose} onSave={submit} wide>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={`btn btn-sm ${!isCredit ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => { setIsCredit(false); setF(s => ({ ...s, credit_term: '', payment_due_date: '', payment_status: 'ยังไม่ชำระ' })) }}>{t('ใบเสนอราคาแบบธรรมดา')}</button>
          <button type="button" className={`btn btn-sm ${isCredit ? 'btn-primary' : 'btn-outline'}`} onClick={() => setIsCredit(true)}>{t('ลูกค้าเครดิต')}</button>
        </div>
        <div>
          <label className="form-label" style={{ textAlign: 'right', display: 'block' }}>{t('วันที่')}</label>
          <input className="form-control" type="date" style={{ width: 160 }} value={f.quot_date} onChange={set('quot_date')} />
        </div>
      </div>

      {isCredit && (
        <>
          <div className="form-row">
            <Field label={t('จำนวนวันเครดิต')}>
              <EditableSelect listKey="credit_terms" value={f.credit_term} onChange={v => setF(s => ({ ...s, credit_term: v }))} isAdmin={isAdmin} />
            </Field>
            <Field label={t('วันครบกำหนดชำระ')}>
              <input className="form-control" type="date" value={f.payment_due_date || ''} onChange={set('payment_due_date')} />
            </Field>
          </div>
          <Field label={t('สถานะการชำระ')}>
            <EditableSelect listKey="payment_statuses" value={f.payment_status} onChange={v => setF(s => ({ ...s, payment_status: v }))} isAdmin={isAdmin} />
          </Field>
        </>
      )}

      <Field label={t('ประเภทลูกค้า')}>
        <EditableSelect listKey="customer_types" value={customerTypeFilter} onChange={setCustomerTypeFilter} placeholder={t('-- ทุกประเภท (เลือกเพื่อกรองรายชื่อบริษัทด้านล่าง) --')} isAdmin={isAdmin} />
      </Field>
      <Field label={t('บริษัท')}>
        <CompanySelect companies={filteredCompanies} value={f.company_id} onChange={onCompanyChange} />
      </Field>
      <Field label={t('หัวข้อใบเสนอราคา')} required><input className="form-control" value={f.subject} onChange={set('subject')} placeholder={t('ใบเสนอราคาสำหรับ...')} /></Field>

      <Field label={t('รายการสินค้า (ราคาต่อหน่วยกรอกแบบรวม VAT แล้ว)')}>
        <div className="table-wrap" style={{ marginBottom: 8 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>{t('สินค้า / รายการ')}</th>
                <th style={{ width: 80 }}>{t('จำนวน')}</th>
                <th style={{ width: 120 }}>{t('ราคา/หน่วย')}</th>
                <th style={{ width: 110 }}>{t('รวม')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const product = (products || []).find(p => p.id === it.product_id)
                const thumbUrl = product ? getProductImageUrl(product.image_path) : null
                const lineTotal = (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
                return (
                  <tr key={i}>
                    <td>{thumbUrl && <img src={thumbUrl} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4 }} />}</td>
                    <td>
                      <SearchableSelect
                        options={products || []}
                        value={it.product_id}
                        onChange={v => onProductChange(i, v)}
                        freeText={it.description}
                        onFreeTextChange={v => updateItem(i, { description: v })}
                        placeholder={products ? t('-- พิมพ์ชื่อสินค้าเพื่อค้นหา หรือพิมพ์ชื่อรายการเอง --') : t('กำลังโหลด...')}
                        getOptionLabel={p => `${p.code} - ${p.name}`}
                        disabled={!products}
                      />
                    </td>
                    <td><input className="form-control" type="number" min="0" value={it.quantity} onChange={e => updateItem(i, { quantity: e.target.value })} /></td>
                    <td><input className="form-control" type="number" min="0" value={it.unit_price} onChange={e => updateItem(i, { unit_price: e.target.value })} /></td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{lineTotal.toLocaleString('th-TH')}</td>
                    <td><button type="button" className="btn btn-danger btn-xs" onClick={() => removeItem(i)}>{t('ลบ')}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>{t('+ เพิ่มรายการ')}</button>
      </Field>

      <Field label={t('ส่วนลดท้ายบิล')}>
        <DiscountField type={f.discount_type} value={f.discount_value} onChangeType={v => setF(s => ({ ...s, discount_type: v }))} onChangeValue={v => setF(s => ({ ...s, discount_value: v }))} />
      </Field>

      <div className="card" style={{ marginTop: 4, marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13 }}>
          <div>{t('ไม่รวม VAT')}: <b>{totals.exVat.toLocaleString('th-TH')}</b></div>
          <div>VAT 7%: <b>{totals.vatAmount.toLocaleString('th-TH')}</b></div>
          {totals.discountAmount > 0 && <div>{t('ส่วนลด')}: <b style={{ color: 'var(--danger)' }}>-{totals.discountAmount.toLocaleString('th-TH')}</b></div>}
          <div>{t('รวมทั้งสิ้น')}: <b style={{ color: 'var(--navy)' }}>{totals.grandTotal.toLocaleString('th-TH')}</b></div>
        </div>
      </div>

      <div className="form-row">
        <Field label={t('สถานะ')}>
          <EditableSelect listKey="quot_statuses" value={f.status} onChange={v => setF(s => ({ ...s, status: v }))} isAdmin={isAdmin} />
        </Field>
        <Field label={t('วันหมดอายุ')}><input className="form-control" type="date" value={f.expire_date || ''} onChange={set('expire_date')} /></Field>
      </div>
      <div className="form-row">
        <Field label={t('เบอร์ติดต่อเซลล์')}><input className="form-control" value={f.sale_phone || ''} onChange={set('sale_phone')} placeholder="08x-xxx-xxxx" /></Field>
        <Field label={t('ชื่อผู้เสนอราคา')}>
          <input className="form-control" value={f.proposer_name || ''} onChange={set('proposer_name')} placeholder={t('ชื่อผู้ออกใบเสนอราคา — พิมพ์ไว้เหนือช่องลงชื่อตอนพิมพ์ ไม่ต้องเซ็นสด')} />
        </Field>
      </div>
      <Field label={t('หมายเหตุ')}><textarea className="form-control" rows={6} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}
