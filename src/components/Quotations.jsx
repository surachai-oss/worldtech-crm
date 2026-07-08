import { useEffect, useState } from 'react'
import { PAGE_SIZE, fetchQuotationsPage, fetchQuotationsTotal, fetchQuotationsSummary } from '../lib/api'
import { fmtCurrency, fmtDate, quotBadgeClass } from '../lib/format'
import { printQuotation } from '../lib/printQuotation'
import { canManageChild } from '../lib/permissions'
import { useUi } from './UiContext'
import { usePicklists } from './PicklistsContext'
import EditableSelect from './EditableSelect'
import SignedQuotationControl from './SignedQuotationControl'
import Pagination from './Pagination'

export default function Quotations({ perm, reloadKey, settings, deals, onAdd, onEdit, onStatusChange, onDelete, onCreateDeal }) {
  const { toast } = useUi()
  const { list } = usePicklists()
  const [status, setStatus] = useState('')
  const [creditType, setCreditType] = useState('') // '' ทั้งหมด | 'normal' ธรรมดา | 'credit' เครดิต
  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState({})
  const [localBump, setLocalBump] = useState(0)

  useEffect(() => { setPage(0) }, [status, creditType, q, fromDate, toDate])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchQuotationsPage({ page, status, q, dateFrom: fromDate, dateTo: toDate, creditType }).then(r => {
        if (!alive) return
        setRows(r.rows); setCount(r.count)
      }).catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
      fetchQuotationsTotal({ status, q, dateFrom: fromDate, dateTo: toDate, creditType }).then(sum => { if (alive) setTotal(sum) }).catch(() => {})
      // สรุปยอดแยกตามสถานะ ไม่กรองด้วย status เอง เพราะต้องการเห็นทุกสถานะพร้อมกันเสมอ
      fetchQuotationsSummary({ q, dateFrom: fromDate, dateTo: toDate }).then(s => { if (alive) setSummary(s) }).catch(() => {})
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [page, status, creditType, q, fromDate, toDate, reloadKey, localBump])

  const doPrint = (quot) => printQuotation(quot, quot.company, settings)

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">ใบเสนอราคา <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} รายการ · {fmtCurrency(total)})</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ สร้างใบเสนอราคา</button>
      </div>

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
        <select className="filter-select" value={creditType} onChange={e => setCreditType(e.target.value)}>
          <option value="">ทุกประเภทลูกค้า</option>
          <option value="normal">ลูกค้าธรรมดา</option>
          <option value="credit">ลูกค้าเครดิต</option>
        </select>
        <input className="filter-input" placeholder="ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่ใบเสนอราคา ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่ใบเสนอราคา ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
        </div>
      </div>
      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>บริษัท</th><th>มูลค่า</th><th>สถานะ</th><th>วันที่</th><th>ประเภท</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(qt => {
                  const fromDeal = qt.deal_id ? deals.find(d => d.id === qt.deal_id) : null
                  return (
                    <tr key={qt.id}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{qt.quot_no}</td>
                      <td style={{ fontWeight: 500 }}>{qt.subject}{fromDeal && <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>จากดีล: {fromDeal.name}</div>}</td>
                      <td>{qt.company ? qt.company.name : '-'}</td>
                      <td style={{ fontWeight: 600 }}>{fmtCurrency(qt.value)}</td>
                      <td><span className={`badge ${quotBadgeClass(qt.status)}`}>{qt.status}</span></td>
                      <td style={{ fontSize: 12 }}>{fmtDate(qt.quot_date)}</td>
                      <td>{qt.credit_term
                        ? <span className="badge badge-orange">{qt.credit_term}</span>
                        : <span className="badge badge-gray">ธรรมดา</span>}</td>
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
