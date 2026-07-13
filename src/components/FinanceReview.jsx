import { useEffect, useState } from 'react'
import { fetchPaymentRequests, listPaymentItems, getPaymentSlipUrl, PAYMENT_STATUS_LIST } from '../lib/api'
import { exportPaymentRequestsToExcel } from '../lib/importExport'
import { fmtCurrency, fmtDate, paymentStatusLabel, paymentBadgeClass } from '../lib/format'
import { useUi } from './UiContext'

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

// ป็อปอัปให้บัญชีดูรายละเอียด + สลิป + รายการสินค้า แล้วเลือกผลตรวจ (อนุมัติ/ขอข้อมูลเพิ่ม/ยอดไม่ตรง/ปฏิเสธ)
// ตอนอนุมัติ: บังคับระบุชื่อผู้อนุมัติ (ลายเซ็น) + ใส่ Ref No. ได้ (ไม่บังคับ)
function ReviewModal({ pr, currentUserName, onClose, onApprove, onNeedInfo, onMismatch, onReject }) {
  const { toast } = useUi()
  const [items, setItems] = useState(null)
  const [remark, setRemark] = useState('')
  const [approverName, setApproverName] = useState(currentUserName || '')
  const [financeRefNo, setFinanceRefNo] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { listPaymentItems(pr.id).then(setItems).catch(() => setItems([])) }, [pr.id])

  const viewSlip = async () => {
    if (!pr.slip_file_url) { toast('ไม่มีสลิปแนบ', 'info'); return }
    try { window.open(await getPaymentSlipUrl(pr.slip_file_url), '_blank') }
    catch (e) { toast('เปิดสลิปไม่สำเร็จ: ' + e.message, 'error') }
  }

  // needRemark = ต้องกรอกหมายเหตุ (ทุกปุ่มยกเว้นอนุมัติ)
  const act = async (fn, needRemark) => {
    if (needRemark && !remark.trim()) { toast('กรุณากรอกหมายเหตุ', 'error'); return }
    setBusy(true)
    try { await fn(pr, remark.trim()); onClose() }
    catch (e) { toast('ทำรายการไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const approve = async () => {
    if (!approverName.trim()) { toast('กรุณาระบุชื่อผู้อนุมัติ', 'error'); return }
    setBusy(true)
    try { await onApprove(pr, { remark: remark.trim(), approverName: approverName.trim(), financeRefNo: financeRefNo.trim() }); onClose() }
    catch (e) { toast('อนุมัติไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-light)' }}>{label}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
  const total = Number(pr.total_amount) || 0
  const exVat = round2(total / 1.07)
  const vat = round2(total - exVat)

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div className="modal-title">ตรวจสอบยอดโอน · {pr.pr_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Row label="วันที่คำขอ" value={fmtDate(pr.request_date || pr.created_at)} />
          <Row label="ลูกค้า" value={pr.customer_name || pr.company?.name || '-'} />
          <Row label="ประเภทลูกค้า" value={pr.credit_type || '-'} />
          <Row label="ประเภทการชำระ" value={pr.payment_type || '-'} />
          <Row label="เลขที่ PO" value={pr.po_reference || '-'} />
          <Row label="เลขที่ออเดอร์" value={pr.order?.order_no || pr.order_no || '-'} />
          <Row label="ยอดไม่รวม VAT" value={fmtCurrency(exVat)} />
          <Row label="VAT 7%" value={fmtCurrency(vat)} />
          <Row label="ยอดรวมทั้งสิ้น" value={<b>{fmtCurrency(total)}</b>} />
          <Row label="ผู้ขอ" value={pr.requested_by_name || '-'} />

          <div style={{ margin: '12px 0' }}>
            <button className="btn btn-outline btn-sm" onClick={viewSlip} disabled={!pr.slip_file_url}>{pr.slip_file_url ? 'ดูสลิปการโอน' : 'ไม่มีสลิปแนบ'}</button>
            <span style={{ fontSize: 12, color: 'var(--text-light)', marginLeft: 10 }}>เทียบยอดโอน/ธนาคาร/วันเวลาจากสลิปจริง</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>สินค้า/รายการ</th><th style={{ textAlign: 'center' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ราคา/หน่วย</th><th style={{ textAlign: 'right' }}>รวม</th></tr></thead>
              <tbody>
                {items === null ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16, color: 'var(--text-light)' }}>กำลังโหลด...</td></tr>
                  : items.length ? items.map(it => (
                    <tr key={it.id}>
                      <td>{it.product_name || it.sku || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{fmtCurrency(it.unit_price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(it.line_total)}</td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16, color: 'var(--text-light)' }}>ไม่มีรายการสินค้า</td></tr>}
              </tbody>
            </table>
          </div>

          {pr.remark && <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 10 }}>หมายเหตุจากเซลล์: {pr.remark}</div>}

          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label required">ชื่อผู้อนุมัติ (ลายเซ็น)</label>
              <input className="form-control" value={approverName} onChange={e => setApproverName(e.target.value)} placeholder="ชื่อผู้ตรวจ/อนุมัติ" />
            </div>
            <div className="form-group">
              <label className="form-label">Ref No.</label>
              <input className="form-control" value={financeRefNo} onChange={e => setFinanceRefNo(e.target.value)} placeholder="ไม่บังคับ" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">หมายเหตุจากบัญชี (บังคับกรอก ยกเว้นตอนอนุมัติ)</label>
            <textarea className="form-control" rows={2} value={remark} onChange={e => setRemark(e.target.value)} placeholder="เช่น สลิปไม่ชัด / ยอดขาด 500 / ไม่พบยอดเข้า" />
          </div>
        </div>
        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>ปิด</button>
          <button className="btn btn-danger" onClick={() => act(onReject, true)} disabled={busy}>ปฏิเสธ</button>
          <button className="btn btn-outline" onClick={() => act(onMismatch, true)} disabled={busy} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>ยอดไม่ตรง</button>
          <button className="btn btn-secondary" onClick={() => act(onNeedInfo, true)} disabled={busy}>ขอข้อมูลเพิ่ม</button>
          <button className="btn btn-success" onClick={approve} disabled={busy}>อนุมัติ</button>
        </div>
      </div>
    </div>
  )
}

export default function FinanceReview({ reloadKey, currentUserName, onApprove, onNeedInfo, onMismatch, onReject }) {
  const { toast } = useUi()
  const [status, setStatus] = useState('') // ค่าเริ่มต้นแสดงทุกสถานะ
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [review, setReview] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchPaymentRequests({ status, dateFrom: fromDate, dateTo: toDate })
      .then(r => { if (alive) setRows(r) })
      .catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [status, fromDate, toDate, reloadKey, toast])

  const exportExcel = () => {
    if (!rows.length) { toast('ไม่มีข้อมูลให้ส่งออก', 'info'); return }
    exportPaymentRequestsToExcel(rows, 'ตรวจสอบยอดโอน.xlsx').catch(e => toast('ส่งออกไม่สำเร็จ: ' + e.message, 'error'))
  }

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">ตรวจสอบยอดโอน <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} รายการ)</span></div>
        <button className="btn btn-outline" onClick={exportExcel}>ส่งออกข้อมูล</button>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {PAYMENT_STATUS_LIST.map(s => <option key={s} value={s}>{paymentStatusLabel(s)}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่คำขอ ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่คำขอ ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
        </div>
      </div>
      {review && <ReviewModal pr={review} currentUserName={currentUserName} onClose={() => setReview(null)} onApprove={onApprove} onNeedInfo={onNeedInfo} onMismatch={onMismatch} onReject={onReject} />}
      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>เลขคำขอ</th><th>วันที่</th><th>ลูกค้า</th><th>ประเภทลูกค้า</th><th>ยอดรวม</th><th>สถานะ</th><th>ผู้ขอ</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(pr => (
                  <tr key={pr.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                      {pr.pr_no}
                      {(pr.order?.order_no || pr.order_no) && <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>ออเดอร์: {pr.order?.order_no || pr.order_no}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(pr.request_date || pr.created_at)}</td>
                    <td>{pr.customer_name || pr.company?.name || '-'}</td>
                    <td style={{ fontSize: 12 }}>{pr.credit_type ? <span className={`badge ${pr.credit_type.startsWith('ลูกค้าเครดิต') ? 'badge-orange' : 'badge-green'}`}>{pr.credit_type}</span> : '-'}</td>
                    <td style={{ fontWeight: 600 }}>{fmtCurrency(pr.total_amount)}</td>
                    <td><span className={`badge ${paymentBadgeClass(pr.status)}`}>{paymentStatusLabel(pr.status)}</span></td>
                    <td style={{ fontSize: 12 }}>{pr.requested_by_name || '-'}</td>
                    <td className="td-actions"><button className="btn btn-secondary btn-xs" onClick={() => setReview(pr)}>ตรวจสอบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ไม่มีรายการในสถานะนี้'}</div></div>}
        </div>
      </div>
    </div>
  )
}
