import { useEffect, useState } from 'react'
import EditableSelect from './EditableSelect'
import SearchableSelect from './SearchableSelect'
import { useUi } from './UiContext'
import { listProducts, listDealItems, listQuotationItems, computeDealTotals, getProductImageUrl } from '../lib/api'

function Field({ label, required, children }) {
  return (
    <div className="form-group">
      <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
      {children}
    </div>
  )
}

function CompanySelect({ companies, value, onChange }) {
  return (
    <SearchableSelect
      options={companies}
      value={value}
      onChange={onChange}
      placeholder="-- เลือกบริษัท (พิมพ์เพื่อค้นหา) --"
      getOptionLabel={c => c.name}
    />
  )
}

function ModalShell({ title, onClose, onSave, saveLabel = 'บันทึก', children, wide }) {
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={wide ? { maxWidth: 720 } : undefined}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={onSave}>{saveLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function CompanyModal({ initial, isAdmin, onClose, onSave }) {
  const [f, setF] = useState(() => initial || { name: '', industry: '', status: 'Active', phone: '', email: '', website: '', address: '', tax_id: '', owner: '', lead_source: '', note: '' })
  const [files, setFiles] = useState([])
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const onFilesChange = (e) => setFiles(Array.from(e.target.files || []))

  return (
    <ModalShell title={initial?.id ? 'แก้ไขบริษัท' : 'เพิ่มบริษัทลูกค้า'} onClose={onClose} onSave={() => onSave(f, files)}>
      <Field label="ชื่อบริษัท" required><input className="form-control" value={f.name} onChange={set('name')} placeholder="บริษัท ตัวอย่าง จำกัด" /></Field>
      <Field label="เอกสารแนบ (ภพ20, หนังสือรับรองบริษัท ฯลฯ)">
        <input className="form-control" type="file" multiple onChange={onFilesChange} />
        {files.length > 0 && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>เลือกแล้ว {files.length} ไฟล์: {files.map(file => file.name).join(', ')}</div>}
      </Field>
      <div className="form-row">
        <Field label="อุตสาหกรรม">
          <EditableSelect listKey="industries" value={f.industry} onChange={v => setF(s => ({ ...s, industry: v }))} isAdmin={isAdmin} />
        </Field>
        <Field label="สถานะ">
          <EditableSelect listKey="company_statuses" value={f.status} onChange={v => setF(s => ({ ...s, status: v }))} isAdmin={isAdmin} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="โทรศัพท์"><input className="form-control" value={f.phone || ''} onChange={set('phone')} placeholder="02-xxx-xxxx" /></Field>
        <Field label="อีเมล"><input className="form-control" type="email" value={f.email || ''} onChange={set('email')} /></Field>
      </div>
      <Field label="เว็บไซต์"><input className="form-control" value={f.website || ''} onChange={set('website')} placeholder="https://www.company.com" /></Field>
      <Field label="ที่อยู่"><textarea className="form-control" rows={2} value={f.address || ''} onChange={set('address')} /></Field>
      <div className="form-row">
        <Field label="เลขประจำตัวผู้เสียภาษี"><input className="form-control" value={f.tax_id || ''} onChange={set('tax_id')} placeholder="0-0000-00000-00-0" /></Field>
        <Field label="ผู้รับผิดชอบ"><input className="form-control" value={f.owner || ''} onChange={set('owner')} /></Field>
      </div>
      <Field label="ที่มา">
        <EditableSelect listKey="lead_sources" value={f.lead_source} onChange={v => setF(s => ({ ...s, lead_source: v }))} placeholder="-- ไม่ระบุ --" isAdmin={isAdmin} />
      </Field>
      <Field label="หมายเหตุ"><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}

export function ContactModal({ initial, companies, defaultCompanyId, onClose, onSave }) {
  const [f, setF] = useState(() => initial || { company_id: defaultCompanyId || '', full_name: '', position: '', department: '', phone: '', email: '', line_id: '', note: '' })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  return (
    <ModalShell title={initial?.id ? 'แก้ไขผู้ติดต่อ' : 'เพิ่มผู้ติดต่อ'} onClose={onClose} onSave={() => onSave(f)}>
      <Field label="บริษัท"><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v }))} /></Field>
      <div className="form-row">
        <Field label="ชื่อ-นามสกุล" required><input className="form-control" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="ตำแหน่ง"><input className="form-control" value={f.position || ''} onChange={set('position')} /></Field>
      </div>
      <div className="form-row">
        <Field label="แผนก"><input className="form-control" value={f.department || ''} onChange={set('department')} /></Field>
        <Field label="Line ID"><input className="form-control" value={f.line_id || ''} onChange={set('line_id')} /></Field>
      </div>
      <div className="form-row">
        <Field label="โทรศัพท์"><input className="form-control" value={f.phone || ''} onChange={set('phone')} /></Field>
        <Field label="อีเมล"><input className="form-control" type="email" value={f.email || ''} onChange={set('email')} /></Field>
      </div>
      <Field label="หมายเหตุ"><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}

