import { useEffect, useState } from 'react'
import { PAGE_SIZE, fetchQuotationsPage, fetchQuotationsTotal, fetchQuotationsSummary, fetchPendingPayments } from '../lib/api'
import { fmtCurrency, fmtDate, quotBadgeClass, isOverdue, isDueToday } from '../lib/format'
import { printQuotation } from '../lib/printQuotation'
import { canManageChild } from '../lib/permissions'
import { useUi } from './UiContext'
import { usePicklists } from './PicklistsContext'
import EditableSelect from './EditableSelect'
import SignedQuotationControl from './SignedQuotationControl'
import Pagination from './Pagination'

// สรุปใบเสนอราคาที่ยังไม่ชำระและถึงกำหนดชำระแล้ว/ใกล้ถึงกำหนด เรียงวันครบกำหนดใกล้สุดก่อน — เตือนเซลล์กันลืมตามเก็บเงินหลังปิดดีลส่งของแล้ว
function PaymentFollowUpSummary({ rows, onEdit }) {
  if (!rows.length) return null
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="card-header"><div className="card-title">ต้องตามเก็บเงิน (ลูกค้าเครดิต)</div></div>
      <div className="table-wrap" style={{ border: 'none' }}>
        <table>
          <tbody>
            {rows.map(q => {
              const ov = isOverdue(q.payment_due_date)
              return (
                <tr key={q.id}>
                  <td className={ov ? 'overdue' : isDueToday(q.payment_due_date) ? 'due-today' : ''} style={{ fontWeight: 500, width: 130 }}>{fmtDate(q.payment_due_date)}</td>
                  <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{q.quot_no}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-light)' }}>{q.company ? q.company.name : '-'}</td>
                  <td style={{ fontWeight: 600 }}>{fmtCurrency(q.value)}</td>
                  <td className="td-actions"><button className="btn btn-outline btn-xs" onClick={() => onEdit(q)}>แก้ไข</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Quotations({ perm, reloadKey, settings, deals, onAdd, onEdit, onStatusChange, onPaymentStatusChange, onDelete, onCreateDeal }) {
  const { toast } = useUi()
  const { list } = usePicklists()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({})
  const [pendingPayments, setPendingPayments] = useState([])
  const [localBump, setLocalBump] = useState(0)

  useEffect(() => { setPage(0) }, [status, q, fromDate, toDate])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchQuotationsPage({ page, status, q, dateFrom: fromDate, dateTo: toDate }).then(r => {
        if (!alive) return
        setRows(r.rows); setCount(r.count)
      }).catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
      fetchQuotationsTotal({ status, q, dateFrom: fromDate, dateTo: toDate }).then(sum => { if (alive) setTotal(sum) }).catch(() => {})
      // สรุปยอดแยกตามสถานะ ไม่กรองด้วย status เอง เพราะต้องการเห็นทุกสถานะพร้อมกันเสมอ
      fetchQuotationsSummary({ q, dateFrom: fromDate, dateTo: toDate }).then(s => { if (alive) setSummary(s) }).catch(() => {})
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [page, status, q, fromDate, toDate, reloadKey, localBump])

  // ไม่กรองตามตัวกรองบนหน้าจอ เพื่อให้เห็นทุกใบที่ต้องตามเก็บเงินเสมอไม่ว่าจะกำลังค้นหา/กรองอะไรอยู่
  useEffect(() => {
    let alive = true
    fetchPendingPayments().then(r => { if (alive) setPendingPayments(r) }).catch(() => {})
    return () => { alive = false }
  }, [reloadKey, localBump])

  const doPrint = (quot) => printQuotation(quot, quot.company, settings)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">ใบเสนอราคา <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} รายการ · {fmtCurrency(total)})</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ สร้างใบเสนอราคา</button>
      </div>

      <PaymentFollowUpSummary rows={pendingPayments} onEdit={onEdit} />

      <div className="kpi-grid" style={{ gridTemplateColumns: `repeat(${list('quot_statuses').length}, 1fr)`, marginBottom: 14 }}>
        {list('quot_statuses').map(s => {
          const info = summary[s] || { count: 0, total: 0 }
          return (
            <div className="kpi-card" key={s}>
              <div className="kpi-label">{s}</div>
              <div className="kpi-value">{info.count}</div>
              <div className="kpi-sub">{fmtCurrency(info.total)}</div>
            </div>
          )
        })}
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {list('quot_statuses').map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="filter-input" placeholder="ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
        <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่ใบเสนอราคา ตั้งแต่" />
        <span style={{ fontSize: 12, color: 'var(--text-light)', alignSelf: 'center' }}>ถึง</span>
        <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่ใบเสนอราคา ถึง" />
        {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
      </div>
      <div className="card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>บริษัท</th><th>มูลค่า</th><th>สถานะ</th><th>วันที่</th><th>ครบกำหนดชำระ</th><th>การชำระ</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(qt => {
                  const fromDeal = qt.deal_id ? deals.find(d => d.id === qt.deal_id) : null
                  const ov = qt.payment_status !== 'ชำระแล้ว' && isOverdue(qt.payment_due_date)
                  return (
                    <tr key={qt.id} style={{ background: ov ? '#fff5f5' : undefined }}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{qt.quot_no}</td>
                      <td style={{ fontWeight: 500 }}>{qt.subject}{fromDeal && <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>จากดีล: {fromDeal.name}</div>}</td>
                      <td>{qt.company ? qt.company.name : '-'}{qt.company?.credit_term && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{qt.company.credit_term}</div>}</td>
                      <td style={{ fontWeight: 600 }}>{fmtCurrency(qt.value)}</td>
                      <td><span className={`badge ${quotBadgeClass(qt.status)}`}>{qt.status}</span></td>
                      <td style={{ fontSize: 12 }}>{fmtDate(qt.quot_date)}</td>
                      <td className={ov ? 'overdue' : isDueToday(qt.payment_due_date) ? 'due-today' : ''} style={{ fontSize: 12 }}>{fmtDate(qt.payment_due_date) || '-'}</td>
                      <td onClick={e => e.stopPropagation()}>
                        {canManageChild(qt.company, perm) ? (
                          <EditableSelect listKey="payment_statuses" value={qt.payment_status} onChange={v => onPaymentStatusChange(qt.id, v)} isAdmin={perm.isAdmin} style={{ display: 'inline-flex', width: 130 }} />
                        ) : (qt.payment_status || '-')}
                      </td>
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        {canManageChild(qt.company, perm) && (
                          <EditableSelect listKey="quot_statuses" value={qt.status} onChange={v => onStatusChange(qt.id, v)} isAdmin={perm.isAdmin} style={{ display: 'inline-flex', width: 160 }} />
                        )}
                        {canManageChild(qt.company, perm) && <button className="btn btn-outline btn-xs" onClick={() => onEdit(qt)}>แก้ไข</button>}
                        {canManageChild(qt.company, perm) && !qt.deal_id && <button className="btn btn-secondary btn-xs" onClick={() => onCreateDeal(qt)}>สร้างดีล</button>}
                        <button className="btn btn-secondary btn-xs" onClick={() => doPrint(qt)}>PDF</button>
                        <SignedQuotationControl quotation={qt} manageable={canManageChild(qt.company, perm)} onChanged={() => setLocalBump(b => b + 1)} />
                        {canManageChild(qt.company, perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(qt.id)}>ลบ</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีใบเสนอราคา'}</div></div>}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
      </div>
    </div>
  )
}
