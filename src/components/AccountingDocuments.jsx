import { useEffect, useState } from 'react'
import {
  ACCOUNTING_DOC_STATUS, ACCOUNTING_DOC_STATUS_LIST, DOC_PRIORITIES, DOC_FILE_TYPES, DOC_FILE_TYPE_LABEL,
  fetchAccountingDocRequests, updateAccountingDocRequest,
  markDocMissingInfo, approveAccountingDocRequest, markDocOriginalSent, markDocCancelled,
  listAccountingDocFiles, uploadAccountingDocFile, uploadAccountingDocExtraFile, getAccountingDocFileUrl,
} from '../lib/api'
import { fmtCurrency, fmtDate, docStatusBadgeClass, docPriorityBadgeClass } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

const NEEDS_ORIGINAL = (m) => m === 'ส่งตัวจริง' || m === 'ส่งทั้งอีเมลและตัวจริง'

// map ประเภทเอกสารที่ลูกค้าขอ -> ชนิดไฟล์ที่บันทึก (บัญชีไม่ต้องเลือกเอง อัปโหลดไฟล์เดียวจบ)
const DOC_TYPE_TO_FILE = {
  'ใบแจ้งหนี้': DOC_FILE_TYPES.INVOICE,
  'ใบกำกับภาษี + ใบเสร็จรับเงิน': DOC_FILE_TYPES.TAX_INVOICE_RECEIPT,
  'ใบเสร็จรับเงิน': DOC_FILE_TYPES.RECEIPT,
  'เอกสารอื่นๆ': DOC_FILE_TYPES.OTHER,
}

