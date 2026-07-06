import { useState } from 'react'
import { fmtCurrency, fmtDate, stageColor } from '../lib/format'
import { canEdit } from '../lib/permissions'
import { usePicklists } from './PicklistsContext'
import EditableSelect from './EditableSelect'

export default function Deals({ perm, deals, companies, onAdd, onAddStage, onEdit, onMoveStage }) {
  const { list } = usePicklists()
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  // กรองตามวันที่คาดว่าปิดดีล (close_date) — ดีลที่ยังไม่ระบุวันที่จะถูกซ่อนเมื่อตั้งช่วงเวลาไว้
  const filtered = deals.filter(d => {
    if (fromDate && (!d.close_date || d.close_date < fromDate)) return false
    if (toDate && (!d.close_date || d.close_date > toDate)) return false
    return true
  })
  const totalVal = filtered.reduce((s, d) => s + (Number(d.value) || 0), 0)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">ดีลการขาย <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({filtered.length} ดีล · {fmtCurrency(totalVal)})</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่คาดว่าปิดดีล ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่คาดว่าปิดดีล ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
          <button className="btn btn-primary" onClick={onAdd}>+ เพิ่มดีล</button>
        </div>
      </div>
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
                    <div className="kanban-card" key={d.id}>
                      <div className="deal-name">{d.name}</div>
                      <div className="deal-co">{co ? co.name : '-'}</div>
                      <div className="deal-val">{fmtCurrency(d.value)}</div>
                      {d.close_date && <div className="deal-date">{fmtDate(d.close_date)}</div>}
                      <div className="deal-owner">{d.owner || ''}</div>
                      {canEdit(d, perm) && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="btn btn-outline btn-xs" onClick={() => onEdit(d)}>แก้ไข</button>
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
