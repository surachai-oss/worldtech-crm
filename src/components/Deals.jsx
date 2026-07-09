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

// จัดกลุ่มดีลตามวันในฟิลด์ที่เลือก (close_date / follow_up_date) แบบราย วัน/สัปดาห์/เดือน
// week = อิงวันจันทร์ต้นสัปดาห์ — ascending=true เรียงวันใกล้สุดก่อน (ใช้กับยอดที่ต้องติดตาม), false เรียงล่าสุดก่อน (ใช้กับยอดขาย)
function groupDealsByPeriod(items, mode, dateField, ascending = false) {
  const groups = {}
  items.forEach(d => {
    const raw = d[dateField]
    let key, label
    if (!raw) { key = 'zzz-ไม่ระบุ'; label = 'ไม่ระบุวันที่' }
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
  const keys = Object.keys(groups).sort()
  if (!ascending) keys.reverse()
  return keys.map(k => ({ key: k, ...groups[k] }))
}

function todayStr() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

// ป็อปอัปแสดงรายละเอียดดีลตามช่วง (วัน/สัปดาห์/เดือน) ของฟิลด์วันที่ที่เลือก — แต่ละกลุ่มลิสต์ดีลที่อยู่ในนั้น
// highlightOverdue = ไฮไลต์วันที่เป็นสีแดงถ้าเลยกำหนดแล้ว (ใช้กับยอดที่ต้องติดตาม)
function DealPeriodModal({ title, deals, companies, mode, dateField, ascending = false, highlightOverdue = false, onClose }) {
  const groups = groupDealsByPeriod(deals, mode, dateField, ascending)
  const grandTotal = deals.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const modeLabel = (SALES_MODES.find(m => m.key === mode) || {}).label || ''
  const today = todayStr()
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div className="modal-title">{title} · {modeLabel} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({deals.length} ดีล · {fmtCurrency(grandTotal)})</span></div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {groups.length ? groups.map(g => {
            const total = g.rows.reduce((s, d) => s + (Number(d.value) || 0), 0)
            return (
              <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: 'var(--gray-bg)', fontWeight: 700, fontSize: 14 }}>
                  <span>{g.label}</span>
                  <span style={{ color: 'var(--navy)' }}>{g.rows.length} ดีล · {fmtCurrency(total)}</span>
                </div>
                <table>
                  <tbody>
                    {g.rows.map((d, i) => {
                      const co = companies.find(c => c.id === d.company_id)
                      const ov = highlightOverdue && d[dateField] && d[dateField] < today
                      return (
                        <tr key={d.id} style={{ borderTop: i === 0 ? 'none' : undefined }}>
                          <td style={{ fontWeight: 500, padding: '12px 18px' }}>{d.name}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-light)', padding: '12px 14px' }}>{co ? co.name : '-'}</td>
                          <td className={ov ? 'overdue' : ''} style={{ fontSize: 12, padding: '12px 14px', whiteSpace: 'nowrap' }}>{fmtDate(d[dateField])}</td>
                          <td style={{ fontWeight: 600, color: 'var(--navy)', padding: '12px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtCurrency(d.value)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          }) : <div className="empty-state"><div>ไม่มีข้อมูล</div></div>}
        </div>
      </div>
    </div>
  )
}

export default function Deals({ perm, deals, companies, onAdd, onAddStage, onEdit, onCreateQuotation }) {
  const { list } = usePicklists()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [salesMode, setSalesMode] = useState(null) // null = ปิด, 'day'/'week'/'month' = เปิด popup ของช่วงนั้น
  const [followMode, setFollowMode] = useState(null)

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
  // ดีลที่ยังไม่ปิดและมีวันที่ต้องติดตาม (follow_up_date) — ยอดรวมที่ต้องตามต่อ
  const followUp = deals.filter(d => !OPEN_STAGES_EXCLUDED.includes(d.stage) && d.follow_up_date)
  const followTotal = followUp.reduce((s, d) => s + (Number(d.value) || 0), 0)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">ดีลการขาย <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({filtered.length} ดีล · {fmtCurrency(totalVal)})</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ เพิ่มดีล</button>
      </div>
      {/* กล่องสรุป 2 ใบ (ยอดขายปิดสำเร็จ + ยอดที่ต้องติดตาม) ชิดซ้าย + ตัวกรองวันที่ชิดขวา — กดปุ่มช่วงเวลาเพื่อเปิด popup รายละเอียด */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <div className="kpi-card green" style={{ flex: '1 1 380px', padding: '16px 20px' }}>
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
          <div className="kpi-card navy" style={{ flex: '1 1 380px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
              <div className="kpi-label">ยอดที่ต้องติดตาม</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {SALES_MODES.map(m => (
                  <button key={m.key} type="button" className={`btn btn-xs ${followMode === m.key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFollowMode(m.key)} title={`ดูยอดที่ต้องติดตาม${m.label}`}>{m.label}</button>
                ))}
              </div>
            </div>
            <div className="kpi-value">{fmtCurrency(followTotal)}</div>
          </div>
        </div>
        <div className="filter-bar" style={{ margin: 0, flexShrink: 0 }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่สร้างดีล ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)', alignSelf: 'center' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่สร้างดีล ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
        </div>
      </div>
      {salesMode && <DealPeriodModal title="ยอดขายที่ปิดดีลสำเร็จ" deals={won} companies={companies} mode={salesMode} dateField="close_date" onClose={() => setSalesMode(null)} />}
      {followMode && <DealPeriodModal title="ยอดที่ต้องติดตาม" deals={followUp} companies={companies} mode={followMode} dateField="follow_up_date" ascending highlightOverdue onClose={() => setFollowMode(null)} />}
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
