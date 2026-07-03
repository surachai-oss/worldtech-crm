import { useState } from 'react'
import { fmtCurrency, fmtDate, isOverdue, isDueToday, stageBadgeClass, statusBadgeClass, quotBadgeClass, priorityIcon, activityIcon, activityColor } from '../lib/format'
import { CONSTANTS } from '../lib/api'
import { printQuotation } from '../lib/printQuotation'

const TABS = [
  ['info', 'ข้อมูลบริษัท'], ['contacts', 'ผู้ติดต่อ'], ['deals', 'ดีล'],
  ['activities', 'กิจกรรม'], ['tasks', 'งาน'], ['quotations', 'ใบเสนอราคา']
]

export default function CompanyDetail({ company, contacts, deals, activities, tasks, quotations, settings, onBack, actions }) {
  const [tab, setTab] = useState('info')
  if (!company) return null

  const counts = { contacts: contacts.length, deals: deals.length, activities: activities.length, tasks: tasks.length, quotations: quotations.length }
  const pendingTasks = tasks.filter(t => t.status !== 'เสร็จสิ้น').length

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-outline btn-sm" onClick={onBack}>← กลับ</button>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>{company.name}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`badge ${statusBadgeClass(company.status)}`}>{company.status}</span>
                <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{company.industry}</span>
                {company.phone && <span style={{ fontSize: 12 }}>📞 {company.phone}</span>}
                {company.email && <span style={{ fontSize: 12 }}>✉️ {company.email}</span>}
                {company.website && <a href={company.website} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>🌐 เว็บไซต์</a>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-outline btn-sm" onClick={() => actions.addActivity(company.id)}>+ บันทึกการติดต่อ</button>
              <button className="btn btn-outline btn-sm" onClick={() => actions.addTask(company.id)}>+ เพิ่มงาน</button>
              <button className="btn btn-primary btn-sm" onClick={() => actions.editCompany(company)}>✏️ แก้ไข</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <Stat n={counts.contacts} label="ผู้ติดต่อ" />
            <Stat n={counts.deals} label="ดีล" />
            <Stat n={counts.activities} label="กิจกรรม" />
            <Stat n={pendingTasks} label="งานค้าง" />
          </div>
        </div>
      </div>

      <div className="detail-tabs">
        {TABS.map(([id, label]) => (
          <div key={id} className={`detail-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}{counts[id] !== undefined ? ` (${counts[id]})` : ''}
          </div>
        ))}
      </div>

      {tab === 'info' && <InfoTab company={company} />}
      {tab === 'contacts' && <ContactsTab contacts={contacts} onAdd={() => actions.addContact(company.id)} onEdit={(c) => actions.editContact(company.id, c)} onDelete={actions.deleteContact} />}
      {tab === 'deals' && <DealsTab deals={deals} onAdd={() => actions.addDeal(company.id)} onEdit={actions.editDeal} onDelete={actions.deleteDeal} />}
      {tab === 'activities' && <ActivitiesTab activities={activities} onAdd={() => actions.addActivity(company.id)} onDelete={actions.deleteActivity} />}
      {tab === 'tasks' && <TasksTab tasks={tasks} onAdd={() => actions.addTask(company.id)} onEdit={actions.editTask} onComplete={actions.completeTask} onDelete={actions.deleteTask} />}
      {tab === 'quotations' && <QuotationsTab quotations={quotations} company={company} settings={settings} onAdd={() => actions.addQuotation(company.id)} onStatusChange={actions.quotStatus} onDelete={actions.deleteQuotation} />}
    </div>
  )
}

function Stat({ n, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{n}</div>
      <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{label}</div>
    </div>
  )
}

function InfoTab({ company }) {
  const rows = [
    ['ที่อยู่', company.address], ['ผู้รับผิดชอบ', company.owner],
    ['วันที่สร้าง', fmtDate(company.created_at)], ['อัปเดตล่าสุด', fmtDate(company.updated_at)],
    ['หมายเหตุ', company.note]
  ].filter(r => r[1])
  return (
    <div className="card"><div className="card-body">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 13 }}>{v || '-'}</div>
          </div>
        ))}
      </div>
    </div></div>
  )
}

function ContactsTab({ contacts, onAdd, onEdit, onDelete }) {
  return (
    <>
      <div className="section-header"><div className="section-title">ผู้ติดต่อ</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ เพิ่ม</button></div>
      <div className="card"><div className="table-wrap">
        {contacts.length ? (
          <table>
            <thead><tr><th>ชื่อ</th><th>ตำแหน่ง</th><th>โทรศัพท์</th><th>อีเมล</th><th>Line</th><th>การจัดการ</th></tr></thead>
            <tbody>{contacts.map(c => (
              <tr key={c.id}>
                <td><div style={{ fontWeight: 500 }}>{c.full_name}</div><div style={{ fontSize: 11, color: 'var(--text-light)' }}>{c.department}</div></td>
                <td style={{ fontSize: 12 }}>{c.position || '-'}</td>
                <td style={{ fontSize: 12 }}>{c.phone || '-'}</td>
                <td style={{ fontSize: 12 }}>{c.email || '-'}</td>
                <td style={{ fontSize: 12 }}>{c.line_id || '-'}</td>
                <td className="td-actions">
                  <button className="btn btn-outline btn-xs" onClick={() => onEdit(c)}>✏️</button>
                  <button className="btn btn-danger btn-xs" onClick={() => onDelete(c.id)}>🗑</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="empty-state"><div className="empty-icon">👥</div><div>ยังไม่มีผู้ติดต่อ</div></div>}
      </div></div>
    </>
  )
}

function DealsTab({ deals, onAdd, onEdit, onDelete }) {
  return (
    <>
      <div className="section-header"><div className="section-title">ดีลการขาย</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ เพิ่มดีล</button></div>
      <div className="card"><div className="table-wrap">
        {deals.length ? (
          <table>
            <thead><tr><th>ชื่อดีล</th><th>Stage</th><th>มูลค่า</th><th>วันปิดดีล</th><th>ผู้รับผิดชอบ</th><th>การจัดการ</th></tr></thead>
            <tbody>{deals.map(d => (
              <tr key={d.id}>
                <td style={{ fontWeight: 500 }}>{d.name}</td>
                <td><span className={`badge ${stageBadgeClass(d.stage)}`}>{d.stage}</span></td>
                <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{fmtCurrency(d.value)}</td>
                <td style={{ fontSize: 12 }}>{fmtDate(d.close_date)}</td>
                <td style={{ fontSize: 12 }}>{d.owner || '-'}</td>
                <td className="td-actions">
                  <button className="btn btn-outline btn-xs" onClick={() => onEdit(d)}>✏️</button>
                  <button className="btn btn-danger btn-xs" onClick={() => onDelete(d.id)}>🗑</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="empty-state"><div className="empty-icon">🤝</div><div>ยังไม่มีดีล</div></div>}
      </div></div>
    </>
  )
}

function ActivitiesTab({ activities, onAdd, onDelete }) {
  const sorted = [...activities].sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
  return (
    <>
      <div className="section-header"><div className="section-title">ประวัติการติดต่อ</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ บันทึก</button></div>
      <div className="card"><div className="card-body">
        <div className="activity-feed">
          {sorted.length ? sorted.map(a => (
            <div className="activity-item" key={a.id}>
              <div className="activity-icon" style={{ background: activityColor(a.type) }}>{activityIcon(a.type)}</div>
              <div className="activity-content">
                <div className="activity-title">{a.subject}</div>
                <div className="activity-meta"><span>{a.type}</span><span>{fmtDate(a.activity_date)}</span><span>โดย {a.recorded_by}</span></div>
                {a.detail && <div className="activity-detail">{a.detail}</div>}
              </div>
              <button className="btn btn-danger btn-xs" onClick={() => onDelete(a.id)}>🗑</button>
            </div>
          )) : <div className="empty-state"><div className="empty-icon">📝</div><div>ยังไม่มีกิจกรรม</div></div>}
        </div>
      </div></div>
    </>
  )
}

function TasksTab({ tasks, onAdd, onEdit, onComplete, onDelete }) {
  return (
    <>
      <div className="section-header"><div className="section-title">งาน Follow-up</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ เพิ่มงาน</button></div>
      <div className="card"><div className="table-wrap">
        {tasks.length ? (
          <table>
            <thead><tr><th>งาน</th><th>ลำดับ</th><th>วันครบกำหนด</th><th>สถานะ</th><th>การจัดการ</th></tr></thead>
            <tbody>{tasks.map(t => {
              const ov = t.status !== 'เสร็จสิ้น' && isOverdue(t.due_date)
              return (
                <tr key={t.id} style={{ background: ov ? '#fff5f5' : undefined }}>
                  <td><div style={{ fontWeight: 500 }}>{t.subject}</div>{t.note && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{t.note}</div>}</td>
                  <td>{priorityIcon(t.priority)} {t.priority || '-'}</td>
                  <td className={ov ? 'overdue' : isDueToday(t.due_date) ? 'due-today' : ''} style={{ fontSize: 12 }}>{ov ? '🚨 ' : ''}{fmtDate(t.due_date)}</td>
                  <td><span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span></td>
                  <td className="td-actions">
                    {t.status !== 'เสร็จสิ้น' && <button className="btn btn-success btn-xs" onClick={() => onComplete(t.id)}>✓</button>}
                    <button className="btn btn-outline btn-xs" onClick={() => onEdit(t)}>✏️</button>
                    <button className="btn btn-danger btn-xs" onClick={() => onDelete(t.id)}>🗑</button>
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        ) : <div className="empty-state"><div className="empty-icon">✅</div><div>ยังไม่มีงาน</div></div>}
      </div></div>
    </>
  )
}

function QuotationsTab({ quotations, company, settings, onAdd, onStatusChange, onDelete }) {
  return (
    <>
      <div className="section-header"><div className="section-title">ใบเสนอราคา</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ สร้างใบเสนอราคา</button></div>
      <div className="card"><div className="table-wrap">
        {quotations.length ? (
          <table>
            <thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>มูลค่า</th><th>สถานะ</th><th>วันที่</th><th>การจัดการ</th></tr></thead>
            <tbody>{quotations.map(q => (
              <tr key={q.id}>
                <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{q.quot_no}</td>
                <td>{q.subject}</td>
                <td style={{ fontWeight: 600 }}>{fmtCurrency(q.value)}</td>
                <td><span className={`badge ${quotBadgeClass(q.status)}`}>{q.status}</span></td>
                <td style={{ fontSize: 12 }}>{fmtDate(q.quot_date)}</td>
                <td className="td-actions">
                  <select className="filter-select" style={{ fontSize: 11, padding: '3px 6px' }} value={q.status} onChange={e => onStatusChange(q.id, e.target.value)}>
                    {CONSTANTS.QUOT_STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <button className="btn btn-secondary btn-xs" onClick={() => printQuotation(q, company, settings)}>📄 PDF</button>
                  <button className="btn btn-danger btn-xs" onClick={() => onDelete(q.id)}>🗑</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="empty-state"><div className="empty-icon">📋</div><div>ยังไม่มีใบเสนอราคา</div></div>}
      </div></div>
    </>
  )
}
