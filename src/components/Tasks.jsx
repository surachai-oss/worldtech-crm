import { useEffect, useState } from 'react'
import { PAGE_SIZE, fetchTasksPage, fetchTaskCounts } from '../lib/api'
import { fmtDate, isOverdue, isDueToday, statusBadgeClass } from '../lib/format'
import { canEdit, canDelete } from '../lib/permissions'
import { useUi } from './UiContext'
import { usePicklists } from './PicklistsContext'
import { useLanguage } from './LanguageContext'
import Pagination from './Pagination'

export default function Tasks({ perm, reloadKey, onNavCompany, onAdd, onEdit, onComplete, onDelete }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const { list } = usePicklists()
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')
  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState({ pending: 0, overdue: 0, done: 0 })

  useEffect(() => { setPage(0) }, [status, priority, q, fromDate, toDate])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchTasksPage({ page, status, priority, q, dateFrom: fromDate, dateTo: toDate }).then(r => {
        if (!alive) return
        setRows(r.rows); setCount(r.count)
      }).catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [page, status, priority, q, fromDate, toDate, reloadKey])

  useEffect(() => {
    let alive = true
    fetchTaskCounts().then(s => { if (alive) setSummary(s) }).catch(() => {})
    return () => { alive = false }
  }, [reloadKey])

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">{t('งานติดตาม')} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} {t('รายการ')})</span></div>
        <button className="btn btn-primary" onClick={onAdd}>{t('+ เพิ่มงาน')}</button>
      </div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 14 }}>
        <div className="kpi-card"><div className="kpi-label">{t('รอดำเนินการ')}</div><div className="kpi-value" style={{ color: 'var(--warning)' }}>{summary.pending}</div></div>
        <div className="kpi-card red"><div className="kpi-label">{t('เกินกำหนด')}</div><div className="kpi-value" style={{ color: 'var(--danger)' }}>{summary.overdue}</div></div>
        <div className="kpi-card green"><div className="kpi-label">{t('เสร็จสิ้น')}</div><div className="kpi-value" style={{ color: 'var(--success)' }}>{summary.done}</div></div>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{t('ทุกสถานะ')}</option>
          {list('task_statuses').map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={priority} onChange={e => setPriority(e.target.value)}>
          <option value="">{t('ทุกลำดับ')}</option>
          {list('task_priorities').map(p => <option key={p}>{p}</option>)}
        </select>
        <input className="filter-input" placeholder={t('ค้นหา...')} value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title={lang === 'en' ? 'Due date from' : 'วันครบกำหนด ตั้งแต่'} />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('ถึง')}</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title={lang === 'en' ? 'Due date to' : 'วันครบกำหนด ถึง'} />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>{t('ล้าง')}</button>}
        </div>
      </div>
      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>{t('งาน')}</th><th>{t('บริษัท/ผู้ติดต่อ')}</th><th>{t('วันครบกำหนด')}</th><th>{t('ลำดับ')}</th><th>{t('สถานะ')}</th><th>{t('ผู้รับผิดชอบ')}</th><th>{t('การจัดการ')}</th></tr></thead>
              <tbody>
                {rows.map(task => {
                  const ov = task.status !== 'เสร็จสิ้น' && isOverdue(task.due_date)
                  const td = isDueToday(task.due_date)
                  return (
                    <tr key={task.id} style={{ background: ov ? '#fff5f5' : td ? '#fffbeb' : undefined }}>
                      <td><div style={{ fontWeight: 500 }}>{task.subject}</div>{task.note && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{task.note}</div>}</td>
                      <td style={{ fontSize: 12 }}>
                        {task.company
                          ? <a onClick={() => onNavCompany(task.company.id)}>{task.company.name}</a>
                          : task.lead
                            ? <div>{task.lead.full_name}{task.lead.phone && <div style={{ color: 'var(--text-light)' }}>{task.lead.phone}</div>}</div>
                            : '-'}
                      </td>
                      <td className={ov ? 'overdue' : td ? 'due-today' : ''} style={{ fontSize: 12 }}>{fmtDate(task.due_date)}</td>
                      <td>{task.priority || '-'}</td>
                      <td><span className={`badge ${statusBadgeClass(task.status)}`}>{task.status}</span></td>
                      <td style={{ fontSize: 12 }}>{task.owner || '-'}</td>
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        {task.status !== 'เสร็จสิ้น' && canEdit(task, perm) && <button className="btn btn-success btn-xs" onClick={() => onComplete(task.id)}>{t('เสร็จ')}</button>}
                        {canEdit(task, perm) && <button className="btn btn-outline btn-xs" onClick={() => onEdit(task)}>{t('แก้ไข')}</button>}
                        {canDelete(task, perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(task.id)}>{t('ลบ')}</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? t('กำลังโหลด...') : t('ไม่มีงาน')}</div></div>}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
      </div>
    </div>
  )
}