// แถวรายการสินค้าว่างเปล่า 1 แถวเริ่มต้น — quantity เริ่มที่ 1 เพื่อลดการพิมพ์ซ้ำๆ
const EMPTY_ITEM = { product_id: '', description: '', quantity: 1, unit_price: '' }

export function DealModal({ initial, companies, defaultCompanyId, defaultStage, isAdmin, onClose, onSave }) {
  const { toast } = useUi()
  const [f, setF] = useState(() => {
    const base = { company_id: defaultCompanyId || '', name: '', stage: defaultStage || 'Lead', close_date: '', follow_up_date: '', source: '', owner: '', note: '' }
    if (!initial) return base
    const { items: _seedItems, ...rest } = initial // items เป็นแค่ค่าตั้งต้นสำหรับ seed ไม่ใช่คอลัมน์ในตาราง deals ตัดออกก่อนเก็บใน f
    return { ...base, ...rest }
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const [products, setProducts] = useState(null) // null = กำลังโหลดรายการสินค้า
  // initial.items = รายการที่ก็อปมาจากใบเสนอราคา (ตอนยังไม่มี initial.id) — ถ้ามีให้ใช้เป็นค่าเริ่มต้นแทนแถวเปล่า
  const [items, setItems] = useState(() => initial?.items?.length ? initial.items.map(it => ({ product_id: it.product_id || '', description: it.description || '', quantity: it.quantity, unit_price: it.unit_price })) : [{ ...EMPTY_ITEM }])

  useEffect(() => {
    listProducts().then(setProducts).catch(e => { toast('โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error'); setProducts([]) })
  }, [])

  useEffect(() => {
    if (!initial?.id) return
    listDealItems(initial.id)
      .then(rows => { if (rows.length) setItems(rows.map(r => ({ product_id: r.product_id || '', description: r.description || '', quantity: r.quantity, unit_price: r.unit_price }))) })
      .catch(e => toast('โหลดรายการสินค้าของดีลไม่สำเร็จ: ' + e.message, 'error'))
  }, [initial?.id])

  const updateItem = (i, patch) => setItems(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addItem = () => setItems(rows => [...rows, { ...EMPTY_ITEM }])
  const removeItem = (i) => setItems(rows => rows.filter((_, idx) => idx !== i))

  // เลือกสินค้าแล้วเติมชื่อรายการให้อัตโนมัติจากชื่อสินค้า (แก้เองต่อได้) — เหมือนพฤติกรรมในใบเสนอราคา
  const onProductChange = (i, productId) => {
    const p = (products || []).find(x => x.id === productId)
    updateItem(i, { product_id: productId, description: p ? p.name : items[i].description })
  }

  const totals = computeDealTotals(items)

  // แถวที่ไม่ได้เลือกสินค้าและไม่ได้พิมพ์ชื่อรายการเอง ถือว่าเป็นช่องว่างที่ยังไม่ได้ใช้ ตัดทิ้งก่อนบันทึก
  const submit = () => onSave(f, items.filter(it => it.product_id || it.description?.trim()))

  return (
    <ModalShell title={initial?.id ? 'แก้ไขดีล' : 'เพิ่มดีล'} onClose={onClose} onSave={submit} wide>
      <Field label="บริษัท"><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v }))} /></Field>
      <Field label="ชื่อดีล" required><input className="form-control" value={f.name} onChange={set('name')} placeholder="โปรเจกต์ / สินค้าที่ขาย" /></Field>
      <div className="form-row">
        <Field label="Stage">
          <EditableSelect listKey="deal_stages" value={f.stage} onChange={v => setF(s => ({ ...s, stage: v }))} isAdmin={isAdmin} />
        </Field>
        <Field label="ที่มาของดีล">
          <EditableSelect listKey="deal_sources" value={f.source} onChange={v => setF(s => ({ ...s, source: v }))} placeholder="-- ไม่ระบุ --" isAdmin={isAdmin} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="วันที่คาดว่าปิดดีล"><input className="form-control" type="date" value={f.close_date || ''} onChange={set('close_date')} /></Field>
        <Field label="วันที่ต้อง Follow up"><input className="form-control" type="date" value={f.follow_up_date || ''} onChange={set('follow_up_date')} /></Field>
      </div>
      <Field label="ผู้รับผิดชอบ"><input className="form-control" value={f.owner || ''} onChange={set('owner')} /></Field>

      <Field label="รายการสินค้า (ราคาต่อหน่วยกรอกแบบรวม VAT แล้ว)">
        <div className="table-wrap" style={{ marginBottom: 8 }}>
          <table>
            <thead><tr><th>สินค้า / รายการ</th><th style={{ width: 90 }}>จำนวน</th><th style={{ width: 120 }}>ราคา/หน่วย</th><th style={{ width: 110 }}>รวม</th><th></th></tr></thead>
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
                        placeholder={products ? '-- พิมพ์ชื่อสินค้าเพื่อค้นหา หรือพิมพ์ชื่อรายการเอง --' : 'กำลังโหลด...'}
                        getOptionLabel={p => `${p.code} - ${p.name}`}
                        disabled={!products}
                      />
                    </td>
                    <td><input className="form-control" type="number" min="0" value={it.quantity} onChange={e => updateItem(i, { quantity: e.target.value })} /></td>
                    <td><input className="form-control" type="number" min="0" value={it.unit_price} onChange={e => updateItem(i, { unit_price: e.target.value })} /></td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{lineTotal.toLocaleString('th-TH')}</td>
                    <td><button type="button" className="btn btn-danger btn-xs" onClick={() => removeItem(i)}>ลบ</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ เพิ่มรายการ</button>
      </Field>

      <div className="card" style={{ marginTop: 4, marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13 }}>
          <div>ไม่รวม VAT: <b>{totals.exVat.toLocaleString('th-TH')}</b></div>
          <div>VAT 7%: <b>{totals.vatAmount.toLocaleString('th-TH')}</b></div>
          <div>รวมทั้งสิ้น: <b style={{ color: 'var(--navy)' }}>{totals.subtotalIncVat.toLocaleString('th-TH')}</b></div>
        </div>
      </div>

      <Field label="หมายเหตุ"><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}

