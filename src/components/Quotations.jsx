import { useEffect, useState } from 'react'
import { PAGE_SIZE, fetchQuotationsPage, fetchQuotationsTotal } from '../lib/api'
import { fmtCurrency, fmtDate, quotBadgeClass } from '../lib/format'
import { printQuotation } from '../lib/printQuotation'
import { canManageChild } from '../lib/permissions'
import { useUi } from './UiContext'
import { usePicklists } from './PicklistsContext'
import EditableSelect from './EditableSelect'
import Pagination from './Pagination'

export default function Quotations({ perm, reloadKey, settings, onAdd, onStatusChange, onDelete }) {
  const { toast } = useUi()
  const { list } = usePicklists()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  useEffect(() => { setPage(0) }, [status, q])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchQuotationsPage({ page, status, q }).then(r => {
        if (!alive) return
        setRows(r.rows); setCount(r.count)
      }).catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
      fetchQuotationsTotal({ status, q }).then(sum => { if (alive) setTotal(sum) }).catch(() => {})
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [page, status, q, reloadKey])

  const doPrint = (quot) => printQuotation(quot, quot.company, settings)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📋 ใบเสนอราคา <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} รายการ · {fmtCurrency(total)})</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ สร้างใบเสนอราคา</button>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {list('quot_statuses').map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="filter-input" placeholder="🔍 ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>บริษัท</th><th>มูลค่า</th><th>สถานะ</th><th>วันที่</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(qt => (
                  <tr key={qt.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{qt.quot_no}</td>
                    <td style={{ fontWeight: 500 }}>{qt.subject}</td>
                    <td>{qt.company ? qt.company.name : '-'}</td>
                    <td style={{ fontWeight: 600 }}>{fmtCurrency(qt.value)}</td>
                    <td><span className={`badge ${quotBadgeClass(qt.status)}`}>{qt.status}</span></td>
                    <td style={{ fontSize: 12 }}>{fmtDate(qt.quot_date)}</td>
                    <td className="td-actions" onClick={e => e.stopPropagation()}>
                      {canManageChild(qt.company, perm) && (
                        <EditableSelect listKey="quot_statuses" value={qt.status} onChange={v => onStatusChange(qt.id, v)} style={{ display: 'inline-flex', width: 160 }} />
                      )}
                      <button className="btn btn-secondary btn-xs" onClick={() => doPrint(qt)}>📄 PDF</button>
                      {canManageChild(qt.company, perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(qt.id)}>🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div className="empty-icon">📋</div><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีใบเสนอราคา'}</div></div>}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
      </div>
    </div>
  )
}
