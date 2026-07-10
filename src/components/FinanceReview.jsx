import { useEffect, useState } from 'react'
import { fetchPaymentRequests, listPaymentItems, getPaymentSlipUrl, PAYMENT_STATUS, PAYMENT_STATUS_LIST } from '../lib/api'
import { fmtCurrency, fmtDate, paymentStatusLabel, paymentBadgeClass } from '../lib/format'
import { useUi } from './UiContext'

// ป็อปอัปให้บัญชีดูรายละเอียด + สลิป + รายการสินค้า แล้วเลือกผลตรวจ (อนุมัติ/ขอข้อมูลเพิ่ม/ยอดไม่ตรง/ปฏิเสธ)
function ReviewModal({ pr, onClose, onApprove, onNeedInfo, onMismatch, onReject }) {
  const { toast } = useUi()
  const [items, setItems] = useState(null)
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { listPaymentItems(pr.id).then(setItems).catch(() => setItems([])) }, [pr.id])

  const viewSlip = async () => {
    if (!pr.slip_file_url) { toast('ไม่มีสลิปแนบ', 'info'); return }
    try { window.open(await getPaymentSlipUrl(pr.slip_file_url), '_blank') }
    catch (e) { toast('เปิดสลิปไม่สำเร็จ: ' + e.message, 'error') }
  }

  const act = async (fn, needRemark) => {
    if (needRemark && !remark.trim()) { toast('กรุณากรอกหมายเหตุ', 'error'); return }
    setBusy(true)
    try { await fn(pr, remark.trim()); onClose() }
    catch (e) { toast('ทำรายการไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-light)' }}>{label}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
  const diff = Number(pr.difference_amount) || 0

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div className="modal-title">ตรวจสอบยอดโอน · {pr.pr_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Row label="ลูกค้า" value={pr.customer_name || pr.company?.name || '-'} />
          <Row label="ประเภทการชำระ" value={pr.payment_type || '-'} />
          <Row label="เลขที่ PO" value={pr.po_reference || '-'} />
          <Row label="ยอดที่ต้องชำระ" value={fmtCurrency(pr.expected_amount)} />
          <Row label="ยอดที่ลูกค้าโอนจริง" value={fmtCurrency(pr.paid_amount)} />
          <Row label="ผลต่าง" value={<span style={{ color: diff === 0 ? 'var(--success)' : 'var(--danger)' }}>{fmtCurrency(diff)}{diff !== 0 && pr.difference_reason ? ` (${pr.difference_reason})` : ''}</span>} />
          <Row label="ธนาคารที่รับโอน" value={pr.bank_account || '-'} />
          <Row label="วันเวลาที่โอน" value={`${fmtDate(pr.transfer_date)} ${pr.transfer_time || ''}`} />
          <Row label="ผู้ขอ" value={pr.requested_by_name || '-'} />

          <div style={{ margin: '12px 0' }}>
            <button className="btn btn-outline btn-sm" onClick={viewSlip} disabled={!pr.slip_file_url}>{pr.slip_file_url ? 'ดูสลิปการโอน' : 'ไม่มีสลิปแนบ'}</button>
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

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">หมายเหตุจากบัญชี (บังคับกรอก ยกเว้นตอนอนุมัติ)</label>
            <textarea className="form-control" rows={2} value={remark} onChange={e => setRemark(e.target.value)} placeholder="เช่น สลิปไม่ชัด / ยอดขาด 500 / ไม่พบยอดเข้า" />
          </div>
        </div>
        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>ปิด</button>
          <button className="btn btn-danger" onClick={() => act(onReject, true)} disabled={busy}>ปฏิเสธ</button>
          <button className="btn btn-outline" onClick={() => act(onMismatch, true)} disabled={busy} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>ยอดไม่ตรง</button>
          <button className="btn btn-secondary" onClick={() => act(onNeedInfo, true)} disabled={busy}>ขอข้อมูลเพิ่ม</button>
          <button className="btn btn-success" onClick={() => act(onApprove, false)} disabled={busy}>อนุมัติ</button>
        </div>
      </div>
    </div>
  )
}

export default function FinanceReview({ reloadKey, onApprove, onNeedInfo, onMismatch, onReject }) {
  const { toast } = useUi()
  const [status, setStatus] = useState(PAYMENT_STATUS.PENDING)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [review, setReview] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchPaymentRequests({ status })
      .then(r => { if (alive) setRows(r) })
      .catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [status, reloadKey, toast])

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">ตรวจสอบยอดโอน <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} รายการ)</span></div>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {PAYMENT_STATUS_LIST.map(s => <option key={s} value={s}>{paymentStatusLabel(s)}</option>)}
        </select>
      </div>
      {review && <ReviewModal pr={review} onClose={() => setReview(null)} onApprove={onApprove} onNeedInfo={onNeedInfo} onMismatch={onMismatch} onReject={onReject} />}
      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>เลขคำขอ</th><th>ลูกค้า</th><th>ยอดที่ต้องชำระ</th><th>ยอดโอน</th><th>ผลต่าง</th><th>สถานะ</th><th>ผู้ขอ</th><th>วันที่โอน</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(pr => {
                  const diff = Number(pr.difference_amount) || 0
                  return (
                    <tr key={pr.id}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{pr.pr_no}</td>
                      <td>{pr.customer_name || pr.company?.name || '-'}</td>
                      <td style={{ fontWeight: 600 }}>{fmtCurrency(pr.expected_amount)}</td>
                      <td style={{ fontWeight: 600 }}>{fmtCurrency(pr.paid_amount)}</td>
                      <td style={{ color: diff === 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{fmtCurrency(diff)}</td>
                      <td><span className={`badge ${paymentBadgeClass(pr.status)}`}>{paymentStatusLabel(pr.status)}</span></td>
                      <td style={{ fontSize: 12 }}>{pr.requested_by_name || '-'}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(pr.transfer_date)}</td>
                      <td className="td-actions"><button className="btn btn-secondary btn-xs" onClick={() => setReview(pr)}>ตรวจสอบ</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ไม่มีรายการในสถานะนี้'}</div></div>}
        </div>
      </div>
    </div>
  )
}
