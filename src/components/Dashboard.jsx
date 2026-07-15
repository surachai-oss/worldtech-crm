import { useState } from 'react'
import { computeDashboard } from '../lib/api'
import { fmtCurrency, fmtDate, isOverdue, isDueToday, stageBadgeClass, activityColor, stageColor, toLocalDateStr } from '../lib/format'
import { usePicklists } from './PicklistsContext'
import { useLanguage } from './LanguageContext'

// ป็อปอัปแสดงรายการที่อยู่เบื้องหลังการ์ดสรุปแต่ละใบ + กรองตามช่วงวันที่ได้ในตัว
// rows แต่ละแถวแนบ _date (ใช้กรอง) และ _value (ใช้รวมยอด ถ้า config.sum = true) มาให้แล้ว
function KpiDetailModal({ config, onClose }) {
  const { t } = useLanguage()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const rows = config.rows.filter(r => {
    if (from && (!r._date || r._date < from)) return false
    if (to && (!r._date || r._date > to)) return false
    return true
  })
  const total = config.sum ? rows.reduce((s, r) => s + (r._value || 0), 0) : null
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div className="modal-title">{t(config.title)} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length})</span></div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="filter-bar">
            <input className="filter-input" type="date" value={from} onChange={e => setFrom(e.target.value)} title={t('ตั้งแต่')} />
            <span style={{ fontSize: 12, color: 'var(--text-light)', alignSelf: 'center' }}>{t('ถึง')}</span>
            <input className="filter-input" type="date" value={to} onChange={e => setTo(e.target.value)} title={t('ถึง')} />
            {(from || to) && <button className="btn btn-outline btn-sm" onClick={() => { setFrom(''); setTo('') }}>{t('ล้าง')}</button>}
            {total != null && <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--navy)', alignSelf: 'center' }}>{t('รวม')} {fmtCurrency(total)}</span>}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr>{config.columns.map(c => <th key={c.key}>{t(c.label)}</th>)}</tr></thead>
              <tbody>
                {rows.length ? rows.map((r, i) => (
                  <tr key={r.id || i}>
                    {config.columns.map(c => <td key={c.key}>{c.render ? c.render(r) : (r[c.key] ?? '-')}</td>)}
                  </tr>
                )) : <tr><td colSpan={config.columns.length} style={{ textAlign: 'center', padding: 24, color: 'var(--text-light)' }}>{t('ไม่มีข้อมูลในช่วงที่เลือก')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard({ data, onNav }) {
  const { t, lang } = useLanguage()
  const { list } = usePicklists()
  const stages = list('deal_stages')

  // ฟิลเตอร์ส่วนกลางของทั้งหน้าแดชบอร์ด (วันที่ + ประเภทลูกค้า) — มีผลกับทุกการ์ด/กราฟในหน้านี้
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [filterCreditType, setFilterCreditType] = useState('')
  const [detail, setDetail] = useState(null) // key ของการ์ดที่กดเปิดป็อปอัป

  const d = computeDashboard(data, stages, { dateFrom: filterFrom, dateTo: filterTo, creditType: filterCreditType })
  const s = d.summary

  const pipeTotal = stages.reduce((sum, st) => sum + (d.stageData[st]?.count || 0), 0)

  const coName = (id) => data.companies.find(c => c.id === id)?.name || '-'

  // สร้าง config ของป็อปอัปตามการ์ดที่กด — ดึงข้อมูลดิบทั้งหมดจาก data (ป็อปอัปกรองช่วงวันที่เองภายใน)
  const detailConfig = (key) => {
    switch (key) {
      case 'companies': return {
        title: 'บริษัท Active',
        columns: [{ key: 'name', label: 'บริษัท' }, { key: 'industry', label: 'อุตสาหกรรม' }, { key: 'status', label: 'สถานะ' }],
        rows: d.companies.filter(c => c.status === 'Active').map(c => ({ ...c, _date: toLocalDateStr(c.created_at) }))
      }
      case 'openDeals': return {
        title: 'ดีลที่ดำเนินการ', sum: true,
        columns: [{ key: 'name', label: 'ดีล' }, { key: 'company', label: 'บริษัท', render: r => coName(r.company_id) }, { key: 'stage', label: 'Stage' }, { key: 'value', label: 'มูลค่า', render: r => fmtCurrency(r.value) }],
        rows: d.deals.filter(dl => dl.stage !== 'Closed Won' && dl.stage !== 'Closed Lost').map(dl => ({ ...dl, _date: toLocalDateStr(dl.created_at), _value: Number(dl.value) || 0 }))
      }
      case 'wonDeals': return {
        title: 'ปิดดีลสำเร็จ', sum: true,
        columns: [{ key: 'name', label: 'ดีล' }, { key: 'company', label: 'บริษัท', render: r => coName(r.company_id) }, { key: 'close_date', label: 'วันปิด', render: r => fmtDate(r.close_date) }, { key: 'value', label: 'มูลค่า', render: r => fmtCurrency(r.value) }],
        rows: d.deals.filter(dl => dl.stage === 'Closed Won').map(dl => ({ ...dl, _date: dl.close_date || toLocalDateStr(dl.created_at), _value: Number(dl.value) || 0 }))
      }
      case 'overdueTasks': return {
        title: 'งานเกินกำหนด',
        columns: [{ key: 'subject', label: 'งาน' }, { key: 'company', label: 'บริษัท', render: r => coName(r.company_id) }, { key: 'due_date', label: 'ครบกำหนด', render: r => fmtDate(r.due_date) }, { key: 'priority', label: 'ลำดับ' }],
        rows: d.tasks.filter(t => t.status !== 'เสร็จสิ้น' && t.due_date && isOverdue(t.due_date)).map(t => ({ ...t, _date: t.due_date }))
      }
      case 'quotations': return {
        title: 'ใบเสนอราคา', sum: true,
        columns: [{ key: 'quot_no', label: 'เลขที่' }, { key: 'company', label: 'บริษัท', render: r => coName(r.company_id) }, { key: 'status', label: 'สถานะ' }, { key: 'value', label: 'มูลค่า', render: r => fmtCurrency(r.value) }],
        rows: d.quotations.map(q => ({ ...q, _date: q.quot_date, _value: Number(q.value) || 0 }))
      }
      case 'pendingPayments': return {
        title: 'ต้องตามเก็บเงิน (ลูกค้าเครดิต)', sum: true,
        columns: [{ key: 'quot_no', label: 'เลขที่' }, { key: 'company', label: 'บริษัท', render: r => coName(r.company_id) }, { key: 'payment_due_date', label: 'ครบกำหนด', render: r => fmtDate(r.payment_due_date) }, { key: 'value', label: 'มูลค่า', render: r => fmtCurrency(r.value) }],
        rows: d.quotations.filter(q => q.payment_status && q.payment_status !== 'ชำระแล้ว' && q.payment_due_date).map(q => ({ ...q, _date: q.payment_due_date, _value: Number(q.value) || 0 }))
      }
      default: return null
    }
  }

  const kpis = [
    { key: 'companies', cls: '', label: 'บริษัท Active', value: s.activeCompanies, sub: lang === 'en' ? `of ${s.totalCompanies} companies total` : `จากทั้งหมด ${s.totalCompanies} บริษัท` },
    { key: 'openDeals', cls: 'navy', label: 'ดีลที่ดำเนินการ', value: s.openDeals, sub: fmtCurrency(s.openValue) },
    { key: 'wonDeals', cls: 'green', label: 'ปิดดีลสำเร็จ', value: s.wonDeals, sub: fmtCurrency(s.wonValue) },
    { key: 'overdueTasks', cls: 'red', label: 'งานเกินกำหนด', value: s.overdueTasks, sub: lang === 'en' ? `${s.pendingTasks} pending` : `รอดำเนินการ ${s.pendingTasks} รายการ` },
    { key: 'quotations', cls: 'blue', label: 'ใบเสนอราคา', value: s.totalQuotations, sub: '' },
    { key: 'pendingPayments', cls: 'red', label: 'ต้องตามเก็บเงิน', value: s.pendingPayments, sub: s.overduePayments > 0 ? (lang === 'en' ? `${s.overduePayments} overdue` : `เลยกำหนดแล้ว ${s.overduePayments} ใบ`) : (lang === 'en' ? 'None overdue' : 'ยังไม่มีเลยกำหนด') },
  ]

  return (
    <div>
      <div className="filter-bar">
        <input className="filter-input" type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} title={lang === 'en' ? 'From' : 'ตั้งแต่'} />
        <span style={{ fontSize: 12, color: 'var(--text-light)', alignSelf: 'center' }}>{t('ถึง')}</span>
        <input className="filter-input" type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} title={t('ถึง')} />
        <select className="filter-select" value={filterCreditType} onChange={e => setFilterCreditType(e.target.value)}>
          <option value="">{t('ทุกประเภทลูกค้า')}</option>
          <option value="normal">{t('ลูกค้าธรรมดา')}</option>
          <option value="credit">{t('ลูกค้าเครดิต')}</option>
        </select>
        {(filterFrom || filterTo || filterCreditType) && <button className="btn btn-outline btn-sm" onClick={() => { setFilterFrom(''); setFilterTo(''); setFilterCreditType('') }}>{t('ล้าง')}</button>}
      </div>

      <div className="kpi-grid">
        {kpis.map(k => (
          <div className={`kpi-card ${k.cls}`} key={k.key} style={{ cursor: 'pointer' }} onClick={() => setDetail(k.key)} title={t('กดเพื่อดูรายละเอียด')}>
            <div className="kpi-label">{t(k.label)}</div>
            <div className="kpi-value">{k.value}</div>
            {k.sub && <div className="kpi-sub">{k.sub}</div>}
          </div>
        ))}
      </div>

      {detail && <KpiDetailModal config={detailConfig(detail)} onClose={() => setDetail(null)} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Pipeline</div>
          </div>
          <div className="card-body">
            <div className="pipeline-bar">
              {stages.map(st => {
                const cnt = d.stageData[st]?.count || 0
                const pct = pipeTotal ? (cnt / pipeTotal * 100) : 0
                return <div key={st} className="pipeline-seg" title={`${st}: ${cnt}`} style={{ width: pct + '%', background: stageColor(st), minWidth: cnt > 0 ? 4 : 0 }} />
              })}
            </div>
            <div className="table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead><tr><th>Stage</th><th style={{ textAlign: 'center' }}>{t('จำนวน')}</th><th style={{ textAlign: 'right' }}>{t('มูลค่า')}</th></tr></thead>
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
          <div className="card-header"><div className="card-title">Top Deals</div><button className="btn btn-outline btn-sm" onClick={() => onNav('deals')}>{t('ดูทั้งหมด')}</button></div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ border: 'none' }}>
              <table>
                <thead><tr><th>{t('ดีล')}</th><th>Stage</th><th>{t('มูลค่า')}</th><th>{t('กำหนด')}</th></tr></thead>
                <tbody>
                  {d.topDeals.length ? d.topDeals.map(dl => (
                    <tr key={dl.id}>
                      <td><div style={{ fontWeight: 500 }}>{dl.name}</div><div style={{ fontSize: 11, color: 'var(--text-light)' }}>{dl.companyName}</div></td>
                      <td><span className={`badge ${stageBadgeClass(dl.stage)}`}>{dl.stage}</span></td>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{fmtCurrency(dl.value)}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(dl.close_date)}</td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-light)', padding: 20 }}>{t('ยังไม่มีดีล')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">{t('กิจกรรมล่าสุด')}</div></div>
          <div className="card-body" style={{ padding: '0 16px' }}>
            <div className="activity-feed">
              {d.recentActivities.length ? d.recentActivities.map(a => (
                <div className="activity-item" key={a.id}>
                  <div className="activity-icon" style={{ background: activityColor(a.type) }} />
                  <div className="activity-content">
                    <div className="activity-title">{a.subject}</div>
                    <div className="activity-meta"><span>{a.companyName}</span><span>{a.type}</span><span>{fmtDate(a.activity_date)}</span><span>{t('โดย')} {a.recorded_by}</span></div>
                    {a.detail && <div className="activity-detail">{a.detail}</div>}
                  </div>
                </div>
              )) : <div className="empty-state"><div>{t('ยังไม่มีกิจกรรม')}</div></div>}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="card-title">{t('งานที่ต้องทำ (14 วัน)')}</div><button className="btn btn-outline btn-sm" onClick={() => onNav('tasks')}>{t('ดูทั้งหมด')}</button></div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrap" style={{ border: 'none' }}>
              {d.upcomingTasks.length ? (
                <table>
                  <thead><tr><th>{t('งาน')}</th><th>{t('บริษัท')}</th><th>{t('กำหนด')}</th><th>{t('ลำดับ')}</th></tr></thead>
                  <tbody>
                    {d.upcomingTasks.map(t2 => {
                      const ov = isOverdue(t2.due_date), td = isDueToday(t2.due_date)
                      return (
                        <tr key={t2.id}>
                          <td style={{ fontWeight: 500 }}>{t2.subject}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-light)' }}>{t2.companyName || '-'}</td>
                          <td className={ov ? 'overdue' : td ? 'due-today' : ''}>{fmtDate(t2.due_date)}</td>
                          <td>{t2.priority}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : <div className="empty-state"><div>{t('ไม่มีงานใน 14 วัน')}</div></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