// ป็อปอัปดูรายละเอียด + ทำ action ฝั่งบัญชี — flow ใหม่: ตรวจ (ข้อมูลไม่ครบ/อนุมัติ) -> อัปโหลดเอกสาร -> (ถ้าต้องส่งตัวจริง) ใส่ tracking -> เสร็จสิ้น
function DetailModal({ req, currentUserName, onClose, onChanged }) {
  const { toast } = useUi()
  const { t } = useLanguage()
  const [missingReason, setMissingReason] = useState(req.missing_info_reason || '')
  const [trackingNo, setTrackingNo] = useState(req.original_tracking_no || '')
  const [accountingNote, setAccountingNote] = useState(req.accounting_note || '')
  const [file, setFile] = useState(null)
  const [files, setFiles] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showAddFile, setShowAddFile] = useState(false)
  const [addFileType, setAddFileType] = useState(DOC_FILE_TYPES.OTHER)
  const [addFile, setAddFile] = useState(null)

  const reloadFiles = () => listAccountingDocFiles(req.id).then(setFiles).catch(() => setFiles([]))
  useEffect(() => { reloadFiles() }, [req.id])
  const currentFiles = (files || []).filter(f => f.is_current)

  const run = async (fn, msg) => {
    setBusy(true)
    try { await fn(); toast(msg, 'success'); onChanged(); onClose() }
    catch (e) { toast('ทำรายการไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const uploadDoc = async () => {
    if (!file) { toast('กรุณาเลือกไฟล์เอกสาร', 'error'); return }
    const ext = (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase()
    if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(ext)) { toast('รองรับเฉพาะไฟล์ PDF หรือรูปภาพ (jpg/png)', 'error'); return }
    await run(() => uploadAccountingDocFile(req, file, {
      file_type: DOC_TYPE_TO_FILE[req.document_type] || DOC_FILE_TYPES.OTHER, document_no: '', document_date: '', note: '', uploaderName: currentUserName,
    }), NEEDS_ORIGINAL(req.delivery_method) ? 'อัปโหลดแล้ว — รอส่งเอกสารตัวจริง' : 'อัปโหลดแล้ว — ปิดงานเรียบร้อย')
  }

  // เพิ่มไฟล์เอกสารประเภทอื่นให้คำขอเดิม (เช่น ลูกค้าขอทั้งใบแจ้งหนี้และใบกำกับภาษีแยกไฟล์กัน) — ไม่ปิด modal เพราะอาจต้องเพิ่มได้อีกหลายไฟล์
  const uploadExtraDoc = async () => {
    if (!addFile) { toast('กรุณาเลือกไฟล์เอกสาร', 'error'); return }
    const ext = (addFile.name.match(/\.[^.]+$/) || [''])[0].toLowerCase()
    if (!['.pdf', '.jpg', '.jpeg', '.png'].includes(ext)) { toast('รองรับเฉพาะไฟล์ PDF หรือรูปภาพ (jpg/png)', 'error'); return }
    setBusy(true)
    try {
      await uploadAccountingDocExtraFile(req, addFile, { file_type: addFileType, document_no: '', document_date: '', note: '', uploaderName: currentUserName })
      toast('เพิ่มไฟล์แล้ว', 'success')
      await reloadFiles()
      setAddFile(null); setShowAddFile(false)
      onChanged()
    } catch (e) { toast('เพิ่มไฟล์ไม่สำเร็จ: ' + e.message, 'error') }
    finally { setBusy(false) }
  }

  const viewFile = async (f) => {
    try { window.open(await getAccountingDocFileUrl(f.file_url), '_blank') }
    catch (e) { toast('เปิดไฟล์ไม่สำเร็จ: ' + e.message, 'error') }
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

  const FilesList = () => {
    if (!currentFiles.length) return null
    return (
      <div style={{ marginTop: 10, marginBottom: 4 }}>
        <div className="table-wrap" style={{ marginBottom: 8 }}>
          <table>
            <thead><tr><th>{t('เอกสารที่อัปโหลดแล้ว')}</th><th></th></tr></thead>
            <tbody>
              {currentFiles.map(f => (
                <tr key={f.id}><td>{DOC_FILE_TYPE_LABEL[f.file_type] || f.file_type} · v{f.version_no}</td><td><button className="btn btn-outline btn-xs" onClick={() => viewFile(f)}>{t('ดู')}</button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {req.document_status !== ACCOUNTING_DOC_STATUS.CANCELLED && (
          showAddFile ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, marginBottom: 8 }}>
              <label className="form-label">{t('เพิ่มไฟล์เอกสาร (กรณีลูกค้าขอเอกสารหลายอย่าง)')}</label>
              <select className="form-control" value={addFileType} onChange={e => setAddFileType(e.target.value)} style={{ marginBottom: 6 }}>
                {Object.values(DOC_FILE_TYPES).map(ft => <option key={ft} value={ft}>{DOC_FILE_TYPE_LABEL[ft] || ft}</option>)}
              </select>
              <input className="form-control" type="file" accept=".pdf,image/*" onChange={e => setAddFile(e.target.files?.[0] || null)} style={{ marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={uploadExtraDoc}>{busy ? t('กำลังอัปโหลด...') : t('อัปโหลด')}</button>
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => { setShowAddFile(false); setAddFile(null) }}>{t('ยกเลิก')}</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-outline btn-xs" onClick={() => setShowAddFile(true)}>{t('+ เพิ่มไฟล์')}</button>
          )
        )}
      </div>
    )
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <div className="modal-title">{t('รายละเอียดคำขอเอกสารบัญชี')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Row label={t('เลขที่ออเดอร์')} value={req.order?.order_no || '-'} />
          <Row label={t('ลูกค้า')} value={req.customer_name || '-'} />
          <Row label={t('เซลล์ผู้ขอ')} value={req.sales_name || '-'} />
          <Row label={t('ประเภทเอกสาร')} value={req.document_type} />
          <Row label={t('วิธีส่งเอกสาร')} value={req.delivery_method} />
          <Row label={t('ความเร่งด่วน')} value={<span className={`badge ${docPriorityBadgeClass(req.priority)}`}>{req.priority}</span>} />
          <Row label={t('สถานะ')} value={<span className={`badge ${docStatusBadgeClass(req.document_status)}`}>{req.document_status}</span>} />
          {req.revised_at && <Row label={t('อัพเดทจากเซลล์')} value={<span className="badge badge-orange">{t('แก้ไขล่าสุด')} {fmtDate(req.revised_at)}</span>} />}
          {req.tax_name && <Row label={t('ข้อมูลภาษี')} value={`${req.tax_name} · ${req.tax_id} · ${req.branch_type}${req.branch_no ? ' ' + req.branch_no : ''}`} />}
          {req.tax_address && <Row label={t('ที่อยู่ออกเอกสาร')} value={req.tax_address} />}
          {req.email_to && <Row label={t('อีเมลผู้รับ')} value={req.email_to} />}
          {req.original_recipient_name && <Row label={t('ผู้รับเอกสารตัวจริง')} value={`${req.original_recipient_name} · ${req.original_recipient_phone}`} />}
          {req.original_shipping_address && <Row label={t('ที่อยู่จัดส่งตัวจริง')} value={req.original_shipping_address} />}
          {req.original_tracking_no && <Row label="Tracking" value={req.original_tracking_no} />}
          {req.sales_note && <Row label={t('หมายเหตุจากเซลล์')} value={req.sales_note} />}

          {/* ขั้นตรวจสอบ: เลือกก่อนว่า ข้อมูลไม่ครบ หรือ อนุมัติ */}
          {req.document_status === ACCOUNTING_DOC_STATUS.PENDING_REVIEW && (
            <div style={{ marginTop: 14 }}>
              <label className="form-label">{t('ผลการตรวจสอบ')}</label>
              <textarea className="form-control" rows={2} value={missingReason} onChange={e => setMissingReason(e.target.value)} placeholder={t('ถ้าข้อมูลไม่ครบ ระบุว่าต้องการอะไรเพิ่ม เช่น ไม่มีเลขผู้เสียภาษี / ที่อยู่ไม่ครบ')} />
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-outline btn-sm" disabled={busy || !missingReason.trim()} onClick={() => run(() => markDocMissingInfo(req.id, missingReason.trim()), t('ส่งกลับให้เซลล์แก้ไขแล้ว'))} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{t('ข้อมูลไม่ครบ')}</button>
                <button className="btn btn-success btn-sm" disabled={busy} onClick={() => run(() => approveAccountingDocRequest(req.id), t('อนุมัติแล้ว — อัปโหลดเอกสารได้เลย'))}>{t('อนุมัติ')}</button>
              </div>
            </div>
          )}

          {/* ขั้นอัปโหลดเอกสาร: ไม่ต้องกรอกเลขเอกสาร อัปโหลดไฟล์เดียวจบ -> เสร็จสิ้น (หรือไปรอส่งตัวจริง) */}
          {req.document_status === ACCOUNTING_DOC_STATUS.PENDING_UPLOAD && (
            <div style={{ marginTop: 14 }}>
              <FilesList />
              <label className="form-label required">{t('อัปโหลดเอกสาร (PDF หรือรูปภาพ)')}</label>
              <input className="form-control" type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} />
              <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={uploadDoc}>{busy ? t('กำลังอัปโหลด...') : t('อัปโหลดเอกสาร')}</button>
              {NEEDS_ORIGINAL(req.delivery_method) && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('ออเดอร์นี้ต้องส่งเอกสารตัวจริงด้วย — อัปโหลดแล้วจะไปขั้น "รอส่งตัวจริง"')}</div>}
            </div>
          )}

          {/* ขั้นส่งตัวจริง: ใส่เลข tracking แล้วปิดงาน — เลข tracking เด้งไปให้เซลล์เห็นในหน้าออเดอร์ */}
          {req.document_status === ACCOUNTING_DOC_STATUS.PENDING_ORIGINAL && (
            <div style={{ marginTop: 14 }}>
              <FilesList />
              <label className="form-label">{t('ส่งเอกสารตัวจริงแล้ว — ใส่เลข Tracking')}</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="form-control" value={trackingNo} onChange={e => setTrackingNo(e.target.value)} placeholder={t('เลข tracking ขนส่ง')} />
                <button className="btn btn-primary btn-sm" disabled={busy || !trackingNo.trim()} onClick={() => run(() => markDocOriginalSent(req.id, trackingNo.trim()), t('บันทึก tracking + ปิดงานแล้ว'))} style={{ whiteSpace: 'nowrap' }}>{t('ส่งตัวจริงแล้ว')}</button>
              </div>
            </div>
          )}

          {req.document_status === ACCOUNTING_DOC_STATUS.COMPLETED && <FilesList />}

          {![ACCOUNTING_DOC_STATUS.COMPLETED, ACCOUNTING_DOC_STATUS.CANCELLED].includes(req.document_status) && (
            <div style={{ marginTop: 10 }}>
              <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => markDocCancelled(req.id), t('ยกเลิกคำขอแล้ว'))}>{t('ยกเลิกคำขอ')}</button>
            </div>
          )}

          <div className="form-group" style={{ marginTop: 14 }}>
            <label className="form-label">{t('หมายเหตุ')}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <textarea className="form-control" rows={2} value={accountingNote} onChange={e => setAccountingNote(e.target.value)} />
              <button className="btn btn-outline btn-sm" onClick={saveNote} style={{ alignSelf: 'flex-start' }}>{t('บันทึก')}</button>
            </div>
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={onClose}>{t('ปิด')}</button></div>
      </div>
    </div>
  )
}

