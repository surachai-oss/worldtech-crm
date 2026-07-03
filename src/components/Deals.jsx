import { CONSTANTS } from '../lib/api'
import { fmtCurrency, fmtDate, stageColors } from '../lib/format'

export default function Deals({ deals, companies, onAdd, onAddStage, onEdit, onMoveStage }) {
  const totalVal = deals.reduce((s, d) => s + (Number(d.value) || 0), 0)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🤝 ดีลการขาย <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({deals.length} ดีล · {fmtCurrency(totalVal)})</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ เพิ่มดีล</button>
      </div>
      <div className="kanban-board">
        {CONSTANTS.DEAL_STAGES.map(stage => {
          const sd = deals.filter(d => d.stage === stage)
          const sv = sd.reduce((s, d) => s + (Number(d.value) || 0), 0)
          const color = stageColors[stage]
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
                      <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-outline btn-xs" onClick={() => onEdit(d)}>✏️</button>
                        <select className="filter-select" style={{ fontSize: 10, padding: '2px 4px', maxWidth: 120 }}
                          value={d.stage} onChange={e => onMoveStage(d.id, e.target.value)}>
                          {CONSTANTS.DEAL_STAGES.map(s => <option key={s}>{s}</option>)}
                        </select>
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
