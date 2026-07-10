import { useEffect, useState } from 'react'
import { CONSTANTS, listProfiles, updateProfileRole, adminCreateUser } from '../lib/api'
import { fmtDate } from '../lib/format'
import { useUi } from './UiContext'

const ROLE_LABEL = { admin: 'ผู้ดูแลระบบ', sale: 'พนักงานขาย', finance: 'ฝ่ายบัญชี' }

function genPassword() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6).toUpperCase()
}

function AddUserModal({ onClose, onCreated }) {
  const { toast } = useUi()
  const [f, setF] = useState({ email: '', full_name: '', password: genPassword() })
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const submit = async () => {
    if (!f.email.trim()) { toast('กรุณากรอกอีเมล', 'error'); return }
    if (f.password.length < 6) { toast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error'); return }
    setSaving(true)
    try {
      await onCreated(f)
      onClose()
    } catch (e) {
      toast('เพิ่มผู้ใช้งานไม่สำเร็จ: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">เพิ่มผู้ใช้งานใหม่</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label required">อีเมล</label>
            <input className="form-control" type="email" value={f.email} onChange={set('email')} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">ชื่อ-นามสกุล</label>
            <input className="form-control" value={f.full_name} onChange={set('full_name')} />
          </div>
          <div className="form-group">
            <label className="form-label required">รหัสผ่านเริ่มต้น</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-control" value={f.password} onChange={set('password')} />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setF(s => ({ ...s, password: genPassword() }))}>สุ่มใหม่</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>คัดลอกรหัสผ่านนี้ไปแจ้งพนักงานเอง — ระบบยังไม่มีอีเมลแจ้งอัตโนมัติ</div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'กำลังบันทึก...' : 'สร้างผู้ใช้งาน'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Users({ currentUserId, accessToken }) {
  const { toast, confirm } = useUi()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setRows(await listProfiles()) }
    catch (e) { toast('โหลดรายชื่อผู้ใช้งานไม่สำเร็จ: ' + e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const onCreateUser = async (f) => {
    await adminCreateUser(f, accessToken)
    toast('เพิ่มผู้ใช้งานสำเร็จ', 'success')
    await load()
  }

  const onChangeRole = async (u, role) => {
    if (u.id === currentUserId && role !== 'admin') {
      if (!(await confirm('คุณกำลังจะถอดสิทธิ์ Admin ของตัวเอง จะไม่สามารถจัดการผู้ใช้งานได้อีก ยืนยันหรือไม่?'))) return
    }
    try {
      await updateProfileRole(u.id, role)
      toast('อัปเดตสิทธิ์สำเร็จ', 'success')
      await load()
    } catch (e) { toast('อัปเดตสิทธิ์ไม่สำเร็จ: ' + e.message, 'error') }
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">ผู้ใช้งานระบบ <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} คน)</span></div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ เพิ่มผู้ใช้งาน</button>
      </div>
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={onCreateUser} />}
      <div className="card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th>เข้าร่วมเมื่อ</th></tr></thead>
              <tbody>
                {rows.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.full_name}{u.id === currentUserId && <span style={{ color: 'var(--text-light)', fontWeight: 400 }}> (คุณ)</span>}</td>
                    <td style={{ fontSize: 12 }}>{u.email}</td>
                    <td>
                      <select className="filter-select" value={u.role} onChange={e => onChangeRole(u, e.target.value)}>
                        {CONSTANTS.ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
                      </select>
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีผู้ใช้งาน'}</div></div>}
        </div>
      </div>
    </div>
  )
}
