import { useEffect, useState } from 'react'
import {
  DOC_TYPES, DOC_DELIVERY_METHODS, DOC_PRIORITIES, DOC_FILE_TYPE_LABEL,
  ACCOUNTING_DOC_STATUS, fetchAccountingDocRequestsByOrder, saveAccountingDocDraft, submitAccountingDocRequest, requestAdditionalAccountingDoc,
  listAccountingDocFiles, getAccountingDocFileUrl,
} from '../lib/api'
import { docStatusBadgeClass, docPriorityBadgeClass } from '../lib/format'
import { printAccountingDocRequest } from '../lib/printAccountingDocRequest'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

const NEEDS_TAX = (t) => t === 'ใบกำกับภาษี + ใบเสร็จรับเงิน'
const NEEDS_EMAIL = (m) => m === 'ส่งสำเนาทางอีเมล' || m === 'ส่งทั้งอีเมลและตัวจริง'
const NEEDS_ORIGINAL = (m) => m === 'ส่งตัวจริง' || m === 'ส่งทั้งอีเมลและตัวจริง'

const RadioGroup = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {options.map(o => (
      <button key={o} type="button" className={`btn btn-sm ${value === o ? 'btn-primary' : 'btn-outline'}`} onClick={() => onChange(o)}>{o}</button>
    ))}
  </div>
)

// ค่าตั้งต้นของฟอร์ม — ถ้าแก้ไขคำขอเดิมใช้ค่าเดิม, ถ้าสร้างใหม่ดึงข้อมูลบริษัท/ที่อยู่จัดส่งจากออเดอร์มาเติมให้อัตโนมัติ (แก้ไขได้)
function initForm(existing, order) {
  if (existing) {
    return {
      document_type: existing.document_type || '', delivery_method: existing.delivery_method || '', priority: existing.priority || 'ปกติ',
      tax_name: existing.tax_name || '', tax_id: existing.tax_id || '', branch_type: existing.branch_type || '', branch_no: existing.branch_no || '', tax_address: existing.tax_address || '',
      email_to: existing.email_to || '', original_recipient_name: existing.original_recipient_name || '', original_recipient_phone: existing.original_recipient_phone || '', original_shipping_address: existing.original_shipping_address || '',
      sales_note: existing.sales_note || '',
    }
  }
  return {
    document_type: '', delivery_method: '', priority: 'ปกติ',
    tax_name: order.customer_name || '', tax_id: order.company_tax_id || '', branch_type: 'สำนักงานใหญ่', branch_no: '', tax_address: order.company_address || '',
    email_to: order.company_email || '', original_recipient_name: order.shipping_contact_name || '', original_recipient_phone: order.shipping_contact_phone || '', original_shipping_address: order.shipping_address || '',
    sales_note: '',
  }
}