export function ActivityModal({ companies, contacts, defaultCompanyId, currentUserName, isAdmin, onClose, onSave }) {
  const [f, setF] = useState({
    company_id: defaultCompanyId || '', contact_id: '', type: '',
    subject: '', detail: '', activity_date: new Date().toISOString().split('T')[0], recorded_by: currentUserName || ''
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  const contactOptions = contacts.filter(c => c.company_id === f.company_id)
  return (
    <ModalShell title="บันทึกการติดต่อ" onClose={onClose} onSave={() => onSave(f)}>
      <Field label="บริษัท"><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v, contact_id: '' }))} /></Field>
      <div className="form-row">
        <Field label="ประเภทการติดต่อ" required>
          <EditableSelect listKey="activity_types" value={f.type} onChange={v => setF(s => ({ ...s, type: v }))} isAdmin={isAdmin} />
        </Field>
        <Field label="วันที่"><input className="form-control" type="date" value={f.activity_date} onChange={set('activity_date')} /></Field>
      </div>
      <Field label="หัวข้อ" required><input className="form-control" value={f.subject} onChange={set('subject')} placeholder="สรุปการติดต่อสั้นๆ" /></Field>
      <Field label="ผู้ติดต่อ">
        <select className="form-control" value={f.contact_id} onChange={set('contact_id')}>
          <option value="">-- ไม่ระบุ --</option>
          {contactOptions.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </Field>
      <Field label="รายละเอียด"><textarea className="form-control" rows={3} value={f.detail} onChange={set('detail')} placeholder="บันทึกรายละเอียดการสนทนา..." /></Field>
      <Field label="ผู้บันทึก"><input className="form-control" value={f.recorded_by} onChange={set('recorded_by')} /></Field>
    </ModalShell>
  )
}

