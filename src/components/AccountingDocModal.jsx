import { useEffect, useState } from 'react'
import {
  DOC_TYPES, DOC_DELIVERY_METHODS, DOC_PRIORITIES, DOC_SENT_CHANNELS, DOC_SENT_CHANNEL_LABEL, DOC_FILE_TYPE_LABEL,
  ACCOUNTING_DOC_STATUS, accountingDocInfoComplete, fetchAccountingDocRequestsByOrder, addAccountingDocRequest,
  listAccountingDocFiles, getAccountingDocFileUrl, markAccountingDocFileSent, markDocSentToCustomer,
} from '../lib/api'
import { docStatusBadgeClass, docPriorityBadgeClass } from '../lib/format'
import { useUi } from './UiContext'

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

// ฟอร์มสร้างคำขอเอกสารบัญชีใหม่ — เซลล์เปิดจากหน้าออเดอร์ (ต้องการไหม/ประเภท/วิธีส่ง/ความเร่งด่วน + ข้อมูลภาษี/อีเมล/ที่อยู่ตามเงื่อนไข)
function NewDocRequestForm({ order, currentUser, onClose, onCreated }) {
  const { toast } = useUi()
  const [wants, setWants] = useState(null) // null = ยังไม่เลือก, true/false
  const [f, setF] = useState({
    document_type: '', delivery_method: '', priority: 'ปกติ',
    tax_name: '', tax_id: '', branch_type: '', branch_no: '', tax_address: '',
    email_to: '', original_recipient_name: '', original_recipient_phone: '', original_shipping_address: '',
    sales_note: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const submit = async () => {
    if (!f.document_type) { toast('กรุณาเลือกประเภทเอกสาร', 'error'); return }
    if (!f.delivery_method) { toast('กรุณาเลือกวิธีส่งเอกสาร', 'error'); return }
    setSaving(true)
    try {
      await onCreated({
        ...f,
        order_id: order.id,
        company_id: order.company_id,
        customer_name: order.customer_name,
        sales_id: currentUser.id,
        sales_name: currentUser.name,
      })
    } catch (e) {
      toast('บันทึกไม่สำเร็จ: ' + e.message, 'error')
      setSaving(false)
    }
  }

  if (wants === null) {
    return (
      <div className="form-group">
        <label className="form-label required">ต้องการเอกสารบัญชีไหม</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => onClose()}>ไม่ต้องการ</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setWants(true)}>ต้องการ</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="form-group">
        <label className="form-label required">ประเภทเอกสาร</label>
        <RadioGroup options={DOC_TYPES} value={f.document_type} onChange={v => setF(s => ({ ...s, document_type: v }))} />
      </div>
      <div className="form-group">
        <label className="form-label required">วิธีส่งเอกสาร</label>
        <RadioGroup options={DOC_DELIVERY_METHODS} value={f.delivery_method} onChange={v => setF(s => ({ ...s, delivery_method: v }))} />
      </div>
      <div className="form-group">
        <label className="form-label">ความเร่งด่วน</label>
        <RadioGroup options={DOC_PRIORITIES} value={f.priority} onChange={v => setF(s => ({ ...s, priority: v }))} />
      </div>

      {NEEDS_TAX(f.document_type) && (
        <>
          <label className="form-label" style={{ marginTop: 4 }}>ข้อมูลใบกำกับภาษี</label>
          <div className="form-row">
            <div className="form-group"><label className="form-label required">ชื่อบริษัท/ชื่อลูกค้า</label><input className="form-control" value={f.tax_name} onChange={set('tax_name')} /></div>
            <div className="form-group"><label className="form-label required">เลขประจำตัวผู้เสียภาษี</label><input className="form-control" value={f.tax_id} onChange={set('tax_id')} /></div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">สำนักงานใหญ่ / สาขา</label>
              <RadioGroup options={['สำนักงานใหญ่', 'สาขา']} value={f.branch_type} onChange={v => setF(s => ({ ...s, branch_type: v }))} />
            </div>
            {f.branch_type === 'สาขา' && (
              <div className="form-group"><label className="form-label">เลขที่สาขา</label><input className="form-control" value={f.branch_no} onChange={set('branch_no')} /></div>
            )}
          </div>
          <div className="form-group"><label className="form-label required">ที่อยู่สำหรับออกเอกสาร</label><textarea className="form-control" rows={2} value={f.tax_address} onChange={set('tax_address')} /></div>
        </>
      )}

      {NEEDS_EMAIL(f.delivery_method) && (
        <div className="form-group">
          <label className="form-label required">อีเมลผู้รับเอกสาร</label>
          <input className="form-control" type="email" value={f.email_to} onChange={set('email_to')} />
        </div>
      )}

      {NEEDS_ORIGINAL(f.delivery_method) && (
        <>
          <label className="form-label" style={{ marginTop: 4 }}>ข้อมูลจัดส่งเอกสารตัวจริง</label>
          <div className="form-row">
            <div className="form-group"><label className="form-label required">ชื่อผู้รับเอกสาร</label><input className="form-control" value={f.original_recipient_name} onChange={set('original_recipient_name')} /></div>
            <div className="form-group"><label className="form-label required">เบอร์โทรผู้รับเอกสาร</label><input className="form-control" value={f.original_recipient_phone} onChange={set('original_recipient_phone')} /></div>
          </div>
          <div className="form-group"><label className="form-label required">ที่อยู่จัดส่งเอกสารตัวจริง</label><textarea className="form-control" rows={2} value={f.original_shipping_address} onChange={set('original_shipping_address')} /></div>
        </>
      )}

      <div className="form-group">
        <label className="form-label">หมายเหตุถึงบัญชี</label>
        <textarea className="form-control" rows={2} value={f.sales_note} onChange={set('sales_note')} />
      </div>

      <div className="modal-footer" style={{ padding: '12px 0 0' }}>
        <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'ส่งคำขอ'}</button>
      </div>
    </div>
  )
}

