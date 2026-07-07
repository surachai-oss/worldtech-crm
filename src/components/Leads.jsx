import { useEffect, useState } from 'react'
import { PAGE_SIZE, fetchLeadsPage } from '../lib/api'
import { fmtDate } from '../lib/format'
import { useUi } from './UiContext'
import { usePicklists } from './PicklistsContext'
import EditableSelect from './EditableSelect'
import Pagination from './Pagination'

export default function Leads({ perm, reloadKey, onNavCompany, onCreateCompany, onStatusChange, onDelete }) {
  const { toast } = useUi()
  const { list } = usePicklists()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(0) }, [status, q])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchLeadsPage({ page, status, q }).then(r => {
        if (!alive) return
        setRows(r.rows); setCount(r.count)
      }).catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [page, status, q, reloadKey])

  return (
    <div>
      <div className="section-header">
        <div className="section-title">ลีดที่เข้ามา <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} รายการ)</span></div>
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {list('lead_statuses').map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="filter-input" placeholder="ค้นหาชื่อ/เบอร์/อีเมล..." value={q} onChange={e => setQ(e.target.value)} />
      </div>

      <div className="card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>ชื่อ</th><th>ติดต่อ</th><th>สนใจสินค้า</th><th>ที่มา</th><th>สถานะ</th><th>วันที่</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 500 }}>{l.full_name}</td>
                    <td style={{ fontSize: 12 }}>{l.phone}{l.email ? <div style={{ color: 'var(--text-light)' }}>{l.email}</div> : null}</td>
                    <td style={{ fontSize: 12 }}>{l.interested_product || '-'}</td>
                    <td style={{ fontSize: 12 }}>{l.source || '-'}</td>
                    <td><EditableSelect listKey="lead_statuses" value={l.status} onChange={v => onStatusChange(l.id, v)} isAdmin={perm.isAdmin} style={{ display: 'inline-flex', width: 150 }} /></td>
                    <td style={{ fontSize: 12 }}>{fmtDate(l.created_at)}</td>
                    <td className="td-actions">
                      {l.converted_company_id
                        ? <button className="btn btn-outline btn-xs" onClick={() => onNavCompany(l.converted_company_id)}>ลูกค้า: {l.company?.name || '-'}</button>
                        : <button className="btn btn-secondary btn-xs" onClick={() => onCreateCompany(l)}>สร้างเป็นลูกค้า</button>}
                      {perm.isAdmin && <button className="btn btn-danger btn-xs" onClick={() => onDelete(l.id)}>ลบ</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีลีดเข้ามา'}</div></div>}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
      </div>
    </div>
  )
}
