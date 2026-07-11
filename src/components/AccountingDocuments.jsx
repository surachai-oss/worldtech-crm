import { useEffect, useState } from 'react'
import {
  ACCOUNTING_DOC_STATUS, ACCOUNTING_DOC_STATUS_LIST, DOC_PRIORITIES, DOC_FILE_TYPES, DOC_FILE_TYPE_LABEL,
  fetchAccountingDocRequests, fetchAccountingDocSummary, updateAccountingDocRequest,
  markDocMissingInfo, markDocPendingIssue, saveAccountingDocNumbers, markDocEmailSent, markDocOriginalSent,
  markDocCompleted, markDocCancelled, listAccountingDocFiles, uploadAccountingDocFile, getAccountingDocFileUrl,
} from '../lib/api'
import { fmtCurrency, fmtDate, docStatusBadgeClass, docPriorityBadgeClass } from '../lib/format'
import { useUi } from './UiContext'

const NEEDS_ORIGINAL = (m) => m === 'ส่งตัวจริง' || m === 'ส่งทั้งอีเมลและตัวจริง'

// ป็อปอัปดูรายละเอียด + ทำ action ฝั่งบัญชี (ตรวจสอบ/ใส่เลขเอกสาร/ส่งอีเมลแล้ว/ส่งตัวจริงแล้ว/เสร็จสิ้น/ยกเลิก)
function DetailModal({ req, onClose, onChanged }) {
  const { toast } = useUi()
  const [missingReason, setMissingReason] = useState(req.missing_info_reason || '')
  const [nums, setNums] = useState({ invoice_no: req.invoice_no || '', tax_invoice_no: req.tax_invoice_no || '', receipt_no: req.receipt_no || '', issued_date: req.issued_date || '' })
  const [trackingNo, setTrackingNo] = useState(req.original_tracking_no || '')
  const [accountingNote, setAccountingNote] = useState(req.accounting_note || '')
  const [busy, setBusy] = useState(false)

  const run = async (fn, msg) => {
    setBusy(true)
    try { await fn(); toast(msg, 'success'); onChanged(); onClose() }
    catch (e) { toast('ทำรายการไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const saveNote = async () => {
    try { await updateAccountingDocRequest(req.id, { accounting_note: accountingNote }); toast('บันทึกหมายเหตุแล้ว', 'success'); onChanged() }
    catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error') }
  }

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-light)' }}>{label}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <div className="modal-title">รายละเอียดคำขอเอกสารบัญชี</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Row label="ออเดอร์ (ใบเสนอราคา)" value={req.order?.quot_no || '-'} />
          <Row label="ลูกค้า" value={req.customer_name || '-'} />
          <Row label="เซลล์ผู้ขอ" value={req.sales_name || '-'} />
          <Row label="ประเภทเอกสาร" value={req.document_type} />
          <Row label="วิธีส่งเอกสาร" value={req.delivery_method} />
          <Row label="ความเร่งด่วน" value={<span className={`badge ${docPriorityBadgeClass(req.priority)}`}>{req.priority}</span>} />
          <Row label="สถานะ" value={<span className={`badge ${docStatusBadgeClass(req.document_status)}`}>{req.document_status}</span>} />
          {req.tax_name && <Row label="ข้อมูลภาษี" value={`${req.tax_name} · ${req.tax_id} · ${req.branch_type}${req.branch_no ? ' ' + req.branch_no : ''}`} />}
          {req.tax_address && <Row label="ที่อยู่ออกเอกสาร" value={req.tax_address} />}
          {req.email_to && <Row label="อีเมลผู้รับ" value={req.email_to} />}
          {req.original_recipient_name && <Row label="ผู้รับเอกสารตัวจริง" value={`${req.original_recipient_name} · ${req.original_recipient_phone}`} />}
          {req.original_shipping_address && <Row label="ที่อยู่จัดส่งตัวจริง" value={req.original_shipping_address} />}
          {req.sales_note && <Row label="หมายเหตุจากเซลล์" value={req.sales_note} />}

          {req.document_status === ACCOUNTING_DOC_STATUS.PENDING_REVIEW && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">เหตุผลถ้าข้อมูลไม่ครบ</label>
              <textarea className="form-control" rows={2} value={missingReason} onChange={e => setMissingReason(e.target.value)} placeholder="เช่น ไม่มีเลขผู้เสียภาษี" />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button className="btn btn-outline btn-sm" disabled={busy || !missingReason.trim()} onClick={() => run(() => markDocMissingInfo(req.id, missingReason.trim()), 'ส่งกลับให้เซลล์แก้ไขแล้ว')}>ข้อมูลไม่ครบ</button>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => markDocPendingIssue(req.id), 'ผ่านการตรวจสอบแล้ว')}>ตรวจสอบผ่าน — รอออกเอกสาร</button>
              </div>
            </div>
          )}

          {(req.document_status === ACCOUNTING_DOC_STATUS.PENDING_ISSUE || req.document_status === ACCOUNTING_DOC_STATUS.PENDING_UPLOAD) && (
            <div style={{ marginTop: 12 }}>
              <label className="form-label">เลขที่เอกสาร</label>
              <div className="form-row">
                <div className="form-group"><label className="form-label" style={{ fontWeight: 400 }}>เลขที่ใบแจ้งหนี้</label><input className="form-control" value={nums.invoice_no} onChange={e => setNums(s => ({ ...s, invoice_no: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label" style={{ fontWeight: 400 }}>เลขที่ใบกำกับภาษี</label><input className="form-control" value={nums.tax_invoice_no} onChange={e => setNums(s => ({ ...s, tax_invoice_no: e.target.value }))} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label" style={{ fontWeight: 400 }}>เลขที่ใบเสร็จ</label><input className="form-control" value={nums.receipt_no} onChange={e => setNums(s => ({ ...s, receipt_no: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label" style={{ fontWeight: 400 }}>วันที่ออกเอกสาร</label><input className="form-control" type="date" value={nums.issued_date} onChange={e => setNums(s => ({ ...s, issued_date: e.target.value }))} /></div>
              </div>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => saveAccountingDocNumbers(req.id, nums), 'บันทึกเลขที่เอกสารแล้ว — อัปโหลดไฟล์ได้เลย')}>บันทึกเลขที่เอกสาร</button>
            </div>
          )}

          {req.document_status === ACCOUNTING_DOC_STATUS.READY && (
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!req.email_sent_at && (req.delivery_method === 'ส่งสำเนาทางอีเมล' || req.delivery_method === 'ส่งทั้งอีเมลและตัวจริง') && (
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(() => markDocEmailSent(req.id), 'บันทึกว่าส่งอีเมลแล้ว')}>Mark ว่าส่งอีเมลแล้ว (บัญชีเป็นคนส่ง)</button>
              )}
            </div>
          )}

          {req.document_status === ACCOUNTING_DOC_STATUS.PENDING_ORIGINAL && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">Tracking เอกสารตัวจริง</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="form-control" value={trackingNo} onChange={e => setTrackingNo(e.target.value)} placeholder="เลข tracking ขนส่ง" />
                <button className="btn btn-primary btn-sm" disabled={busy || !trackingNo.trim()} onClick={() => run(() => markDocOriginalSent(req.id, trackingNo.trim()), 'บันทึกการส่งตัวจริงแล้ว')} style={{ whiteSpace: 'nowrap' }}>ส่งตัวจริงแล้ว</button>
              </div>
            </div>
          )}

          {[ACCOUNTING_DOC_STATUS.READY, ACCOUNTING_DOC_STATUS.SENT_TO_CUSTOMER, ACCOUNTING_DOC_STATUS.ORIGINAL_SENT].includes(req.document_status) && (
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-success btn-sm" disabled={busy} onClick={() => run(() => markDocCompleted(req.id), 'ปิดงานเรียบร้อยแล้ว')}>Mark เสร็จสิ้น</button>
            </div>
          )}

          {![ACCOUNTING_DOC_STATUS.COMPLETED, ACCOUNTING_DOC_STATUS.CANCELLED].includes(req.document_status) && (
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => markDocCancelled(req.id), 'ยกเลิกคำขอแล้ว')}>ยกเลิกคำขอ</button>
            </div>
          )}

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">หมายเหตุจากบัญชี (แสดงให้เซลล์เห็น)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <textarea className="form-control" rows={2} value={accountingNote} onChange={e => setAccountingNote(e.target.value)} />
              <button className="btn btn-outline btn-sm" onClick={saveNote} style={{ alignSelf: 'flex-start' }}>บันทึก</button>
            </div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={onClose}>ปิด</button></div>
      </div>
    </div>
  )
}

