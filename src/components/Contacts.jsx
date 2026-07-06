import { useEffect, useState } from 'react'
import { PAGE_SIZE, fetchContactsPage } from '../lib/api'
import { canManageChild } from '../lib/permissions'
import { useUi } from './UiContext'
import Pagination from './Pagination'
import ImportContactsModal from './ImportContactsModal'

export default function Contacts({ perm, reloadKey, onNavCompany, onEdit, onDelete }) {
  const { toast } = useUi()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [localBump, setLocalBump] = useState(0)

  useEffect(() => { setPage(0) }, [q])

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await fetchContactsPage({ page, q })
        if (!alive) return
        setRows(r.rows); setCount(r.count)
      } catch (e) {
        if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error')
      } finally {
        if (alive) setLoading(false)
      }
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [page, q, reloadKey, localBump])

  return (
    <div>
      <div className="section-header">
        <div className="section-title">ผู้ติดต่อทั้งหมด <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({count} รายการ)</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowImport(true)}>นำเข้าจากไฟล์</button>
          <button className="btn btn-primary" onClick={() => onEdit(null)}>+ เพิ่มผู้ติดต่อ</button>
        </div>
      </div>
      {showImport && <ImportContactsModal onClose={() => setShowImport(false)} onImported={() => setLocalBump(b => b + 1)} />}
      <div className="filter-bar">
        <input className="filter-input" placeholder="ค้นหา..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>ชื่อ-นามสกุล</th><th>บริษัท</th><th>ตำแหน่ง</th><th>โทรศัพท์</th><th>อีเมล</th><th>Line</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.full_name}</td>
                    <td><a onClick={() => onNavCompany(c.company_id)}>{c.company ? c.company.name : '-'}</a></td>
                    <td style={{ fontSize: 12 }}>{c.position || '-'}</td>
                    <td style={{ fontSize: 12 }}>{c.phone || '-'}</td>
                    <td style={{ fontSize: 12 }}>{c.email || '-'}</td>
                    <td style={{ fontSize: 12 }}>{c.line_id || '-'}</td>
                    <td className="td-actions" onClick={e => e.stopPropagation()}>
                      {canManageChild(c.company, perm) && <button className="btn btn-outline btn-xs" onClick={() => onEdit(c)}>แก้ไข</button>}
                      {canManageChild(c.company, perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(c.id)}>ลบ</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีผู้ติดต่อ'}</div></div>}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} count={count} onPage={setPage} />
      </div>
    </div>
  )
}
