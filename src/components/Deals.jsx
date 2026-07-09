import { useState } from 'react'
import { fmtCurrency, fmtDate, stageColor, toLocalDateStr } from '../lib/format'
import { canEdit } from '../lib/permissions'
import { usePicklists } from './PicklistsContext'

const OPEN_STAGES_EXCLUDED = ['Closed Won', 'Closed Lost']

const SALES_MODES = [
  { key: 'day', label: 'รายวัน' },
  { key: 'week', label: 'รายสัปดาห์' },
  { key: 'month', label: 'รายเดือน' },
]

// จัดกลุ่มดีลที่ปิดสำเร็จ (Closed Won) ตามวันที่ปิด (close_date) แบบราย วัน/สัปดาห์/เดือน
// week = อิงวันจันทร์ต้นสัปดาห์, ไม่กรองตามช่วงวันที่บนหน้าจอ เพื่อให้เห็นภาพรวมยอดขายเสมอ
function groupWonSales(won, mode) {
  const groups = {}
  won.forEach(d => {
    const raw = d.close_date
    let key, label
    if (!raw) { key = 'zzz-ไม่ระบุ'; label = 'ไม่ระบุวันที่ปิด' }
    else {
      const [y, m, dd] = raw.split('-').map(Number)
      if (mode === 'month') {
        key = `${y}-${String(m).padStart(2, '0')}`
        label = new Date(y, m - 1, 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
      } else if (mode === 'week') {
        const dt = new Date(y, m - 1, dd)
        const off = (dt.getDay() + 6) % 7 // 0 = จันทร์
        const mon = new Date(y, m - 1, dd - off)
        key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
        label = 'สัปดาห์ ' + fmtDate(key)
      } else {
        key = raw
        label = fmtDate(raw)
      }
    }
    ;(groups[key] ||= { label, rows: [] }).rows.push(d)
  })
  return Object.keys(groups).sort().reverse().map(k => ({ key: k, ...groups[k] }))
}

// ป็อปอัปแสดงว่ายอดขายที่ปิดสำเร็จมาจากดีลไหนบ้าง ตามช่วงที่เลือก (วัน/สัปดาห์/เดือน) — แต่ละกลุ่มลิสต์ดีลที่อยู่ในนั้น
function SalesDetailModal({ won, companies, mode, onClose }) {
  const groups = groupWonSales(won, mode)
  const grandTotal = won.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const modeLabel = (SALES_MODES.find(m => m.key === mode) || {}).label || ''
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div className="modal-title">ยอดขายที่ปิดดีลสำเร็จ · {modeLabel} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({won.length} ดีล · {fmtCurrency(grandTotal)})</span></div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {groups.map(g => {
            const total = g.rows.reduce((s, d) => s + (Number(d.value) || 0), 0)
            return (
              <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--gray-bg)', fontWeight: 600 }}>
                  <span>{g.label}</span>
                  <span style={{ color: 'var(--navy)' }}>{g.rows.length} ดีล · {fmtCurrency(total)}</span>
                </div>
                <table>
                  <tbody>
                    {g.rows.map(d => {
                      const co = companies.find(c => c.id === d.company_id)
                      return (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 500 }}>{d.name}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-light)' }}>{co ? co.name : '-'}</td>
                          <td style={{ fontSize: 12 }}>{fmtDate(d.close_date)}</td>
                          <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{fmtCurrency(d.value)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// สรุปดีลที่ยังไม่ปิด (เปิดอยู่) ที่มีวันที่ต้อง Follow up ไว้ แยกเป็นกลุ่มตามเดือน
// ให้เซลล์เห็นภาพรวมว่าเดือนไหนมีดีลต้องตามบ้าง กันดีลตกหล่น — เดือนที่เลยกำหนดมาแล้วไฮไลต์สีแดง
function FollowUpSummary({ deals, companies, onEdit }) {
  const openWithFollowUp = deals.filter(d => !OPEN_STAGES_EXCLUDED.includes(d.stage) && d.follow_up_date)
  if (!openWithFollowUp.length) return null

  const groups = {}
  openWithFollowUp.forEach(d => {
    const key = d.follow_up_date.slice(0, 7) // YYYY-MM (follow_up_date เป็น date เฉยๆ ไม่มี timezone ให้ต้องแปลง)
    ;(groups[key] ||= []).push(d)
  })
  const monthKeys = Object.keys(groups).sort()

  const now = new Date()
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header"><div className="card-title">ดีลที่ต้องติดตาม (Follow-up) แยกตามเดือน</div></div>
      <div className="card-body" style={{ padding: 0 }}>
        {monthKeys.map(key => {
          const rows = groups[key].sort((a, b) => a.follow_up_date < b.follow_up_date ? -1 : 1)
          const total = rows.reduce((s, d) => s + (Number(d.value) || 0), 0)
          const [y, m] = key.split('-').map(Number)
          const label = new Date(y, m - 1, 1).toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
          const overdue = key < thisMonthKey
          return (
            <div key={key} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px',
                background: overdue ? '#fff5f5' : key === thisMonthKey ? '#fffbeb' : undefined
              }}>
                <div style={{ fontWeight: 600, color: overdue ? 'var(--danger)' : undefined }}>
                  {overdue ? 'เลยกำหนดแล้ว — ' : ''}{label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{rows.length} ดีล · {fmtCurrency(total)}</div>
              </div>
              <div className="table-wrap" style={{ border: 'none' }}>
                <table>
                  <tbody>
                    {rows.map(d => {
                      const co = companies.find(c => c.id === d.company_id)
                      return (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 500 }}>{d.name}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-light)' }}>{co ? co.name : '-'}</td>
                          <td style={{ fontSize: 12 }}>ตามวันที่ {fmtDate(d.follow_up_date)}</td>
                          <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{fmtCurrency(d.value)}</td>
                          <td className="td-actions"><button className="btn btn-outline btn-xs" onClick={() => onEdit(d)}>แก้ไข</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Deals({ perm, deals, companies, onAdd, onAddStage, onEdit, onCreateQuotation }) {
  const { list } = usePicklists()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [salesMode, setSalesMode] = useState(null) // null = ปิด, 'day'/'week'/'month' = เปิด popup ของช่วงนั้น

  // กรองตามวันที่สร้างดีล (created_at) — เทียบเป็นวันที่ตามเวลาเครื่อง ไม่ใช่ UTC เพราะ created_at เก็บเป็น timestamptz
  const filtered = deals.filter(d => {
    const created = toLocalDateStr(d.created_at)
    if (fromDate && created < fromDate) return false
    if (toDate && created > toDate) return false
    return true
  })
  const totalVal = filtered.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const won = deals.filter(d => d.stage === 'Closed Won')
  const wonTotal = won.reduce((s, d) => s + (Number(d.value) || 0), 0)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">ดีลการขาย <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({filtered.length} ดีล · {fmtCurrency(totalVal)})</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ เพิ่มดีล</button>
      </div>
      {/* ยอดขายรวมแบบกดดูรายละเอียดได้ ชิดซ้าย + ตัวกรองวันที่ชิดขวาบรรทัดเดียวกัน */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 10 }}>
        <div className="kpi-card green" style={{ flex: '0 0 auto', minWidth: 320 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
            <div className="kpi-label">ยอดขายที่ปิดดีลสำเร็จ</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {SALES_MODES.map(m => (
                <button key={m.key} type="button" className={`btn btn-xs ${salesMode === m.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setSalesMode(m.key)} title={`ดูยอดขาย${m.label}`}>{m.label}</button>
              ))}
            </div>
          </div>
          <div className="kpi-value">{fmtCurrency(wonTotal)}</div>
        </div>
        <div className="filter-bar" style={{ margin: 0, flexShrink: 0 }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่สร้างดีล ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)', alignSelf: 'center' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่สร้างดีล ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
        </div>
      </div>
      {salesMode && <SalesDetailModal won={won} companies={companies} mode={salesMode} onClose={() => setSalesMode(null)} />}
      <FollowUpSummary deals={deals} companies={companies} onEdit={onEdit} />
      <div className="kanban-board">
        {list('deal_stages').map(stage => {
          const sd = filtered.filter(d => d.stage === stage)
          const sv = sd.reduce((s, d) => s + (Number(d.value) || 0), 0)
          const color = stageColor(stage)
          return (
            <div className="kanban-col" key={stage}>
              <div className="kanban-col-header" style={{ background: color + '22', color }}>
                <span>{stage}</span>
                <span style={{ background: color + '40', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{sd.length}</span>
              </div>
              {sv > 0 && <div style={{ fontSize: 10, color: 'var(--text-light)', padding: '0 4px 4px' }}>{fmtCurrency(sv)}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                {sd.map(d => {
                  const co = companies.find(c => c.id === d.company_id)
                  return (
                    <div className="kanban-card" key={d.id} style={{ position: 'relative' }}>
                      {canEdit(d, perm) && (
                        <button className="btn btn-secondary btn-xs" style={{ position: 'absolute', top: 6, right: 6, padding: '2px 6px', fontSize: 10 }} onClick={() => onCreateQuotation(d)} title="ก็อปข้อมูลดีลนี้ไปสร้างใบเสนอราคา">ออกใบเสนอราคา</button>
                      )}
                      <div className="deal-name" style={{ paddingRight: canEdit(d, perm) ? 92 : 0 }}>{d.name}</div>
                      <div className="deal-co">{co ? co.name : '-'}{co?.credit_term && <span className="badge badge-orange" style={{ marginLeft: 6, fontSize: 9, fontWeight: 400 }}>{co.credit_term}</span>}</div>
                      {/* ราคา + ปุ่มแก้ไข อยู่บรรทัดเดียวกัน (แก้ไขชิดขวา) เพื่อให้การ์ดสั้นลง */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: 8 }}>
                        <div className="deal-val">{fmtCurrency(d.value)}</div>
                        {canEdit(d, perm) && <button className="btn btn-outline btn-xs" onClick={() => onEdit(d)}>แก้ไข</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 8, fontSize: 11 }} onClick={() => onAddStage(stage)}>+ เพิ่ม</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
