import { useEffect, useState } from 'react'
import { CONSTANTS } from '../lib/api'

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
    <select className="form-control" value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">-- เลือกบริษัท --</option>
      {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}

function ModalShell({ title, onClose, onSave, saveLabel = '💾 บันทึก', children, wide }) {
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={wide ? { maxWidth: 720 } : undefined}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
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

export function CompanyModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(() => initial || { name: '', industry: '', status: 'Active', phone: '', email: '', website: '', address: '', owner: '', note: '' })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  return (
    <ModalShell title={initial?.id ? 'แก้ไขบริษัท' : 'เพิ่มบริษัทลูกค้า'} onClose={onClose} onSave={() => onSave(f)}>
      <Field label="ชื่อบริษัท" required><input className="form-control" value={f.name} onChange={set('name')} placeholder="บริษัท ตัวอย่าง จำกัด" /></Field>
      <div className="form-row">
        <Field label="อุตสาหกรรม">
          <select className="form-control" value={f.industry || ''} onChange={set('industry')}>
            <option value="">-- เลือก --</option>
            {CONSTANTS.INDUSTRIES.map(i => <option key={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="สถานะ">
          <select className="form-control" value={f.status || 'Active'} onChange={set('status')}>
            {CONSTANTS.COMPANY_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="โทรศัพท์"><input className="form-control" value={f.phone || ''} onChange={set('phone')} placeholder="02-xxx-xxxx" /></Field>
        <Field label="อีเมล"><input className="form-control" type="email" value={f.email || ''} onChange={set('email')} /></Field>
      </div>
      <Field label="เว็บไซต์"><input className="form-control" value={f.website || ''} onChange={set('website')} placeholder="https://www.company.com" /></Field>
      <Field label="ที่อยู่"><textarea className="form-control" rows={2} value={f.address || ''} onChange={set('address')} /></Field>
      <Field label="ผู้รับผิดชอบ"><input className="form-control" value={f.owner || ''} onChange={set('owner')} /></Field>
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

export function DealModal({ initial, companies, defaultCompanyId, defaultStage, onClose, onSave }) {
  const [f, setF] = useState(() => initial || { company_id: defaultCompanyId || '', name: '', stage: defaultStage || 'Lead', value: '', close_date: '', owner: '', note: '' })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  return (
    <ModalShell title={initial?.id ? 'แก้ไขดีล' : 'เพิ่มดีล'} onClose={onClose} onSave={() => onSave(f)}>
      <Field label="บริษัท"><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v }))} /></Field>
      <Field label="ชื่อดีล" required><input className="form-control" value={f.name} onChange={set('name')} placeholder="โปรเจกต์ / สินค้าที่ขาย" /></Field>
      <div className="form-row">
        <Field label="Stage">
          <select className="form-control" value={f.stage} onChange={set('stage')}>
            {CONSTANTS.DEAL_STAGES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="มูลค่า (บาท)"><input className="form-control" type="number" value={f.value || ''} onChange={set('value')} /></Field>
      </div>
      <div className="form-row">
        <Field label="วันที่คาดว่าปิดดีล"><input className="form-control" type="date" value={f.close_date || ''} onChange={set('close_date')} /></Field>
        <Field label="ผู้รับผิดชอบ"><input className="form-control" value={f.owner || ''} onChange={set('owner')} /></Field>
      </div>
      <Field label="หมายเหตุ"><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}

export function ActivityModal({ companies, contacts, defaultCompanyId, currentUserName, onClose, onSave }) {
  const [f, setF] = useState({
    company_id: defaultCompanyId || '', contact_id: '', type: CONSTANTS.ACTIVITY_TYPES[0],
    subject: '', detail: '', activity_date: new Date().toISOString().split('T')[0], recorded_by: currentUserName || ''
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  const contactOptions = contacts.filter(c => c.company_id === f.company_id)
  return (
    <ModalShell title="บันทึกการติดต่อ" onClose={onClose} onSave={() => onSave(f)}>
      <Field label="บริษัท"><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v, contact_id: '' }))} /></Field>
      <div className="form-row">
        <Field label="ประเภทการติดต่อ" required>
          <select className="form-control" value={f.type} onChange={set('type')}>
            {CONSTANTS.ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
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

export function TaskModal({ initial, companies, defaultCompanyId, currentUserName, onClose, onSave }) {
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
          <select className="form-control" value={f.priority} onChange={set('priority')}>
            {CONSTANTS.TASK_PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="สถานะ">
          <select className="form-control" value={f.status} onChange={set('status')}>
            {CONSTANTS.TASK_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="ผู้รับผิดชอบ"><input className="form-control" value={f.owner || ''} onChange={set('owner')} /></Field>
      </div>
      <Field label="หมายเหตุ"><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}

export function QuotationModal({ companies, defaultCompanyId, onClose, onSave }) {
  const [f, setF] = useState({
    company_id: defaultCompanyId || '', subject: '', value: '', status: 'Draft',
    quot_date: new Date().toISOString().split('T')[0], expire_date: '', note: ''
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  return (
    <ModalShell title="สร้างใบเสนอราคา" onClose={onClose} onSave={() => onSave(f)}>
      <Field label="บริษัท"><CompanySelect companies={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v }))} /></Field>
      <Field label="หัวข้อใบเสนอราคา" required><input className="form-control" value={f.subject} onChange={set('subject')} placeholder="ใบเสนอราคาสำหรับ..." /></Field>
      <div className="form-row">
        <Field label="มูลค่า (บาท)"><input className="form-control" type="number" value={f.value || ''} onChange={set('value')} /></Field>
        <Field label="สถานะ">
          <select className="form-control" value={f.status} onChange={set('status')}>
            {CONSTANTS.QUOT_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="วันที่"><input className="form-control" type="date" value={f.quot_date} onChange={set('quot_date')} /></Field>
        <Field label="วันหมดอายุ"><input className="form-control" type="date" value={f.expire_date || ''} onChange={set('expire_date')} /></Field>
      </div>
      <Field label="หมายเหตุ"><textarea className="form-control" rows={2} value={f.note || ''} onChange={set('note')} /></Field>
    </ModalShell>
  )
}
