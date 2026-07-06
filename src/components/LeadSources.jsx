import { useEffect, useState } from 'react'
import { listLeadSources, addLeadSource, deleteLeadSource } from '../lib/api'
import { useUi } from './UiContext'

export default function LeadSources() {
  const { toast, confirm } = useUi()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setRows(await listLeadSources()) }
    catch (e) { toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const onAdd = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await addLeadSource(name.trim())
      setName('')
      await load()
    } catch (e) {
      toast('เพิ่มไม่สำเร็จ: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (s) => {
    if (!(await confirm(`ลบ "${s.name}" ออกจากรายการที่มาลูกค้า?`))) return
    try {
      await deleteLeadSource(s.id)
      toast('ลบสำเร็จ', 'success')
      await load()
    } catch (e) {
      toast('ลบไม่สำเร็จ: ' + e.message, 'error')
    }
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🏷️ ที่มาลูกค้า <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} รายการ)</span></div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 12 }}>
        รายการนี้จะไปแสดงเป็น dropdown "ที่มา" ในฟอร์มเพิ่ม/แก้ไขบริษัทลูกค้า
      </div>
      <div className="filter-bar">
        <input className="filter-input" placeholder="ชื่อที่มาใหม่ เช่น TikTok, Google Ads" value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAdd()} />
        <button className="btn btn-primary btn-sm" onClick={onAdd} disabled={saving || !name.trim()}>+ เพิ่ม</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>ชื่อที่มา</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="td-actions"><button className="btn btn-danger btn-xs" onClick={() => onDelete(s)}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div className="empty-icon">🏷️</div><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีรายการที่มาลูกค้า'}</div></div>}
        </div>
      </div>
    </div>
  )
}
