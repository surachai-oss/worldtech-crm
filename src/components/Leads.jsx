import { useEffect, useState } from 'react'
import { PAGE_SIZE, fetchLeadsPage, fetchAllLeads, fetchLeadsSourceSummary, fetchLeadsStatusSummary } from '../lib/api'
import { exportLeadsToExcel } from '../lib/importExport'
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
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [sourceSummary, setSourceSummary] = useState({})
  const [statusSummary, setStatusSummary] = useState({})

  const doExport = async () => {
    setExporting(true)
    try {
      const all = await fetchAllLeads({ status, q, dateFrom: fromDate, dateTo: toDate })
      await exportLeadsToExcel(all)
    } catch (e) {
      toast('ส่งออกไม่สำเร็จ: ' + e.message, 'error')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => { setPage(0) }, [status, q, fromDate, toDate])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchLeadsPage({ page, status, q, dateFrom: fromDate, dateTo: toDate }).then(r => {
        if (!alive) return
        setRows(r.rows); setCount(r.count)
      }).catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
      // สรุปช่องทางที่มา/สถานะ ไม่ขึ้นกับตัวกรองสถานะเอง (เห็นทุกช่องทาง/สถานะพร้อมกันเสมอ) แต่ยังตามช่วงวันที่/คำค้นหาที่ตั้งไว้
      fetchLeadsSourceSummary({ q, dateFrom: fromDate, dateTo: toDate }).then(s => { if (alive) setSourceSummary(s) }).catch(() => {})
      fetchLeadsStatusSummary({ q, dateFrom: fromDate, dateTo: toDate }).then(s => { if (alive) setStatusSummary(s) }).catch(() => {})
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [page, status, q, fromDate, toDate, reloadKey])

  const sourceKeys = Object.keys(sourceSummary)
  // เรียงตามลำดับ picklist ก่อน แล้วต่อท้ายด้วยสถานะเก่าที่ไม่อยู่ใน picklist ปัจจุบัน (ถ้ามี) กันข้อมูลตกหล่น
  const statusOrder = list('lead_statuses')
  const statusKeys = [...statusOrder.filter(s => statusSummary[s] != null), ...Object.keys(statusSummary).filter(s => !statusOrder.includes(s))]
  // สีแถบข้างการ์ด ไล่วนตามลำดับเหมือนการ์ดสรุปในหน้า Dashboard (ว่าง = เหลือง)
  const KPI_COLORS = ['', 'navy', 'green', 'red', 'blue']
  const kpiColor = (i) => KPI_COLORS[i % KPI_COLORS.length]

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">ผู้ติดต่อ <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} รายการ)</span></div>
        <button className="btn btn-outline btn-sm" onClick={doExport} disabled={exporting}>{exporting ? 'กำลังส่งออก...' : 'ส่งออกเป็น Excel'}</button>
      </div>

      {(statusKeys.length > 0 || sourceKeys.length > 0) && (
        // สองสรุปวางข้างกันคนละครึ่ง กันหน้ายาวเกินไป — การ์ดในแต่ละฝั่งไหลต่อกันเองตามความกว้างที่เหลือ
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-light)', marginBottom: 6 }}>สรุปตามสถานะ</div>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', margin: 0 }}>
              {statusKeys.map((st, i) => (
                <div className={`kpi-card ${kpiColor(i)}`} key={st}>
                  <div className="kpi-label">{st}</div>
                  <div className="kpi-value">{statusSummary[st]}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-light)', marginBottom: 6 }}>สรุปตามช่องทางที่มา</div>
            <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', margin: 0 }}>
              {sourceKeys.map((src, i) => (
                <div className={`kpi-card ${kpiColor(i)}`} key={src}>
                  <div className="kpi-label">{src}</div>
                  <div className="kpi-value">{sourceSummary[src]}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {list('lead_statuses').map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="filter-input" placeholder="ค้นหาชื่อ/เบอร์/อีเมล..." value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่กรอกเข้ามา ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่กรอกเข้ามา ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
        </div>
      </div>

      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>หัวข้อ</th><th>ชื่อ</th><th>ติดต่อ</th><th>ตำแหน่ง/ธุรกิจ</th><th>สนใจ</th><th>เหตุผล</th><th>ที่มา</th><th>สถานะ</th><th>วันที่</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{l.subject}</td>
                    <td style={{ fontSize: 12 }}>{l.full_name}</td>
                    <td style={{ fontSize: 12 }}>{l.phone}{l.email ? <div style={{ color: 'var(--text-light)' }}>{l.email}</div> : null}</td>
                    <td style={{ fontSize: 12 }}>{l.position || '-'}{l.business_type ? <div style={{ color: 'var(--text-light)' }}>{l.business_type}</div> : null}</td>
                    <td style={{ fontSize: 12 }}>{(l.appliance_interest?.length ? l.appliance_interest.join(', ') : l.interested_product) || '-'}</td>
                    <td style={{ fontSize: 12 }}>{l.purchase_reason || '-'}</td>
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
