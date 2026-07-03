import { useMemo, useState } from 'react'
import { CONSTANTS } from '../lib/api'
import { fmtDate, isOverdue, isDueToday, priorityIcon, statusBadgeClass } from '../lib/format'

export default function Tasks({ tasks, companies, onNavCompany, onAdd, onEdit, onComplete, onDelete }) {
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const pending = tasks.filter(t => t.status === 'รอดำเนินการ').length
  const overdue = tasks.filter(t => t.status !== 'เสร็จสิ้น' && t.due_date && new Date(t.due_date) < today).length
  const done = tasks.filter(t => t.status === 'เสร็จสิ้น').length

  const list = useMemo(() => {
    let l = tasks
    if (status) l = l.filter(t => t.status === status)
    if (priority) l = l.filter(t => t.priority === priority)
    if (q) l = l.filter(t => (t.subject || '').toLowerCase().includes(q.toLowerCase()))
    return [...l].sort((a, b) => {
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return new Date(a.due_date) - new Date(b.due_date)
    })
  }, [tasks, status, priority, q])

  return (
    <div>
      <div className="section-header">
        <div className="section-title">✅ งาน Follow-up</div>
        <button className="btn btn-primary" onClick={onAdd}>+ เพิ่มงาน</button>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 }}>
        <div className="kpi-card"><div className="kpi-label">รอดำเนินการ</div><div className="kpi-value" style={{ color: 'var(--warning)' }}>{pending}</div></div>
        <div className="kpi-card red"><div className="kpi-label">เกินกำหนด</div><div className="kpi-value" style={{ color: 'var(--danger)' }}>{overdue}</div></div>
        <div className="kpi-card green"><div className="kpi-label">เสร็จสิ้น</div><div className="kpi-value" style={{ color: 'var(--success)' }}>{done}</div></div>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {CONSTANTS.TASK_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="">ทุกลำดับ</option>
          {CONSTANTS.TASK_PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
        <input className="filter-input" placeholder="🔍 ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="card">
        <div className="table-wrap">
          {list.length ? (
            <table>
              <thead><tr><th>งาน</th><th>บริษัท</th><th>วันครบกำหนด</th><th>ลำดับ</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {list.map(t => {
                  const co = companies.find(c => c.id === t.company_id)
                  const ov = t.status !== 'เสร็จสิ้น' && isOverdue(t.due_date)
                  const td = isDueToday(t.due_date)
                  return (
                    <tr key={t.id} style={{ background: ov ? '#fff5f5' : td ? '#fffbeb' : undefined }}>
                      <td><div style={{ fontWeight: 500 }}>{t.subject}</div>{t.note && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{t.note}</div>}</td>
                      <td>{co ? <a onClick={() => onNavCompany(co.id)} style={{ fontSize: 12 }}>{co.name}</a> : '-'}</td>
                      <td className={ov ? 'overdue' : td ? 'due-today' : ''} style={{ fontSize: 12 }}>{ov ? '🚨 ' : td ? '⏰ ' : ''}{fmtDate(t.due_date)}</td>
                      <td>{priorityIcon(t.priority)} {t.priority || '-'}</td>
                      <td><span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span></td>
                      <td style={{ fontSize: 12 }}>{t.owner || '-'}</td>
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        {t.status !== 'เสร็จสิ้น' && <button className="btn btn-success btn-xs" onClick={() => onComplete(t.id)}>✓ เสร็จ</button>}
                        <button className="btn btn-outline btn-xs" onClick={() => onEdit(t)}>✏️</button>
                        <button className="btn btn-danger btn-xs" onClick={() => onDelete(t.id)}>🗑</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div className="empty-icon">✅</div><div>ไม่มีงาน</div></div>}
        </div>
      </div>
    </div>
  )
}
