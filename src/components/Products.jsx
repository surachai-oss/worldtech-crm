import { useEffect, useState } from 'react'
import { listProducts, addProduct, updateProduct, deleteProduct, uploadProductImage, deleteProductImage, getProductImageUrl } from '../lib/api'
import { exportProductsToExcel } from '../lib/importExport'
import { adminOnlyDelete } from '../lib/permissions'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import ImportProductsModal from './ImportProductsModal'

function ProductModal({ initial, onClose, onSave }) {
  const { t, lang } = useLanguage()
  const [f, setF] = useState(() => initial || { code: '', name: '' })
  const [imageFile, setImageFile] = useState(null)
  const [removeImage, setRemoveImage] = useState(false)
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const currentUrl = !removeImage && initial?.image_path ? getProductImageUrl(initial.image_path) : null
  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : currentUrl

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{initial?.id ? t('แก้ไขสินค้า') : t('เพิ่มสินค้า')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label required">{t('รหัสสินค้า')}</label>
            <input className="form-control" value={f.code} onChange={set('code')} placeholder={lang === 'en' ? 'e.g. SKU-001' : 'เช่น SKU-001'} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label required">{t('ชื่อสินค้า')}</label>
            <input className="form-control" value={f.name} onChange={set('name')} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('รูปสินค้า')}</label>
            {previewUrl && <img src={previewUrl} alt="" style={{ maxWidth: 140, maxHeight: 140, display: 'block', marginBottom: 8, borderRadius: 6, border: '1px solid var(--border)' }} />}
            <input className="form-control" type="file" accept="image/*" onChange={e => { setImageFile(e.target.files?.[0] || null); setRemoveImage(false) }} />
            {previewUrl && (
              <button type="button" className="btn btn-outline btn-xs" style={{ marginTop: 6 }}
                onClick={() => { setImageFile(null); setRemoveImage(true) }}>{t('ลบรูป')}</button>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('ยกเลิก')}</button>
          <button className="btn btn-primary" onClick={() => onSave(f, imageFile, removeImage)}>{t('บันทึก')}</button>
        </div>
      </div>
    </div>
  )
}

export default function Products({ perm }) {
  const { toast, confirm } = useUi()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // { initial }
  const [showImport, setShowImport] = useState(false)
  const [exporting, setExporting] = useState(false)

  const doExport = async () => {
    setExporting(true)
    try { await exportProductsToExcel(rows) }
    catch (e) { toast('ส่งออกไม่สำเร็จ: ' + e.message, 'error') }
    finally { setExporting(false) }
  }

  const load = async () => {
    setLoading(true)
    try { setRows(await listProducts()) }
    catch (e) { toast('โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const onSave = async (f, imageFile, removeImage) => {
    if (!f.code?.trim() || !f.name?.trim()) { toast('กรุณากรอกรหัสและชื่อสินค้า', 'error'); return }
    setModal(null)
    try {
      const product = f.id ? await updateProduct(f.id, { code: f.code, name: f.name }) : await addProduct({ code: f.code, name: f.name })
      if (imageFile) await uploadProductImage(product.id, imageFile)
      else if (removeImage && f.image_path) await deleteProductImage(product.id, f.image_path)
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
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">{t('สินค้า')} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} {t('รายการ')})</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowImport(true)}>{t('นำเข้าจากไฟล์')}</button>
          <button className="btn btn-outline" onClick={doExport} disabled={exporting}>{exporting ? t('กำลังส่งออก...') : t('ส่งออกเป็น Excel')}</button>
          <button className="btn btn-primary" onClick={() => setModal({ initial: null })}>{t('เพิ่มสินค้า')}</button>
        </div>
      </div>
      {modal && <ProductModal initial={modal.initial} onClose={() => setModal(null)} onSave={onSave} />}
      {showImport && <ImportProductsModal existingProducts={rows} onClose={() => setShowImport(false)} onImported={load} />}
      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th></th><th>{t('รหัสสินค้า')}</th><th>{t('ชื่อสินค้า')}</th><th>{t('การจัดการ')}</th></tr></thead>
              <tbody>
                {rows.map(p => {
                  const imgUrl = getProductImageUrl(p.image_path)
                  return (
                    <tr key={p.id}>
                      <td style={{ width: 44 }}>
                        {imgUrl && <img src={imgUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{p.code}</td>
                      <td>{p.name}</td>
                      <td className="td-actions">
                        <button className="btn btn-outline btn-xs" onClick={() => setModal({ initial: p })}>{t('แก้ไข')}</button>
                        {adminOnlyDelete(perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(p)}>{t('ลบ')}</button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? t('กำลังโหลด...') : t('ยังไม่มีสินค้า')}</div></div>}
        </div>
      </div>
    </div>
  )
}
