import { useEffect, useState } from 'react'
import { fetchPaymentRequests, getPaymentSlipUrl, PAYMENT_STATUS, PAYMENT_STATUS_LIST } from '../lib/api'
import { fmtCurrency, fmtDate, paymentStatusLabel, paymentBadgeClass } from '../lib/format'
import { useUi } from './UiContext'

// สถานะที่ Sale ยังกลับมาแก้ไข/ส่งใหม่ได้ (นอกเหนือจากนี้ล็อกหลังส่งให้บัญชี)
const EDITABLE = [PAYMENT_STATUS.DRAFT, PAYMENT_STATUS.NEED_INFO, PAYMENT_STATUS.MISMATCH]

export default function PaymentRequests({ reloadKey, onAdd, onEdit, onSubmit, onDelete, onMarkOrder }) {
  const { toast } = useUi()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchPaymentRequests({ status, q, dateFrom: fromDate, dateTo: toDate })
        .then(r => { if (alive) setRows(r) })
        .catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [status, q, fromDate, toDate, reloadKey, toast])

  const viewSlip = async (pr) => {
    if (!pr.slip_file_url) { toast('คำขอนี้ยังไม่มีสลิปแนบ', 'info'); return }
    try { window.open(await getPaymentSlipUrl(pr.slip_file_url), '_blank') }
    catch (e) { toast('เปิดสลิปไม่สำเร็จ: ' + e.message, 'error') }
  }

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">คำขอตรวจยอด <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} รายการ)</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ สร้างคำขอตรวจยอด</button>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {PAYMENT_STATUS_LIST.map(s => <option key={s} value={s}>{paymentStatusLabel(s)}</option>)}
        </select>
        <input className="filter-input" placeholder="ค้นหา ลูกค้า/เลขคำขอ/PO/เลขออเดอร์..." value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่สร้าง ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่สร้าง ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
        </div>
      </div>
      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>เลขคำขอ</th><th>ลูกค้า</th><th>ยอดที่ต้องชำระ</th><th>ยอดโอน</th><th>ผลต่าง</th><th>สถานะ</th><th>ผู้ขอ</th><th>วันที่โอน</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(pr => {
                  const editable = EDITABLE.includes(pr.status)
                  return (
                    <tr key={pr.id}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{pr.pr_no}{pr.approval_ref_no && <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>{pr.approval_ref_no}</div>}{pr.order_no && <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>ออเดอร์: {pr.order_no}</div>}</td>
                      <td>{pr.customer_name || pr.company?.name || '-'}</td>
                      <td style={{ fontWeight: 600 }}>{fmtCurrency(pr.expected_amount)}</td>
                      <td style={{ fontWeight: 600 }}>{fmtCurrency(pr.paid_amount)}</td>
                      <td style={{ color: (Number(pr.difference_amount) || 0) === 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{fmtCurrency(pr.difference_amount)}</td>
                      <td>
                        <span className={`badge ${paymentBadgeClass(pr.status)}`}>{paymentStatusLabel(pr.status)}</span>
                        {pr.finance_remark && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 2 }}>บัญชี: {pr.finance_remark}</div>}
                      </td>
                      <td style={{ fontSize: 12 }}>{pr.requested_by_name || '-'}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(pr.transfer_date)}</td>
                      <td className="td-actions">
                        {pr.slip_file_url && <button className="btn btn-outline btn-xs" onClick={() => viewSlip(pr)}>สลิป</button>}
                        {editable && <button className="btn btn-outline btn-xs" onClick={() => onEdit(pr)}>แก้ไข</button>}
                        {editable && <button className="btn btn-secondary btn-xs" onClick={() => onSubmit(pr)}>ส่งให้บัญชี</button>}
                        {pr.status === PAYMENT_STATUS.APPROVED && <button className="btn btn-success btn-xs" onClick={() => onMarkOrder(pr)}>เปิดออเดอร์</button>}
                        {pr.status === PAYMENT_STATUS.DRAFT && <button className="btn btn-danger btn-xs" onClick={() => onDelete(pr)}>ลบ</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีคำขอตรวจยอด'}</div></div>}
        </div>
      </div>
    </div>
  )
}