export function TaskModal({ initial, companies, defaultCompanyId, currentUserName, isAdmin, onClose, onSave }) {
  const [f, setF] = useState(() => initial || {
    company_id: defaultCompanyId || '', subject: '', due_date: '', priority: 'ปกติ', status: 'รอดำเนินการ', owner: currentUserName || '', note: ''
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  return (
    <ModalShell title={initial?.id ? 'แก้ไขงาน' : 'เพิ่มงาน Follow-up'} onClose={onClose} onSave={() => onSave(f)}>
      <Field label="บริษัท"><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v }))} /></Field>
      <Field label="หัวข้องาน" required><input className="form-control" value={f.subject} onChange={set('subject')} placeholder="เช่น โทรติดตามใบเสนอราคา" /></Field>
      <div className="form-row">
        <Field label="วันครบกำหนด"><input className="form-control" type="date" value={f.due_date || ''} onChange={set('due_date')} /></Field>
        <Field label="ลำดับความสำคัญ">
          <EditableSelect listKey="task_priorities" value={f.priority} onChange={v => setF(s => ({ ...s, priority: v }))} isAdmin={isAdmin} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="สถานะ">
          <EditableSelect listKey="task_statuses" value={f.status} onChange={v => setF(s => ({ ...s, status: v }))} isAdmin={isAdmin} />
        </Field>
        <Field label="ผู้รับผิดชอบ"><input className="form-control" value={f.owner || ''} onChange={set('owner')} /></Field>
      </div>
      <Field label="หมายเหตุ"><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
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
  const [f, setF] = useState(() => {
    const base = {
      company_id: defaultCompanyId || '', subject: '', status: 'Draft', sale_phone: '', proposer_name: currentUserName || '',
      quot_date: new Date().toISOString().split('T')[0], expire_date: '', note: DEFAULT_QUOTATION_NOTE, deal_id: null
    }
    if (!initial) return base
    const { items: _seedItems, ...rest } = initial // items เป็นแค่ค่าตั้งต้นสำหรับ seed ไม่ใช่คอลัมน์ในตาราง quotations ตัดออกก่อนเก็บใน f
    return { ...base, ...rest }
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const [products, setProducts] = useState(null) // null = กำลังโหลดรายการสินค้า
  // initial.items = รายการที่ก็อปมาจากดีล (ตอนยังไม่มี initial.id) — ถ้ามีให้ใช้เป็นค่าเริ่มต้นแทนแถวเปล่า
  const [items, setItems] = useState(() => initial?.items?.length ? initial.items.map(it => ({ product_id: it.product_id || '', description: it.description || '', quantity: it.quantity, unit_price: it.unit_price })) : [{ ...EMPTY_QUOT_ITEM }])

  useEffect(() => {
    listProducts().then(setProducts).catch(e => { toast('โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error'); setProducts([]) })
  }, [])

  useEffect(() => {
    if (!initial?.id) return
    listQuotationItems(initial.id)
      .then(rows => {
        if (rows.length) setItems(rows.map(r => ({ product_id: r.product_id || '', description: r.description || '', quantity: r.quantity, unit_price: r.unit_price })))
        // ใบเสนอราคาเก่าก่อนมีรายการสินค้า (มีแค่ subject/value เดิม) — แปลงเป็นรายการเดียวให้ ไม่ให้มูลค่าหายตอนแก้ไขครั้งแรก
        else if (Number(initial.value) > 0) setItems([{ product_id: '', description: initial.subject || '', quantity: 1, unit_price: initial.value }])
      })
      .catch(e => toast('โหลดรายการสินค้าของใบเสนอราคาไม่สำเร็จ: ' + e.message, 'error'))
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

  const totals = computeDealTotals(items)

  // แถวที่ไม่ได้เลือกสินค้าและไม่ได้พิมพ์ชื่อรายการเอง ถือว่าเป็นช่องว่างที่ยังไม่ได้ใช้ ตัดทิ้งก่อนบันทึก
  const submit = () => onSave(f, items.filter(it => it.product_id || it.description?.trim()))

  return (
    <ModalShell title={initial?.id ? 'แก้ไขใบเสนอราคา' : 'สร้างใบเสนอราคา'} onClose={onClose} onSave={submit} wide>
      <Field label="บริษัท"><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v }))} /></Field>
      <Field label="หัวข้อใบเสนอราคา" required><input className="form-control" value={f.subject} onChange={set('subject')} placeholder="ใบเสนอราคาสำหรับ..." /></Field>

      <Field label="รายการสินค้า (ราคาต่อหน่วยกรอกแบบรวม VAT แล้ว)">
        <div className="table-wrap" style={{ marginBottom: 8 }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>สินค้า / รายการ</th>
                <th style={{ width: 80 }}>จำนวน</th>
                <th style={{ width: 120 }}>ราคา/หน่วย</th>
                <th style={{ width: 110 }}>รวม</th>
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
                        placeholder={products ? '-- พิมพ์ชื่อสินค้าเพื่อค้นหา หรือพิมพ์ชื่อรายการเอง --' : 'กำลังโหลด...'}
                        getOptionLabel={p => `${p.code} - ${p.name}`}
                        disabled={!products}
                      />
                    </td>
                    <td><input className="form-control" type="number" min="0" value={it.quantity} onChange={e => updateItem(i, { quantity: e.target.value })} /></td>
                    <td><input className="form-control" type="number" min="0" value={it.unit_price} onChange={e => updateItem(i, { unit_price: e.target.value })} /></td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{lineTotal.toLocaleString('th-TH')}</td>
                    <td><button type="button" className="btn btn-danger btn-xs" onClick={() => removeItem(i)}>ลบ</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ เพิ่มรายการ</button>
      </Field>

      <div className="card" style={{ marginTop: 4, marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13 }}>
          <div>ไม่รวม VAT: <b>{totals.exVat.toLocaleString('th-TH')}</b></div>
          <div>VAT 7%: <b>{totals.vatAmount.toLocaleString('th-TH')}</b></div>
          <div>รวมทั้งสิ้น: <b style={{ color: 'var(--navy)' }}>{totals.subtotalIncVat.toLocaleString('th-TH')}</b></div>
        </div>
      </div>

      <div className="form-row">
        <Field label="สถานะ">
          <EditableSelect listKey="quot_statuses" value={f.status} onChange={v => setF(s => ({ ...s, status: v }))} isAdmin={isAdmin} />
        </Field>
        <Field label="วันหมดอายุ"><input className="form-control" type="date" value={f.expire_date || ''} onChange={set('expire_date')} /></Field>
      </div>
      <div className="form-row">
        <Field label="วันที่"><input className="form-control" type="date" value={f.quot_date} onChange={set('quot_date')} /></Field>
        <Field label="เบอร์ติดต่อเซลล์"><input className="form-control" value={f.sale_phone || ''} onChange={set('sale_phone')} placeholder="08x-xxx-xxxx" /></Field>
      </div>
      <Field label="ชื่อผู้เสนอราคา">
        <input className="form-control" value={f.proposer_name || ''} onChange={set('proposer_name')} placeholder="ชื่อผู้ออกใบเสนอราคา — พิมพ์ไว้เหนือช่องลงชื่อตอนพิมพ์ ไม่ต้องเซ็นสด" />
      </Field>
      <Field label="หมายเหตุ"><textarea className="form-control" rows={6} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}
