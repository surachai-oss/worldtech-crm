import { useMemo, useState } from 'react'
import { CONSTANTS } from '../lib/api'
import { fmtDate, activityIcon, activityColor } from '../lib/format'

export default function Activities({ activities, companies, onNavCompany, onAdd, onDelete }) {
  const [type, setType] = useState('')
  const list = useMemo(() => {
    let l = activities
    if (type) l = l.filter(a => a.type === type)
    return [...l].sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
  }, [activities, type])

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📝 ประวัติการติดต่อ <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({activities.length} รายการ)</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ บันทึกการติดต่อ</button>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={type} onChange={e => setType(e.target.value)}>
          <option value="">ทุกประเภท</option>
          {CONSTANTS.ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="card-body">
          <div className="activity-feed">
            {list.length ? list.map(a => {
              const co = companies.find(c => c.id === a.company_id)
              return (
                <div className="activity-item" key={a.id}>
                  <div className="activity-icon" style={{ background: activityColor(a.type) }}>{activityIcon(a.type)}</div>
                  <div className="activity-content">
                    <div className="activity-title">{a.subject}</div>
                    <div className="activity-meta">
                      {co && <a onClick={() => onNavCompany(co.id)} style={{ fontWeight: 500 }}>{co.name}</a>}
                      <span>{a.type}</span><span>{fmtDate(a.activity_date)}</span><span>โดย {a.recorded_by}</span>
                    </div>
                    {a.detail && <div className="activity-detail">{a.detail}</div>}
                  </div>
                  <button className="btn btn-danger btn-xs" onClick={() => onDelete(a.id)}>🗑</button>
                </div>
              )
            }) : <div className="empty-state"><div className="empty-icon">📝</div><div>ยังไม่มีการบันทึกกิจกรรม</div></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
