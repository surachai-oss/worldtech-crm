import { useMemo, useState } from 'react'
import { CONSTANTS } from '../lib/api'
import { statusBadgeClass } from '../lib/format'

export default function Companies({ companies, onOpen, onEdit, onDelete }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [industry, setIndustry] = useState('')

  const list = useMemo(() => companies.filter(c => {
    if (q && !(c.name || '').toLowerCase().includes(q.toLowerCase()) && !(c.phone || '').includes(q)) return false
    if (status && c.status !== status) return false
    if (industry && c.industry !== industry) return false
    return true
  }), [companies, q, status, industry])

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🏢 บริษัทลูกค้า <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({companies.length} รายการ)</span></div>
        <button className="btn btn-primary" onClick={() => onEdit(null)}>+ เพิ่มบริษัท</button>
      </div>
      <div className="filter-bar">
        <input className="filter-input" placeholder="🔍 ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {CONSTANTS.COMPANY_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={industry} onChange={e => setIndustry(e.target.value)}>
          <option value="">ทุกอุตสาหกรรม</option>
          {CONSTANTS.INDUSTRIES.map(i => <option key={i}>{i}</option>)}
        </select>
      </div>
      <div className="card">
        <div className="table-wrap">
          {list.length ? (
            <table>
              <thead><tr><th>ชื่อบริษัท</th><th>อุตสาหกรรม</th><th>โทรศัพท์</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id} onClick={() => onOpen(c.id)}>
                    <td><div style={{ fontWeight: 600, color: 'var(--navy)' }}>{c.name}</div><div style={{ fontSize: 11, color: 'var(--text-light)' }}>{c.email}</div></td>
                    <td style={{ fontSize: 12 }}>{c.industry || '-'}</td>
                    <td style={{ fontSize: 12 }}>{c.phone || '-'}</td>
                    <td><span className={`badge ${statusBadgeClass(c.status)}`}>{c.status}</span></td>
                    <td style={{ fontSize: 12 }}>{c.owner || '-'}</td>
                    <td className="td-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-outline btn-xs" onClick={() => onOpen(c.id)}>👁 ดู</button>
                      <button className="btn btn-outline btn-xs" onClick={() => onEdit(c)}>✏️</button>
                      <button className="btn btn-danger btn-xs" onClick={() => onDelete(c.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div className="empty-icon">🏢</div><div>ยังไม่มีข้อมูลบริษัท</div></div>}
        </div>
      </div>
    </div>
  )
}
