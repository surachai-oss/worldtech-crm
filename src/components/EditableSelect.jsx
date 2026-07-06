import { useState } from 'react'
import { usePicklists } from './PicklistsContext'
import { addPicklistValue, deletePicklistValue } from '../lib/api'
import { useUi } from './UiContext'

// select ที่ผูกกับ picklists — ถ้า editable=true และ isAdmin=true จะมีปุ่ม "แก้ไข" ให้เพิ่ม/ลบตัวเลือกได้ทันที
// (แบบเดียวกับ dropdown list ที่แก้ไขได้ใน Google Sheets) โดยไม่ต้องไปหน้าตั้งค่าแยก
// จำกัดเฉพาะ admin เพราะตัวเลือกบางตัวผูกกับ logic คำนวณสรุปในระบบ (ดู README) — บังคับจริงที่ RLS policy "picklists write"
export default function EditableSelect({ listKey, value, onChange, placeholder = '-- เลือก --', editable = true, isAdmin = false, style }) {
  const { picklists, list, reload } = usePicklists()
  const { toast, confirm } = useUi()
  const [open, setOpen] = useState(false)
  const [newVal, setNewVal] = useState('')
  const [busy, setBusy] = useState(false)

  const canEditOptions = editable && isAdmin
  const options = list(listKey)
  const rows = picklists[listKey] || []

  const onAdd = async () => {
    const v = newVal.trim()
    if (!v) return
    setBusy(true)
    try {
      await addPicklistValue(listKey, v)
      setNewVal('')
      await reload()
    } catch (e) {
      toast('เพิ่มไม่สำเร็จ: ' + e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (row) => {
    if (!(await confirm(`ลบ "${row.value}" ออกจากตัวเลือก?`))) return
    try {
      await deletePicklistValue(row.id)
      if (value === row.value) onChange('')
      await reload()
    } catch (e) {
      toast('ลบไม่สำเร็จ: ' + e.message, 'error')
    }
  }

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 6, alignItems: 'center', ...style }}>
      <select className="form-control" style={{ flex: 1 }} value={value || ''} onChange={e => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
      {canEditOptions && (
        <button type="button" className="btn btn-outline btn-xs" onClick={() => setOpen(o => !o)} title="แก้ไขตัวเลือก">แก้ไข</button>
      )}
      {canEditOptions && open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div className="card" style={{ position: 'absolute', top: '100%', right: 0, zIndex: 50, width: 240, marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,.18)' }}>
            <div style={{ maxHeight: 180, overflow: 'auto', padding: 6 }}>
              {rows.length ? rows.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', fontSize: 13 }}>
                  <span>{r.value}</span>
                  <button type="button" className="btn btn-danger btn-xs" onClick={() => onDelete(r)}>ลบ</button>
                </div>
              )) : <div style={{ fontSize: 12, color: 'var(--text-light)', padding: 6 }}>ยังไม่มีตัวเลือก</div>}
            </div>
            <div style={{ display: 'flex', gap: 4, padding: 6, borderTop: '1px solid var(--border)' }}>
              <input className="form-control" style={{ fontSize: 12, padding: '4px 6px' }} placeholder="เพิ่มตัวเลือกใหม่" value={newVal}
                onChange={e => setNewVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAdd()} disabled={busy} />
              <button type="button" className="btn btn-primary btn-xs" onClick={onAdd} disabled={busy || !newVal.trim()}>+</button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
