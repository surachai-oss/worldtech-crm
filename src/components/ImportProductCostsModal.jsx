import { useState } from 'react'
import { bulkUpsertProductCosts } from '../lib/api'
import { downloadProductCostTemplate, parseProductCostImportFile, PRODUCT_COST_IMPORT_COLUMNS } from '../lib/importExport'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// products: รายการสินค้าทั้งหมดในระบบ (จาก fetchProductCosts) ใช้จับคู่รหัสสินค้าในไฟล์กับสินค้าจริง
export default function ImportProductCostsModal({ products, currentUserName, onClose, onImported }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [parsed, setParsed] = useState(null) // { validRows, invalidRows }
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileName(file.name)
    try {
      const byCode = new Map(products.map(p => [p.code.trim().toLowerCase(), p]))
      setParsed(await parseProductCostImportFile(file, byCode))
    } catch (err) {
      toast(lang === 'en' ? 'Failed to read file: ' + err.message : 'อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'error')
    }
  }

  const confirmImport = async () => {
    if (!parsed?.validRows.length) return
    setImporting(true)
    try {
      const n = await bulkUpsertProductCosts(parsed.validRows, currentUserName)
      toast(lang === 'en' ? `Imported ${n} record(s) successfully` : `นำเข้าต้นทุนสำเร็จ ${n} รายการ`, 'success')
      onImported()
      onClose()
    } catch (err) {
      toast(lang === 'en' ? 'Import failed: ' + err.message : 'นำเข้าไม่สำเร็จ: ' + err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div className="modal-title">{t('นำเข้าต้นทุนจากไฟล์')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {!parsed ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                {t('1) ดาวน์โหลด Template (มีรหัสและชื่อสินค้าทุกตัวมาให้แล้ว)  2) กรอกตัวเลขใน Excel  3) อัปโหลดไฟล์ .xlsx กลับมาที่นี่')}
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={() => downloadProductCostTemplate(products)}>
                {t('ดาวน์โหลด Template (.xlsx)')}
              </button>
              <div className="form-group">
                <label className="form-label">{t('อัปโหลดไฟล์ (.xlsx)')}</label>
                <input className="form-control" type="file" accept=".xlsx" onChange={onFileChange} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', lineHeight: 1.6 }}>
                <div>{t('คอลัมน์ที่รองรับ')}: {PRODUCT_COST_IMPORT_COLUMNS.map(c => c.label).join(', ')}</div>
                <div style={{ marginTop: 6 }}>{t('แถวไหนไม่ได้กรอกอะไรเลยจะถูกข้าม กรอกเฉพาะสินค้าที่ต้องการได้')}</div>
                <div>{t('แถวที่กรอกต้องมีต้นทุน/ชิ้น เสมอ — ค่าเดิมของสินค้านั้นจะถูกเขียนทับด้วยค่าในไฟล์')}</div>
                <div>{t('Shipping Buffer / Provision Buffer / ค่าขนส่งมาตรฐาน ไม่มีในไฟล์ — ใช้ค่ากลาง ตั้งรายตัวได้ที่ปุ่มแก้ไข')}</div>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{t('ไฟล์:')} <b>{fileName}</b></div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{lang === 'en' ? `Valid: ${parsed.validRows.length} record(s)` : `ถูกต้อง ${parsed.validRows.length} รายการ`}</span>
                {parsed.invalidRows.length > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{lang === 'en' ? `Errors: ${parsed.invalidRows.length} record(s)` : `ผิดพลาด ${parsed.invalidRows.length} รายการ`}</span>}
                {parsed.skipped > 0 && <span style={{ color: 'var(--text-light)' }}>{lang === 'en' ? `Skipped (blank): ${parsed.skipped}` : `ข้าม (ไม่ได้กรอก) ${parsed.skipped} รายการ`}</span>}
              </div>
              {parsed.invalidRows.length > 0 && (
                <div className="card" style={{ marginBottom: 12, maxHeight: 160, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t('แถวที่')}</th><th>{t('รหัสสินค้า')}</th><th>{t('ปัญหา')}</th></tr></thead>
                      <tbody>
                        {parsed.invalidRows.map((r, i) => (
                          <tr key={i}>
                            <td>{r.row}</td>
                            <td>{r.data?.code || '-'}</td>
                            <td style={{ color: 'var(--danger)', fontSize: 12 }}>{r.errors.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {parsed.validRows.length > 0 && (
                <div className="card" style={{ maxHeight: 240, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t('รหัสสินค้า')}</th><th>{t('ชื่อสินค้า')}</th><th>{t('ต้นทุน/ชิ้น')}</th><th>Floor Price</th><th>{t('เป้าหมาย/ขั้นต่ำ')}</th></tr></thead>
                      <tbody>
                        {parsed.validRows.slice(0, 20).map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 600 }}>{r.code}</td>
                            <td>{r.name}</td>
                            <td>{fmtCurrency(r.cost.cost_price)}</td>
                            <td>{r.cost.floor_price != null ? fmtCurrency(r.cost.floor_price) : '-'}</td>
                            <td style={{ fontSize: 12 }}>{r.cost.target_margin_percent ?? '-'}% / {r.cost.minimum_margin_percent ?? '-'}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsed.validRows.length > 20 && <div style={{ fontSize: 11, color: 'var(--text-light)', padding: 8 }}>{lang === 'en' ? `...and ${parsed.validRows.length - 20} more` : `...และอีก ${parsed.validRows.length - 20} รายการ`}</div>}
                </div>
              )}
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => { setParsed(null); setFileName('') }}>{t('เลือกไฟล์ใหม่')}</button>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('ยกเลิก')}</button>
          {parsed && (
            <button className="btn btn-primary" onClick={confirmImport} disabled={importing || !parsed.validRows.length}>
              {importing ? t('กำลังนำเข้า...') : (lang === 'en' ? `Import ${parsed.validRows.length} record(s)` : `นำเข้า ${parsed.validRows.length} รายการ`)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