// ป็อปอัป Upload เอกสาร PDF — เลือกประเภทไฟล์ + เลขที่เอกสาร + วันที่ + หมายเหตุ (เวอร์ชันใหม่ ไม่ลบไฟล์เก่า)
function UploadModal({ req, onClose, onChanged, currentUserName }) {
  const { toast } = useUi()
  const [fileType, setFileType] = useState(DOC_FILE_TYPES.INVOICE)
  const [documentNo, setDocumentNo] = useState('')
  const [documentDate, setDocumentDate] = useState('')
  const [note, setNote] = useState('')
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState(null)

  useEffect(() => { listAccountingDocFiles(req.id).then(setFiles).catch(() => setFiles([])) }, [req.id])

  const submit = async () => {
    if (!file) { toast('กรุณาเลือกไฟล์', 'error'); return }
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase()
    if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(ext)) { toast('รองรับเฉพาะไฟล์ PDF หรือรูปภาพ (jpg/png)', 'error'); return }
    setSaving(true)
    try {
      await uploadAccountingDocFile(req, file, { file_type: fileType, document_no: documentNo, document_date: documentDate, note, uploaderName: currentUserName })
      toast('อัปโหลดสำเร็จ — เอกสารพร้อมดาวน์โหลดแล้ว', 'success')
      onChanged()
      onClose()
    } catch (e) {
      toast('อัปโหลดไม่สำเร็จ: ' + e.message, 'error')
      setSaving(false)
    }
  }

  const viewFile = async (f) => {
    try { window.open(await getAccountingDocFileUrl(f.file_url), '_blank') }
    catch (e) { toast('เปิดไฟล์ไม่สำเร็จ: ' + e.message, 'error') }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Upload เอกสาร · {req.customer_name}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">ประเภทเอกสาร</label>
            <select className="form-control" value={fileType} onChange={e => setFileType(e.target.value)}>
              {Object.values(DOC_FILE_TYPES).map(t => <option key={t} value={t}>{DOC_FILE_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group"><label className="form-label">เลขที่เอกสาร</label><input className="form-control" value={documentNo} onChange={e => setDocumentNo(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">วันที่ออกเอกสาร</label><input className="form-control" type="date" value={documentDate} onChange={e => setDocumentDate(e.target.value)} /></div>
          </div>
          <div className="form-group">
            <label className="form-label">หมายเหตุ</label>
            <textarea className="form-control" rows={2} value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label required">ไฟล์เอกสาร (PDF หรือรูปภาพ)</label>
            <input className="form-control" type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
          </div>

          {files?.length > 0 && (
            <>
              <label className="form-label" style={{ marginTop: 8 }}>ไฟล์ที่อัปโหลดไว้แล้ว</label>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>ประเภท</th><th>เลขที่</th><th>เวอร์ชัน</th><th></th></tr></thead>
                  <tbody>
                    {files.map(f => (
                      <tr key={f.id} style={{ opacity: f.is_current ? 1 : 0.55 }}>
                        <td>{DOC_FILE_TYPE_LABEL[f.file_type] || f.file_type}</td>
                        <td>{f.document_no || '-'}</td>
                        <td>v{f.version_no}{f.is_current ? '' : ' (เก่า)'}</td>
                        <td><button className="btn btn-outline btn-xs" onClick={() => viewFile(f)}>ดู</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'กำลังอัปโหลด...' : 'อัปโหลด'}</button>
        </div>
      </div>
    </div>
  )
}

export default function AccountingDocuments({ reloadKey, currentUserName }) {
  const { toast } = useUi()
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailReq, setDetailReq] = useState(null)
  const [uploadReq, setUploadReq] = useState(null)

  const load = () => {
    setLoading(true)
    fetchAccountingDocRequests({ status, priority, q, dateFrom: fromDate, dateTo: toDate })
      .then(setRows).catch(e => toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error'))
      .finally(() => setLoading(false))
    fetchAccountingDocSummary().then(setSummary).catch(() => {})
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => { if (alive) load() }, 250)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority, q, fromDate, toDate, reloadKey])

  const SUMMARY_CARDS = summary ? [
    { label: 'รอข้อมูลจากเซลล์', value: summary.byStatus[ACCOUNTING_DOC_STATUS.WAITING_SALES_INFO], onClick: () => setStatus(ACCOUNTING_DOC_STATUS.WAITING_SALES_INFO) },
    { label: 'รอบัญชีตรวจสอบ', value: summary.byStatus[ACCOUNTING_DOC_STATUS.PENDING_REVIEW], onClick: () => setStatus(ACCOUNTING_DOC_STATUS.PENDING_REVIEW) },
    { label: 'รอออกเอกสาร', value: summary.byStatus[ACCOUNTING_DOC_STATUS.PENDING_ISSUE], onClick: () => setStatus(ACCOUNTING_DOC_STATUS.PENDING_ISSUE) },
    { label: 'รออัปโหลดเอกสาร', value: summary.byStatus[ACCOUNTING_DOC_STATUS.PENDING_UPLOAD], onClick: () => setStatus(ACCOUNTING_DOC_STATUS.PENDING_UPLOAD) },
    { label: 'เอกสารพร้อมดาวน์โหลด', value: summary.byStatus[ACCOUNTING_DOC_STATUS.READY], onClick: () => setStatus(ACCOUNTING_DOC_STATUS.READY) },
    { label: 'งานด่วน', value: summary.urgent, onClick: () => setStatus('') },
    { label: 'งานเกินกำหนด', value: summary.overdue, onClick: () => setStatus('') },
    { label: 'เสร็จสิ้นวันนี้', value: summary.completedToday, onClick: () => setStatus(ACCOUNTING_DOC_STATUS.COMPLETED) },
  ] : []

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">เอกสารบัญชี <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} รายการ)</span></div>
      </div>

      {summary && (
        <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
          {SUMMARY_CARDS.map(c => (
            <div className="kpi-card" key={c.label} onClick={c.onClick} style={{ cursor: 'pointer' }}>
              <div className="kpi-label">{c.label}</div>
              <div className="kpi-value">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {ACCOUNTING_DOC_STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="">ทุกความเร่งด่วน</option>
          {DOC_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="filter-input" placeholder="ค้นหา ลูกค้า/เซลล์/เลขเอกสาร..." value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 220 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่ส่งคำขอ ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่ส่งคำขอ ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
        </div>
      </div>

      {detailReq && <DetailModal req={detailReq} onClose={() => setDetailReq(null)} onChanged={load} />}
      {uploadReq && <UploadModal req={uploadReq} onClose={() => setUploadReq(null)} onChanged={load} currentUserName={currentUserName} />}

      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>เลขที่ออเดอร์</th><th>วันที่ขาย</th><th>ลูกค้า</th><th>เซลล์</th><th>ยอดเงิน</th>
                  <th>ประเภทเอกสาร</th><th>วิธีส่ง</th><th>ความเร่งด่วน</th><th>สถานะ</th>
                  <th>อีเมลลูกค้า</th><th>ส่งตัวจริง</th><th>เลขที่เอกสาร</th><th>วันที่ออก</th><th>Tracking</th>
                  <th>การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(req => (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{req.order?.quot_no || '-'}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(req.order?.quot_date)}</td>
                    <td>{req.customer_name || '-'}</td>
                    <td style={{ fontSize: 12 }}>{req.sales_name || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{fmtCurrency(req.order?.value)}</td>
                    <td style={{ fontSize: 12 }}>{req.document_type}</td>
                    <td style={{ fontSize: 12 }}>{req.delivery_method}</td>
                    <td>{req.priority !== 'ปกติ' ? <span className={`badge ${docPriorityBadgeClass(req.priority)}`}>{req.priority}</span> : '-'}</td>
                    <td><span className={`badge ${docStatusBadgeClass(req.document_status)}`}>{req.document_status}</span></td>
                    <td style={{ fontSize: 12 }}>{req.email_to || '-'}</td>
                    <td style={{ fontSize: 12 }}>{NEEDS_ORIGINAL(req.delivery_method) ? 'ใช่' : 'ไม่'}</td>
                    <td style={{ fontSize: 11 }}>
                      {req.invoice_no && <div>แจ้งหนี้: {req.invoice_no}</div>}
                      {req.tax_invoice_no && <div>กำกับภาษี: {req.tax_invoice_no}</div>}
                      {req.receipt_no && <div>ใบเสร็จ: {req.receipt_no}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(req.issued_date)}</td>
                    <td style={{ fontSize: 12 }}>{req.original_tracking_no || '-'}</td>
                    <td className="td-actions">
                      <button className="btn btn-outline btn-xs" onClick={() => setDetailReq(req)}>ดูรายละเอียด</button>
                      <button className="btn btn-secondary btn-xs" onClick={() => setUploadReq(req)}>Upload เอกสาร</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ไม่มีคำขอเอกสารบัญชี'}</div></div>}
        </div>
      </div>
    </div>
  )
}
