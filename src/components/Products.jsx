import { useEffect, useState } from 'react'
import { listProducts, addProduct, updateProduct, deleteProduct } from '../lib/api'
import { useUi } from './UiContext'
import ImportProductsModal from './ImportProductsModal'

function ProductModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(() => initial || { code: '', name: '' })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{initial?.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label required">รหัสสินค้า</label>
            <input className="form-control" value={f.code} onChange={set('code')} placeholder="เช่น SKU-001" autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label required">ชื่อสินค้า</label>
            <input className="form-control" value={f.name} onChange={set('name')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={() => onSave(f)}>บันทึก</button>
        </div>
      </div>
    </div>
  )
}

export default function Products() {
  const { toast, confirm } = useUi()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { initial }
  const [showImport, setShowImport] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setRows(await listProducts()) }
    catch (e) { toast('โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const onSave = async (f) => {
    if (!f.code?.trim() || !f.name?.trim()) { toast('กรุณากรอกรหัสและชื่อสินค้า', 'error'); return }
    setModal(null)
    try {
      if (f.id) await updateProduct(f.id, f)
      else await addProduct(f)
      toast(f.id ? 'อัปเดตสำเร็จ' : 'เพิ่มสินค้าสำเร็จ', 'success')
      await load()
    } catch (e) { toast('เกิดข้อผิดพลาด: ' + e.message, 'error') }
  }

  const onDelete = async (p) => {
    if (!(await confirm(`ลบสินค้า "${p.code} - ${p.name}"? รายการดีลที่เคยใช้สินค้านี้จะยังอยู่แต่ไม่ผูกกับสินค้านี้อีก`))) return
    try {
      await deleteProduct(p.id)
      toast('ลบสำเร็จ', 'success')
      await load()
    } catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error') }
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">สินค้า <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} รายการ)</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowImport(true)}>นำเข้าจากไฟล์</button>
          <button className="btn btn-primary" onClick={() => setModal({ initial: null })}>เพิ่มสินค้า</button>
        </div>
      </div>
      {modal && <ProductModal initial={modal.initial} onClose={() => setModal(null)} onSave={onSave} />}
      {showImport && <ImportProductsModal existingProducts={rows} onClose={() => setShowImport(false)} onImported={load} />}
      <div className="card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>รหัสสินค้า</th><th>ชื่อสินค้า</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{p.code}</td>
                    <td>{p.name}</td>
                    <td className="td-actions">
                      <button className="btn btn-outline btn-xs" onClick={() => setModal({ initial: p })}>แก้ไข</button>
                      <button className="btn btn-danger btn-xs" onClick={() => onDelete(p)}>ลบ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีสินค้า'}</div></div>}
        </div>
      </div>
    </div>
  )
}