// แสดงคำขอที่มีอยู่แล้ว 1 ใบ พร้อมไฟล์เอกสาร + ปุ่มดาวน์โหลด/mark ส่งลูกค้าแล้ว
function DocRequestCard({ req, orderNo, currentUser, onChanged }) {
  const { toast, confirm } = useUi()
  const [files, setFiles] = useState(null)
  const [channel, setChannel] = useState('email')
  const [busy, setBusy] = useState(false)

  useEffect(() => { listAccountingDocFiles(req.id).then(setFiles).catch(() => setFiles([])) }, [req.id])

  const currentFiles = (files || []).filter(f => f.is_current)

  const download = async (file) => {
    try {
      const url = await getAccountingDocFileUrl(file.file_url, file.id)
      window.open(url, '_blank')
    } catch (e) { toast('เปิดไฟล์ไม่สำเร็จ: ' + e.message, 'error') }
  }

  const copyMessage = async () => {
    const docNos = [req.invoice_no, req.tax_invoice_no, req.receipt_no].filter(Boolean).join(', ')
    const msg = `เรียน คุณ${req.customer_name || ''}\n\nทางบริษัทขอนำส่งเอกสาร${req.document_type} เลขที่ ${docNos || '-'}\nสำหรับออเดอร์เลขที่ ${orderNo || '-'}\n\nขอบคุณค่ะ/ครับ`
    try { await navigator.clipboard.writeText(msg); toast('คัดลอกข้อความแล้ว', 'success') }
    catch { toast('คัดลอกไม่สำเร็จ', 'error') }
  }

  const markSent = async () => {
    if (!(await confirm('ยืนยันว่าส่งเอกสารให้ลูกค้าแล้ว?'))) return
    setBusy(true)
    try {
      for (const file of currentFiles) {
        await markAccountingDocFileSent(file.id, channel, currentUser.name)
      }
      await markDocSentToCustomer(req.id, req.delivery_method)
      toast('บันทึกแล้ว', 'success')
      onChanged()
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const canMarkSent = req.document_status === ACCOUNTING_DOC_STATUS.READY && currentFiles.length > 0

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>{req.document_type}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {req.priority !== 'ปกติ' && <span className={`badge ${docPriorityBadgeClass(req.priority)}`}>{req.priority}</span>}
            <span className={`badge ${docStatusBadgeClass(req.document_status)}`}>{req.document_status}</span>
          </div>
        </div>
        {req.document_status === ACCOUNTING_DOC_STATUS.WAITING_SALES_INFO && req.missing_info_reason && (
          <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>บัญชีแจ้งข้อมูลไม่ครบ: {req.missing_info_reason}</div>
        )}
        {req.accounting_note && <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>หมายเหตุจากบัญชี: {req.accounting_note}</div>}
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>
          {req.invoice_no && <div>เลขที่ใบแจ้งหนี้: {req.invoice_no}</div>}
          {req.tax_invoice_no && <div>เลขที่ใบกำกับภาษี: {req.tax_invoice_no}</div>}
          {req.receipt_no && <div>เลขที่ใบเสร็จ: {req.receipt_no}</div>}
        </div>

        {files === null ? <div style={{ fontSize: 12, color: 'var(--text-light)' }}>กำลังโหลดไฟล์...</div> : currentFiles.length ? (
          <div className="table-wrap" style={{ marginBottom: 8 }}>
            <table>
              <thead><tr><th>ประเภทไฟล์</th><th>เลขที่เอกสาร</th><th></th></tr></thead>
              <tbody>
                {currentFiles.map(f => (
                  <tr key={f.id}>
                    <td>{DOC_FILE_TYPE_LABEL[f.file_type] || f.file_type}</td>
                    <td>{f.document_no || '-'}</td>
                    <td><button className="btn btn-outline btn-xs" onClick={() => download(f)}>ดาวน์โหลด</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>ยังไม่มีไฟล์ที่บัญชีอัปโหลด</div>}

        {currentFiles.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-xs" onClick={copyMessage}>คัดลอกข้อความสำหรับส่งลูกค้า</button>
            {canMarkSent && (
              <>
                <select className="filter-select" value={channel} onChange={e => setChannel(e.target.value)} style={{ height: 28, fontSize: 12 }}>
                  {DOC_SENT_CHANNELS.map(c => <option key={c} value={c}>{DOC_SENT_CHANNEL_LABEL[c]}</option>)}
                </select>
                <button className="btn btn-success btn-xs" onClick={markSent} disabled={busy}>Mark ว่าส่งให้ลูกค้าแล้ว</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ป็อปอัปหลักเปิดจากหน้า "ออเดอร์" — เซลล์ขอเอกสารบัญชี + ดู/ดาวน์โหลดเอกสารที่บัญชีออกให้ (ดูอย่างเดียว แก้ไขไม่ได้)
export default function AccountingDocModal({ order, currentUser, onClose }) {
  const { toast } = useUi()
  const [requests, setRequests] = useState(null)
  const [showNew, setShowNew] = useState(false)

  const load = () => {
    if (!order?.id) { setRequests([]); return }
    fetchAccountingDocRequestsByOrder(order.id).then(setRequests).catch(e => toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error'))
  }
  useEffect(() => { load() }, [order?.id])

  const onCreated = async (fields) => {
    const complete = accountingDocInfoComplete(fields)
    await addAccountingDocRequest(fields)
    toast(complete ? 'ส่งคำขอเอกสารเข้าคิวบัญชีแล้ว' : 'บันทึกคำขอแล้ว รอเซลล์กรอกข้อมูลให้ครบ', 'success')
    setShowNew(false)
    load()
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div className="modal-title">เอกสารบัญชี · {order.order_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {requests === null ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-light)' }}>กำลังโหลด...</div>
          ) : (
            <>
              {requests.map(req => <DocRequestCard key={req.id} req={req} orderNo={order.order_no} currentUser={currentUser} onChanged={load} />)}
              {showNew ? (
                <div className="card"><div className="card-body"><NewDocRequestForm order={order} currentUser={currentUser} onClose={() => setShowNew(false)} onCreated={onCreated} /></div></div>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>+ ขอเอกสารบัญชี</button>
              )}
            </>
          )}
        </div>
        {!showNew && <div className="modal-footer"><button className="btn btn-outline" onClick={onClose}>ปิด</button></div>}
      </div>
    </div>
  )
}
