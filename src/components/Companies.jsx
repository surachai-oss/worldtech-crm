import { useEffect, useState } from 'react'
import { CONSTANTS, PAGE_SIZE, fetchCompaniesPage } from '../lib/api'
import { statusBadgeClass } from '../lib/format'
import { canEdit, canDelete } from '../lib/permissions'
import { useUi } from './UiContext'
import Pagination from './Pagination'

export default function Companies({ perm, reloadKey, onOpen, onEdit, onDelete }) {
  const { toast } = useUi()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [industry, setIndustry] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(0) }, [q, status, industry])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetchCompaniesPage({ page, q, status, industry })
        if (!alive) return
        setRows(r.rows); setCount(r.count)
      } catch (e) {
        if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error')
      } finally {
        if (alive) setLoading(false)
      }
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [page, q, status, industry, reloadKey])

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🏢 บริษัทลูกค้า <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} รายการ)</span></div>
        <button className="btn btn-primary" onClick={() => onEdit(null)}>+ เพิ่มบริษัท</button>
      </div>
      <div className="filter-bar">
        <input className="filter-input" placeholder="🔍 ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {CONSTANTS.COMPANY_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={industry} onChange={e => setIndustry(e.target.value)}>
          <option value="">ทุกอุตสาหกรรม</option>
          {CONSTANTS.INDUSTRIES.map(i => <option key={i}>{i}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>ชื่อบริษัท</th><th>อุตสาหกรรม</th><th>โทรศัพท์</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id} onClick={() => onOpen(c.id)}>
                    <td><div style={{ fontWeight: 600, color: 'var(--navy)' }}>{c.name}</div><div style={{ fontSize: 11, color: 'var(--text-light)' }}>{c.email}</div></td>
                    <td style={{ fontSize: 12 }}>{c.industry || '-'}</td>
                    <td style={{ fontSize: 12 }}>{c.phone || '-'}</td>
                    <td><span className={`badge ${statusBadgeClass(c.status)}`}>{c.status}</span></td>
                    <td style={{ fontSize: 12 }}>{c.owner || '-'}</td>
                    <td className="td-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-outline btn-xs" onClick={() => onOpen(c.id)}>👁 ดู</button>
                      {canEdit(c, perm) && <button className="btn btn-outline btn-xs" onClick={() => onEdit(c)}>✏️</button>}
                      {canDelete(c, perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(c.id)}>🗑</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div className="empty-icon">🏢</div><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีข้อมูลบริษัท'}</div></div>}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
      </div>
    </div>
  )
}
