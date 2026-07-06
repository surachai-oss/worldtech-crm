import { useEffect, useState } from 'react'
import { PAGE_SIZE, fetchTasksPage, fetchTaskCounts } from '../lib/api'
import { fmtDate, isOverdue, isDueToday, statusBadgeClass } from '../lib/format'
import { canEdit, canDelete } from '../lib/permissions'
import { useUi } from './UiContext'
import { usePicklists } from './PicklistsContext'
import Pagination from './Pagination'

export default function Tasks({ perm, reloadKey, onNavCompany, onAdd, onEdit, onComplete, onDelete }) {
  const { toast } = useUi()
  const { list } = usePicklists()
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ pending: 0, overdue: 0, done: 0 })

  useEffect(() => { setPage(0) }, [status, priority, q])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchTasksPage({ page, status, priority, q }).then(r => {
        if (!alive) return
        setRows(r.rows); setCount(r.count)
      }).catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [page, status, priority, q, reloadKey])

  useEffect(() => {
    let alive = true
    fetchTaskCounts().then(s => { if (alive) setSummary(s) }).catch(() => {})
    return () => { alive = false }
  }, [reloadKey])

  return (
    <div>
      <div className="section-header">
        <div className="section-title">งาน Follow-up <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} รายการ)</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ เพิ่มงาน</button>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 }}>
        <div className="kpi-card"><div className="kpi-label">รอดำเนินการ</div><div className="kpi-value" style={{ color: 'var(--warning)' }}>{summary.pending}</div></div>
        <div className="kpi-card red"><div className="kpi-label">เกินกำหนด</div><div className="kpi-value" style={{ color: 'var(--danger)' }}>{summary.overdue}</div></div>
        <div className="kpi-card green"><div className="kpi-label">เสร็จสิ้น</div><div className="kpi-value" style={{ color: 'var(--success)' }}>{summary.done}</div></div>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {list('task_statuses').map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="">ทุกลำดับ</option>
          {list('task_priorities').map(p => <option key={p}>{p}</option>)}
        </select>
        <input className="filter-input" placeholder="ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>งาน</th><th>บริษัท</th><th>วันครบกำหนด</th><th>ลำดับ</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(t => {
                  const ov = t.status !== 'เสร็จสิ้น' && isOverdue(t.due_date)
                  const td = isDueToday(t.due_date)
                  return (
                    <tr key={t.id} style={{ background: ov ? '#fff5f5' : td ? '#fffbeb' : undefined }}>
                      <td><div style={{ fontWeight: 500 }}>{t.subject}</div>{t.note && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{t.note}</div>}</td>
                      <td>{t.company ? <a onClick={() => onNavCompany(t.company.id)} style={{ fontSize: 12 }}>{t.company.name}</a> : '-'}</td>
                      <td className={ov ? 'overdue' : td ? 'due-today' : ''} style={{ fontSize: 12 }}>{fmtDate(t.due_date)}</td>
                      <td>{t.priority || '-'}</td>
                      <td><span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span></td>
                      <td style={{ fontSize: 12 }}>{t.owner || '-'}</td>
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        {t.status !== 'เสร็จสิ้น' && canEdit(t, perm) && <button className="btn btn-success btn-xs" onClick={() => onComplete(t.id)}>เสร็จ</button>}
                        {canEdit(t, perm) && <button className="btn btn-outline btn-xs" onClick={() => onEdit(t)}>แก้ไข</button>}
                        {canDelete(t, perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(t.id)}>ลบ</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ไม่มีงาน'}</div></div>}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
      </div>
    </div>
  )
}
