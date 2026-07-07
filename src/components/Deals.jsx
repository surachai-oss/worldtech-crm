import { useState } from 'react'
import { fmtCurrency, fmtDate, stageColor, toLocalDateStr } from '../lib/format'
import { canEdit } from '../lib/permissions'
import { usePicklists } from './PicklistsContext'
import EditableSelect from './EditableSelect'

const OPEN_STAGES_EXCLUDED = ['Closed Won', 'Closed Lost']

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

export default function Deals({ perm, deals, companies, quotations, onAdd, onAddStage, onEdit, onMoveStage, onCreateQuotation }) {
  const { list } = usePicklists()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // กรองตามวันที่สร้างดีล (created_at) — เทียบเป็นวันที่ตามเวลาเครื่อง ไม่ใช่ UTC เพราะ created_at เก็บเป็น timestamptz
  const filtered = deals.filter(d => {
    const created = toLocalDateStr(d.created_at)
    if (fromDate && created < fromDate) return false
    if (toDate && created > toDate) return false
    return true
  })
  const totalVal = filtered.reduce((s, d) => s + (Number(d.value) || 0), 0)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">ดีลการขาย <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({filtered.length} ดีล · {fmtCurrency(totalVal)})</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่สร้างดีล ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่สร้างดีล ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
          <button className="btn btn-primary" onClick={onAdd}>+ เพิ่มดีล</button>
        </div>
      </div>
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
                  const qCount = quotations.filter(q => q.deal_id === d.id).length
                  return (
                    <div className="kanban-card" key={d.id}>
                      <div className="deal-name">{d.name}</div>
                      <div className="deal-co">{co ? co.name : '-'}</div>
                      <div className="deal-val">{fmtCurrency(d.value)}</div>
                      {d.close_date && <div className="deal-date">{fmtDate(d.close_date)}</div>}
                      <div className="deal-owner">{d.owner || ''}</div>
                      {qCount > 0 && <div style={{ fontSize: 10, color: 'var(--text-light)' }}>ออกใบเสนอราคาแล้ว {qCount} ใบ</div>}
                      {canEdit(d, perm) && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="btn btn-outline btn-xs" onClick={() => onEdit(d)}>แก้ไข</button>
                          <button className="btn btn-secondary btn-xs" onClick={() => onCreateQuotation(d)}>ออกใบเสนอราคา</button>
                          <EditableSelect listKey="deal_stages" value={d.stage} onChange={v => onMoveStage(d.id, v)} isAdmin={perm.isAdmin} style={{ width: 140 }} />
                        </div>
                      )}
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