// ฟอร์มสร้าง/แก้ไขคำขอเอกสารบัญชี (อยู่ในป็อปอัปเดียว ไม่แยกหน้า) — ข้อมูลใบกำกับภาษีดึงจากออเดอร์ให้อัตโนมัติ แก้ไขได้ก่อนส่ง
// มี 2 ปุ่ม: "บันทึก (ฉบับร่าง)" เก็บไว้ก่อนยังไม่ส่งบัญชี (เผื่อส่งให้ลูกค้าเช็คก่อน) และ "ส่งคำขอ" ส่งเข้าคิวบัญชีจริง
function DocRequestForm({ order, existing, currentUser, isAdditional = false, onClose, onSaved }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [f, setF] = useState(() => initForm(existing, order))
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const baseFields = () => ({
    ...f,
    order_id: order.id, company_id: order.company_id, customer_name: order.customer_name,
    sales_id: existing?.sales_id || currentUser.id, sales_name: existing?.sales_name || currentUser.name,
  })

  const saveDraft = async () => {
    if (!f.document_type) { toast(t('กรุณาเลือกประเภทเอกสารก่อนบันทึก'), 'error'); return }
    setBusy(true)
    try { await saveAccountingDocDraft(baseFields(), existing); toast(t('บันทึกฉบับร่างแล้ว (ยังไม่ส่งบัญชี)'), 'success'); onSaved() }
    catch (e) { toast(lang === 'en' ? 'Save failed: ' + e.message : 'บันทึกไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const submit = async () => {
    if (!f.document_type) { toast(t('กรุณาเลือกประเภทเอกสาร'), 'error'); return }
    if (!f.delivery_method) { toast(t('กรุณาเลือกวิธีส่งเอกสาร'), 'error'); return }
    setBusy(true)
    try {
      if (isAdditional) {
        await requestAdditionalAccountingDoc(baseFields(), existing)
        toast(t('ส่งคำขอเอกสารเพิ่มให้บัญชีแล้ว'), 'success')
      } else {
        await submitAccountingDocRequest(baseFields(), existing)
        toast(existing?.submitted_at ? t('ส่งคำขอที่แก้ไขให้บัญชีแล้ว (ขึ้นสถานะอัพเดท)') : t('ส่งคำขอเข้าคิวบัญชีแล้ว'), 'success')
      }
      onSaved()
    } catch (e) { toast(lang === 'en' ? 'Submit failed: ' + e.message : 'ส่งคำขอไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  return (
    <div>
      <div className="form-group">
        <label className="form-label required">{t('ประเภทเอกสาร')}</label>
        <RadioGroup options={DOC_TYPES} value={f.document_type} onChange={v => setF(s => ({ ...s, document_type: v }))} />
      </div>
      <div className="form-group">
        <label className="form-label required">{t('วิธีส่งเอกสาร')}</label>
        <RadioGroup options={DOC_DELIVERY_METHODS} value={f.delivery_method} onChange={v => setF(s => ({ ...s, delivery_method: v }))} />
      </div>
      <div className="form-group">
        <label className="form-label">{t('ความเร่งด่วน')}</label>
        <RadioGroup options={DOC_PRIORITIES} value={f.priority} onChange={v => setF(s => ({ ...s, priority: v }))} />
      </div>

      {NEEDS_TAX(f.document_type) && (
        <>
          <label className="form-label" style={{ marginTop: 4 }}>{t('ข้อมูลใบกำกับภาษี')} <span style={{ fontWeight: 400, color: 'var(--text-light)' }}>{t('(ดึงจากออเดอร์ — แก้ไขได้ก่อนส่ง)')}</span></label>
          <div className="form-row">
            <div className="form-group"><label className="form-label required">{t('ชื่อบริษัท/ชื่อลูกค้า')}</label><input className="form-control" value={f.tax_name} onChange={set('tax_name')} /></div>
            <div className="form-group"><label className="form-label required">{t('เลขประจำตัวผู้เสียภาษี')}</label><input className="form-control" value={f.tax_id} onChange={set('tax_id')} /></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">{t('สำนักงานใหญ่ / สาขา')}</label>
              <RadioGroup options={['สำนักงานใหญ่', 'สาขา']} value={f.branch_type} onChange={v => setF(s => ({ ...s, branch_type: v }))} />
            </div>
            {f.branch_type === 'สาขา' && (
              <div className="form-group"><label className="form-label">{t('เลขที่สาขา')}</label><input className="form-control" value={f.branch_no} onChange={set('branch_no')} /></div>
            )}
          </div>
          <div className="form-group"><label className="form-label required">{t('ที่อยู่สำหรับออกเอกสาร')}</label><textarea className="form-control" rows={2} value={f.tax_address} onChange={set('tax_address')} /></div>
        </>
      )}

      {NEEDS_EMAIL(f.delivery_method) && (
        <div className="form-group">
          <label className="form-label required">{t('อีเมลผู้รับเอกสาร')}</label>
          <input className="form-control" type="email" value={f.email_to} onChange={set('email_to')} />
        </div>
      )}

      {NEEDS_ORIGINAL(f.delivery_method) && (
        <>
          <label className="form-label" style={{ marginTop: 4 }}>{t('ข้อมูลจัดส่งเอกสารตัวจริง')} <span style={{ fontWeight: 400, color: 'var(--text-light)' }}>{t('(ดึงจากที่อยู่จัดส่งของออเดอร์ — แก้ไขได้)')}</span></label>
          <div className="form-row">
            <div className="form-group"><label className="form-label required">{t('ชื่อผู้รับเอกสาร')}</label><input className="form-control" value={f.original_recipient_name} onChange={set('original_recipient_name')} /></div>
            <div className="form-group"><label className="form-label required">{t('เบอร์โทรผู้รับเอกสาร')}</label><input className="form-control" value={f.original_recipient_phone} onChange={set('original_recipient_phone')} /></div>
          </div>
          <div className="form-group"><label className="form-label required">{t('ที่อยู่จัดส่งเอกสารตัวจริง')}</label><textarea className="form-control" rows={2} value={f.original_shipping_address} onChange={set('original_shipping_address')} /></div>
        </>
      )}

      <div className="form-group">
        <label className="form-label">{t('หมายเหตุถึงบัญชี')}</label>
        <textarea className="form-control" rows={2} value={f.sales_note} onChange={set('sales_note')} />
      </div>

      {/* พรีวิวข้อมูล — เซลล์แคปหน้าจอ/บันทึก PDF ส่งลูกค้าเช็คก่อนกดส่งคำขอจริง */}
      {f.document_type && (
        <div className="card" style={{ marginTop: 4, marginBottom: 12, background: '#f4f6f9' }}>
          <div className="card-body" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <b style={{ color: 'var(--navy)' }}>{t('พรีวิวคำขอ (ให้ลูกค้าเช็คข้อมูล)')}</b>
              <button type="button" className="btn btn-outline btn-xs" onClick={() => printAccountingDocRequest(order, f)}>{t('ดาวน์โหลด / พิมพ์')}</button>
            </div>
            <div>{t('ออเดอร์')}: <b>{order.order_no}</b> · {t('ลูกค้า')}: {order.customer_name || '-'}</div>
            <div>{t('ประเภทเอกสาร')}: {f.document_type || '-'} · {t('วิธีส่ง')}: {f.delivery_method || '-'}</div>
            {NEEDS_TAX(f.document_type) && <div style={{ marginTop: 4 }}>{t('ออกในนาม')}: <b>{f.tax_name || '-'}</b> · {t('เลขผู้เสียภาษี')}: {f.tax_id || '-'} · {f.branch_type}{f.branch_type === 'สาขา' && f.branch_no ? ` ${f.branch_no}` : ''}<br />{t('ที่อยู่')}: {f.tax_address || '-'}</div>}
            {NEEDS_EMAIL(f.delivery_method) && <div>{t('อีเมล')}: {f.email_to || '-'}</div>}
            {NEEDS_ORIGINAL(f.delivery_method) && <div>{t('ส่งตัวจริงถึง')}: {f.original_recipient_name || '-'} ({f.original_recipient_phone || '-'}) · {f.original_shipping_address || '-'}</div>}
          </div>
        </div>
      )}

      <div className="modal-footer" style={{ padding: '4px 0 0', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>{t('ยกเลิก')}</button>
        {/* บันทึกฉบับร่างเฉพาะคำขอที่ยังไม่เคยส่ง (ใหม่/ฉบับร่าง) — คำขอที่ส่งบัญชีแล้วให้ใช้ "ส่งคำขอที่แก้ไข" เท่านั้น กันหลุดออกจากคิวบัญชี */}
        {!existing?.submitted_at && <button className="btn btn-secondary" onClick={saveDraft} disabled={busy}>{t('บันทึก (ฉบับร่าง)')}</button>}
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{isAdditional ? t('ส่งคำขอเอกสารเพิ่ม') : (existing?.submitted_at ? t('ส่งคำขอที่แก้ไข') : t('ส่งคำขอ'))}</button>
      </div>
    </div>
  )
}

// แสดงคำขอ 1 ใบ พร้อมไฟล์เอกสารที่บัญชีอัปโหลด (ดาวน์โหลดได้) + เลข tracking ตัวจริง + ปุ่มแก้ไข
// onRequestMore: เฉพาะคำขอที่ "เสร็จสิ้น" แล้ว — ลูกค้าขอไม่ครบตอนแรก เซลล์ขอเอกสารเพิ่มได้โดยไม่ต้องสร้างคำขอใหม่
function DocRequestCard({ req, onEdit, onRequestMore }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [files, setFiles] = useState(null)

  useEffect(() => { listAccountingDocFiles(req.id).then(setFiles).catch(() => setFiles([])) }, [req.id])
  const currentFiles = (files || []).filter(f => f.is_current)

  const download = async (file) => {
    try {
      const url = await getAccountingDocFileUrl(file.file_url, file.id)
      window.open(url, '_blank')
    } catch (e) { toast(lang === 'en' ? 'Failed to open file: ' + e.message : 'เปิดไฟล์ไม่สำเร็จ: ' + e.message, 'error') }
  }

  const isDraft = req.document_status === ACCOUNTING_DOC_STATUS.DRAFT

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>{req.document_type}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {req.revised_at && <span className="badge badge-orange">{t('อัพเดท')}</span>}
            {req.priority !== 'ปกติ' && <span className={`badge ${docPriorityBadgeClass(req.priority)}`}>{req.priority}</span>}
            <span className={`badge ${docStatusBadgeClass(req.document_status)}`}>{req.document_status}</span>
            <button className="btn btn-outline btn-xs" onClick={() => onEdit(req)}>{t('แก้ไข')}</button>
            {req.document_status === ACCOUNTING_DOC_STATUS.COMPLETED && (
              <button className="btn btn-secondary btn-xs" onClick={() => onRequestMore(req)}>{t('ขอเอกสารเพิ่ม')}</button>
            )}
          </div>
        </div>
        {isDraft && <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>{t('ฉบับร่าง — ยังไม่ส่งบัญชี กด "แก้ไข" แล้ว "ส่งคำขอ" เมื่อพร้อม')}</div>}
        {req.document_status === ACCOUNTING_DOC_STATUS.WAITING_SALES_INFO && req.missing_info_reason && (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{t('บัญชีแจ้งข้อมูลไม่ครบ')}: {req.missing_info_reason}</div>
        )}
        {req.accounting_note && <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>{t('หมายเหตุจากบัญชี')}: {req.accounting_note}</div>}
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>
          <div>{t('วิธีส่ง')}: {req.delivery_method}</div>
          {req.original_tracking_no && <div>{t('เลขพัสดุ (เอกสารตัวจริง)')}: <b style={{ color: 'var(--navy)' }}>{req.original_tracking_no}</b></div>}
        </div>

        {files === null ? <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('กำลังโหลดไฟล์...')}</div> : currentFiles.length ? (
          <div className="table-wrap" style={{ marginBottom: 8 }}>
            <table>
              <thead><tr><th>{t('เอกสาร')}</th><th></th></tr></thead>
              <tbody>
                {currentFiles.map(f => (
                  <tr key={f.id}>
                    <td>{DOC_FILE_TYPE_LABEL[f.file_type] || f.file_type}</td>
                    <td><button className="btn btn-outline btn-xs" onClick={() => download(f)}>{t('ดาวน์โหลด')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !isDraft && <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>{t('ยังไม่มีไฟล์ที่บัญชีอัปโหลด')}</div>}
      </div>
    </div>
  )
}

// ป็อปอัปหลักเปิดจากหน้า "ออเดอร์" — เซลล์ขอ/แก้ไขคำขอเอกสารบัญชี + ดู/ดาวน์โหลดเอกสารที่บัญชีออกให้ (แก้ไขไฟล์ไม่ได้)
// ป็อปอัปเดียวจบ: เลือก "ต้องการ/ไม่ต้องการ" ด้านบน ถ้าต้องการฟอร์มจะกางออกในหน้าเดียวกัน
export default function AccountingDocModal({ order, currentUser, onClose }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [requests, setRequests] = useState(null)
  const [formOpen, setFormOpen] = useState(false)   // true = แสดงฟอร์มสร้างใหม่
  const [editing, setEditing] = useState(null)       // คำขอที่กำลังแก้ไข (ถ้ามี)
  const [requestingMore, setRequestingMore] = useState(null) // คำขอที่ "เสร็จสิ้น" แล้ว กำลังขอเอกสารเพิ่ม (ถ้ามี)

  const load = () => {
    if (!order?.id) { setRequests([]); return }
    fetchAccountingDocRequestsByOrder(order.id).then(setRequests).catch(e => toast(lang === 'en' ? 'Failed to load data: ' + e.message : 'โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error'))
  }
  useEffect(() => { load() }, [order?.id])

  const onSaved = () => { setFormOpen(false); setEditing(null); setRequestingMore(null); load() }
  const startEdit = (req) => { setEditing(req); setFormOpen(false); setRequestingMore(null) }
  const startRequestMore = (req) => { setRequestingMore(req); setEditing(null); setFormOpen(false) }

  // ออเดอร์หนึ่งใบมีคำขอเอกสารได้ใบเดียว — ถ้ามีแล้วให้ "แก้ไข" ใบเดิม (ขึ้นสถานะอัพเดท) ไม่สร้างใบใหม่
  const hasRequest = (requests?.length || 0) > 0
  const showGate = !formOpen && !editing && !requestingMore && !hasRequest

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 660 }}>
        <div className="modal-header">
          <div className="modal-title">{t('เอกสารบัญชี')} · {order.order_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {requests === null ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-light)' }}>{t('กำลังโหลด...')}</div>
          ) : (
            <>
              {/* คำขอที่มีอยู่ — แก้ไขได้ (กด "แก้ไข" จะกางฟอร์มแทนการ์ดใบนั้น) */}
              {requests.map(req => (
                editing?.id === req.id
                  ? <div className="card" key={req.id} style={{ marginBottom: 10 }}><div className="card-body">
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('แก้ไขคำขอ')}: {req.document_type}</div>
                      <DocRequestForm order={order} existing={req} currentUser={currentUser} onClose={() => setEditing(null)} onSaved={onSaved} />
                    </div></div>
                  : requestingMore?.id === req.id
                  ? <div className="card" key={req.id} style={{ marginBottom: 10 }}><div className="card-body">
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('ขอเอกสารเพิ่ม')}: {req.document_type}</div>
                      <DocRequestForm order={order} existing={req} currentUser={currentUser} isAdditional onClose={() => setRequestingMore(null)} onSaved={onSaved} />
                    </div></div>
                  : <DocRequestCard key={req.id} req={req} onEdit={startEdit} onRequestMore={startRequestMore} />
              ))}

              {/* สร้างคำขอใหม่ — เฉพาะออเดอร์ที่ยังไม่มีคำขอ (มีแล้วให้กด "แก้ไข" ใบเดิม) */}
              {!hasRequest && !editing && !requestingMore && (formOpen ? (
                <div className="card"><div className="card-body">
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{t('คำขอเอกสารใหม่')}</div>
                  <DocRequestForm order={order} existing={null} currentUser={currentUser} onClose={() => setFormOpen(false)} onSaved={onSaved} />
                </div></div>
              ) : showGate && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label required">{t('ต้องการเอกสารบัญชีไหม')}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t('ไม่ต้องการ')}</button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}>{t('ต้องการ')}</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={onClose}>{t('ปิด')}</button></div>
      </div>
    </div>
  )
}
