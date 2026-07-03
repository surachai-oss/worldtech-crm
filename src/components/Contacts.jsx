import { useMemo, useState } from 'react'

export default function Contacts({ contacts, companies, onNavCompany, onEdit, onDelete }) {
  const [q, setQ] = useState('')
  const list = useMemo(() => contacts.filter(c =>
    !q || (c.full_name || '').toLowerCase().includes(q.toLowerCase()) || (c.phone || '').includes(q)
  ), [contacts, q])

  return (
    <div>
      <div className="section-header">
        <div className="section-title">👥 ผู้ติดต่อทั้งหมด <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({contacts.length} รายการ)</span></div>
        <button className="btn btn-primary" onClick={() => onEdit(null)}>+ เพิ่มผู้ติดต่อ</button>
      </div>
      <div className="filter-bar">
        <input className="filter-input" placeholder="🔍 ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="card">
        <div className="table-wrap">
          {list.length ? (
            <table>
              <thead><tr><th>ชื่อ-นามสกุล</th><th>บริษัท</th><th>ตำแหน่ง</th><th>โทรศัพท์</th><th>อีเมล</th><th>Line</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {list.map(c => {
                  const co = companies.find(x => x.id === c.company_id)
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.full_name}</td>
                      <td><a onClick={() => onNavCompany(c.company_id)}>{co ? co.name : '-'}</a></td>
                      <td style={{ fontSize: 12 }}>{c.position || '-'}</td>
                      <td style={{ fontSize: 12 }}>{c.phone || '-'}</td>
                      <td style={{ fontSize: 12 }}>{c.email || '-'}</td>
                      <td style={{ fontSize: 12 }}>{c.line_id || '-'}</td>
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-outline btn-xs" onClick={() => onEdit(c)}>✏️</button>
                        <button className="btn btn-danger btn-xs" onClick={() => onDelete(c.id)}>🗑</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div className="empty-icon">👥</div><div>ยังไม่มีผู้ติดต่อ</div></div>}
        </div>
      </div>
    </div>
  )
}
