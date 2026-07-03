import { useMemo, useState } from 'react'
import { CONSTANTS } from '../lib/api'
import { fmtCurrency, fmtDate, quotBadgeClass } from '../lib/format'
import { printQuotation } from '../lib/printQuotation'

export default function Quotations({ quotations, companies, settings, onAdd, onStatusChange, onDelete }) {
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const total = quotations.reduce((s, x) => s + (Number(x.value) || 0), 0)

  const list = useMemo(() => {
    let l = quotations
    if (status) l = l.filter(x => x.status === status)
    if (q) l = l.filter(x => (x.subject || '').toLowerCase().includes(q.toLowerCase()) || (x.quot_no || '').includes(q))
    return [...l].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [quotations, status, q])

  const doPrint = (quot) => {
    const co = companies.find(c => c.id === quot.company_id)
    printQuotation(quot, co, settings)
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📋 ใบเสนอราคา <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({quotations.length} รายการ · {fmtCurrency(total)})</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ สร้างใบเสนอราคา</button>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {CONSTANTS.QUOT_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="filter-input" placeholder="🔍 ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="card">
        <div className="table-wrap">
          {list.length ? (
            <table>
              <thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>บริษัท</th><th>มูลค่า</th><th>สถานะ</th><th>วันที่</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {list.map(qt => {
                  const co = companies.find(c => c.id === qt.company_id)
                  return (
                    <tr key={qt.id}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{qt.quot_no}</td>
                      <td style={{ fontWeight: 500 }}>{qt.subject}</td>
                      <td>{co ? co.name : '-'}</td>
                      <td style={{ fontWeight: 600 }}>{fmtCurrency(qt.value)}</td>
                      <td><span className={`badge ${quotBadgeClass(qt.status)}`}>{qt.status}</span></td>
                      <td style={{ fontSize: 12 }}>{fmtDate(qt.quot_date)}</td>
                      <td className="td-actions" onClick={e => e.stopPropagation()}>
                        <select className="filter-select" style={{ fontSize: 11, padding: '3px 6px' }}
                          value={qt.status} onChange={e => onStatusChange(qt.id, e.target.value)}>
                          {CONSTANTS.QUOT_STATUSES.map(s => <option key={s}>{s}</option>)}
                        </select>
                        <button className="btn btn-secondary btn-xs" onClick={() => doPrint(qt)}>📄 PDF</button>
                        <button className="btn btn-danger btn-xs" onClick={() => onDelete(qt.id)}>🗑</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div className="empty-icon">📋</div><div>ยังไม่มีใบเสนอราคา</div></div>}
        </div>
      </div>
    </div>
  )
}