export default function AccountingDocuments({ reloadKey, currentUserName, perm, onDelete }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailReq, setDetailReq] = useState(null)

  const load = () => {
    setLoading(true)
    fetchAccountingDocRequests({ status, priority, q, dateFrom: fromDate, dateTo: toDate })
      .then(setRows).catch(e => toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => { if (alive) load() }, 250)
    return () => { alive = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, priority, q, fromDate, toDate, reloadKey])

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">{t('เอกสารบัญชี')} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} {t('รายการ')})</span></div>
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{t('ทุกสถานะ')}</option>
          {ACCOUNTING_DOC_STATUS_LIST.filter(s => s !== ACCOUNTING_DOC_STATUS.DRAFT).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="">{t('ทุกความเร่งด่วน')}</option>
          {DOC_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input className="filter-input" placeholder={t('ค้นหา ลูกค้า/เซลล์/เลขเอกสาร...')} value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 220 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title={lang === 'en' ? 'Request date from' : 'วันที่ส่งคำขอ ตั้งแต่'} />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('ถึง')}</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title={lang === 'en' ? 'Request date to' : 'วันที่ส่งคำขอ ถึง'} />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>{t('ล้าง')}</button>}
        </div>
      </div>

      {detailReq && <DetailModal req={detailReq} currentUserName={currentUserName} onClose={() => setDetailReq(null)} onChanged={load} />}

      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>{t('เลขที่ออเดอร์')}</th><th>{t('วันที่ออเดอร์')}</th><th>{t('ลูกค้า')}</th><th>{t('เซลล์')}</th><th>{t('ยอดเงิน')}</th>
                  <th>{t('ประเภทเอกสาร')}</th><th>{t('วิธีส่ง')}</th><th>{t('ความเร่งด่วน')}</th><th>{t('สถานะ')}</th>
                  <th>{t('อีเมลลูกค้า')}</th><th>{t('ส่งตัวจริง')}</th><th>Tracking</th>
                  <th>{t('การจัดการ')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(req => (
                  <tr key={req.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                      {req.revised_at && <span className="badge badge-orange" style={{ marginRight: 4 }} title={`${t('แก้ไขล่าสุด')} ${fmtDate(req.revised_at)}`}>{t('อัพเดท')}</span>}
                      {req.order?.order_no || '-'}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(req.order?.created_at)}</td>
                    <td>{req.customer_name || '-'}</td>
                    <td style={{ fontSize: 12 }}>{req.sales_name || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{fmtCurrency(req.order?.value)}</td>
                    <td style={{ fontSize: 12 }}>{req.document_type}</td>
                    <td style={{ fontSize: 12 }}>{req.delivery_method}</td>
                    <td>{req.priority !== 'ปกติ' ? <span className={`badge ${docPriorityBadgeClass(req.priority)}`}>{req.priority}</span> : '-'}</td>
                    <td><span className={`badge ${docStatusBadgeClass(req.document_status)}`}>{req.document_status}</span></td>
                    <td style={{ fontSize: 12 }}>{req.email_to || '-'}</td>
                    <td style={{ fontSize: 12 }}>{NEEDS_ORIGINAL(req.delivery_method) ? t('ใช่') : t('ไม่')}</td>
                    <td style={{ fontSize: 12 }}>{req.original_tracking_no || '-'}</td>
                    <td className="td-actions">
                      <button className="btn btn-outline btn-xs" onClick={() => setDetailReq(req)}>{t('ดูรายละเอียด')}</button>
                      {perm?.isAdmin && <button className="btn btn-danger btn-xs" onClick={() => onDelete(req.id)}>{t('ลบ')}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? t('กำลังโหลด...') : t('ไม่มีคำขอเอกสารบัญชี')}</div></div>}
        </div>
      </div>
    </div>
  )
}
