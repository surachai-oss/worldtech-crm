import { useEffect, useState } from 'react'
import { PAGE_SIZE, fetchActivitiesPage } from '../lib/api'
import { fmtDate, activityIcon, activityColor } from '../lib/format'
import { canManageChild } from '../lib/permissions'
import { useUi } from './UiContext'
import { usePicklists } from './PicklistsContext'
import Pagination from './Pagination'

export default function Activities({ perm, reloadKey, onNavCompany, onAdd, onDelete }) {
  const { toast } = useUi()
  const { list } = usePicklists()
  const [type, setType] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { setPage(0) }, [type])

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchActivitiesPage({ page, type }).then(r => {
      if (!alive) return
      setRows(r.rows); setCount(r.count)
    }).catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [page, type, reloadKey])

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📝 ประวัติการติดต่อ <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} รายการ)</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ บันทึกการติดต่อ</button>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={type} onChange={e => setType(e.target.value)}>
          <option value="">ทุกประเภท</option>
          {list('activity_types').map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="card-body">
          <div className="activity-feed">
            {rows.length ? rows.map(a => (
              <div className="activity-item" key={a.id}>
                <div className="activity-icon" style={{ background: activityColor(a.type) }}>{activityIcon(a.type)}</div>
                <div className="activity-content">
                  <div className="activity-title">{a.subject}</div>
                  <div className="activity-meta">
                    {a.company && <a onClick={() => onNavCompany(a.company.id)} style={{ fontWeight: 500 }}>{a.company.name}</a>}
                    <span>{a.type}</span><span>{fmtDate(a.activity_date)}</span><span>โดย {a.recorded_by}</span>
                  </div>
                  {a.detail && <div className="activity-detail">{a.detail}</div>}
                </div>
                {canManageChild(a.company, perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(a.id)}>🗑</button>}
              </div>
            )) : <div className="empty-state"><div className="empty-icon">📝</div><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีการบันทึกกิจกรรม'}</div></div>}
          </div>
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
      </div>
    </div>
  )
}
