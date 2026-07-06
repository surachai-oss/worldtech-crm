import { computeDashboard } from '../lib/api'
import { fmtCurrency, fmtDate, isOverdue, isDueToday, stageBadgeClass, priorityIcon, activityIcon, activityColor, stageColor } from '../lib/format'
import { usePicklists } from './PicklistsContext'

export default function Dashboard({ data, onNav }) {
  const { list } = usePicklists()
  const stages = list('deal_stages')
  const d = computeDashboard(data, stages)
  const s = d.summary
  const total = stages.reduce((sum, st) => sum + (d.stageData[st]?.count || 0), 0)

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">บริษัท Active</div>
          <div className="kpi-value">{s.activeCompanies}</div>
          <div className="kpi-sub">จากทั้งหมด {s.totalCompanies} บริษัท</div>
          <div className="kpi-icon">🏢</div>
        </div>
        <div className="kpi-card navy">
          <div className="kpi-label">ดีลที่ดำเนินการ</div>
          <div className="kpi-value">{s.openDeals}</div>
          <div className="kpi-sub">{fmtCurrency(s.openValue)}</div>
          <div className="kpi-icon">🤝</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">ปิดดีลสำเร็จ</div>
          <div className="kpi-value">{s.wonDeals}</div>
          <div className="kpi-sub">{fmtCurrency(s.wonValue)}</div>
          <div className="kpi-icon">🏆</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">งานเกินกำหนด</div>
          <div className="kpi-value">{s.overdueTasks}</div>
          <div className="kpi-sub">รอดำเนินการ {s.pendingTasks} รายการ</div>
          <div className="kpi-icon">⚠️</div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-label">ใบเสนอราคา</div>
          <div className="kpi-value">{s.totalQuotations}</div>
          <div className="kpi-icon">📋</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">🔢 Pipeline ดีล</div></div>
          <div className="card-body">
            <div className="pipeline-bar">
              {stages.map(st => {
                const cnt = d.stageData[st]?.count || 0
                const pct = total ? (cnt / total * 100) : 0
                return <div key={st} className="pipeline-seg" title={`${st}: ${cnt}`} style={{ width: pct + '%', background: stageColor(st), minWidth: cnt > 0 ? 4 : 0 }} />
              })}
            </div>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead><tr><th>Stage</th><th style={{ textAlign: 'center' }}>จำนวน</th><th style={{ textAlign: 'right' }}>มูลค่า</th></tr></thead>
                <tbody>
                  {stages.map(st => {
                    const info = d.stageData[st] || { count: 0, value: 0 }
                    return (
                      <tr key={st}>
                        <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: stageColor(st), marginRight: 6 }} />{st}</td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{info.count}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--navy)' }}>{fmtCurrency(info.value)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">🏆 Top Deals</div><button className="btn btn-outline btn-sm" onClick={() => onNav('deals')}>ดูทั้งหมด</button></div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ border: 'none' }}>
              <table>
                <thead><tr><th>ดีล</th><th>Stage</th><th>มูลค่า</th><th>กำหนด</th></tr></thead>
                <tbody>
                  {d.topDeals.length ? d.topDeals.map(dl => (
                    <tr key={dl.id}>
                      <td><div style={{ fontWeight: 500 }}>{dl.name}</div><div style={{ fontSize: 11, color: 'var(--text-light)' }}>{dl.companyName}</div></td>
                      <td><span className={`badge ${stageBadgeClass(dl.stage)}`}>{dl.stage}</span></td>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{fmtCurrency(dl.value)}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(dl.close_date)}</td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-light)', padding: 20 }}>ยังไม่มีดีล</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">📝 กิจกรรมล่าสุด</div><button className="btn btn-outline btn-sm" onClick={() => onNav('activities')}>ดูทั้งหมด</button></div>
          <div className="card-body" style={{ padding: '0 16px' }}>
            <div className="activity-feed">
              {d.recentActivities.length ? d.recentActivities.map(a => (
                <div className="activity-item" key={a.id}>
                  <div className="activity-icon" style={{ background: activityColor(a.type) }}>{activityIcon(a.type)}</div>
                  <div className="activity-content">
                    <div className="activity-title">{a.subject}</div>
                    <div className="activity-meta"><span>{a.companyName}</span><span>{a.type}</span><span>{fmtDate(a.activity_date)}</span><span>โดย {a.recorded_by}</span></div>
                    {a.detail && <div className="activity-detail">{a.detail}</div>}
                  </div>
                </div>
              )) : <div className="empty-state"><div className="empty-icon">📝</div><div>ยังไม่มีกิจกรรม</div></div>}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">✅ งานที่ต้องทำ (14 วัน)</div><button className="btn btn-outline btn-sm" onClick={() => onNav('tasks')}>ดูทั้งหมด</button></div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ border: 'none' }}>
              {d.upcomingTasks.length ? (
                <table>
                  <thead><tr><th>งาน</th><th>บริษัท</th><th>กำหนด</th><th>ลำดับ</th></tr></thead>
                  <tbody>
                    {d.upcomingTasks.map(t => {
                      const ov = isOverdue(t.due_date), td = isDueToday(t.due_date)
                      return (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 500 }}>{t.subject}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-light)' }}>{t.companyName || '-'}</td>
                          <td className={ov ? 'overdue' : td ? 'due-today' : ''}>{ov ? '🚨 ' : td ? '⏰ ' : ''}{fmtDate(t.due_date)}</td>
                          <td>{priorityIcon(t.priority)} {t.priority}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : <div className="empty-state"><div className="empty-icon">✅</div><div>ไม่มีงานใน 14 วัน</div></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
