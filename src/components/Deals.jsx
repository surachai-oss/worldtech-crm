import { fmtCurrency, fmtDate, stageColor } from '../lib/format'
import { canEdit } from '../lib/permissions'
import { usePicklists } from './PicklistsContext'
import EditableSelect from './EditableSelect'

export default function Deals({ perm, deals, companies, onAdd, onAddStage, onEdit, onMoveStage }) {
  const { list } = usePicklists()
  const totalVal = deals.reduce((s, d) => s + (Number(d.value) || 0), 0)

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🤝 ดีลการขาย <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({deals.length} ดีล · {fmtCurrency(totalVal)})</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ เพิ่มดีล</button>
      </div>
      <div className="kanban-board">
        {list('deal_stages').map(stage => {
          const sd = deals.filter(d => d.stage === stage)
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
                          <button className="btn btn-outline btn-xs" onClick={() => onEdit(d)}>✏️ แก้ไข</button>
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
