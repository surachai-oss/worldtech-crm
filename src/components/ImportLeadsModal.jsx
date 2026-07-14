import { useState } from 'react'
import { bulkImportLeads } from '../lib/api'
import { downloadLeadTemplate, parseLeadImportFile, LEAD_IMPORT_COLUMNS } from '../lib/importExport'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

export default function ImportLeadsModal({ onClose, onImported }) {
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
      setParsed(await parseLeadImportFile(file))
    } catch (err) {
      toast(lang === 'en' ? 'Failed to read file: ' + err.message : 'อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'error')
    }
  }

  const confirmImport = async () => {
    if (!parsed?.validRows.length) return
    setImporting(true)
    try {
      await bulkImportLeads(parsed.validRows)
      toast(lang === 'en' ? `Imported ${parsed.validRows.length} record(s) successfully` : `นำเข้าสำเร็จ ${parsed.validRows.length} รายการ`, 'success')
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
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div className="modal-title">{t('นำเข้าผู้ติดต่อจากไฟล์')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {!parsed ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                {t('1) ดาวน์โหลด Template  2) กรอกข้อมูลใน Excel  3) อัปโหลดไฟล์ .xlsx กลับมาที่นี่')}
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={downloadLeadTemplate}>
                {t('ดาวน์โหลด Template (.xlsx)')}
              </button>
              <div className="form-group">
                <label className="form-label">{t('อัปโหลดไฟล์ (.xlsx)')}</label>
                <input className="form-control" type="file" accept=".xlsx" onChange={onFileChange} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                คอลัมน์ที่รองรับ: {LEAD_IMPORT_COLUMNS.map(c => c.label).join(', ')} (ต้องกรอกหัวข้อ/ชื่อ/โทรศัพท์)
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{t('ไฟล์:')} <b>{fileName}</b></div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{lang === 'en' ? `Valid: ${parsed.validRows.length} record(s)` : `ถูกต้อง ${parsed.validRows.length} รายการ`}</span>
                {parsed.invalidRows.length > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{lang === 'en' ? `Errors: ${parsed.invalidRows.length} record(s)` : `ผิดพลาด ${parsed.invalidRows.length} รายการ`}</span>}
              </div>
              {parsed.invalidRows.length > 0 && (
                <div className="card" style={{ marginBottom: 12, maxHeight: 140, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t('แถวที่')}</th><th>{t('ปัญหา')}</th></tr></thead>
                      <tbody>
                        {parsed.invalidRows.map((r, i) => (
                          <tr key={i}><td>{r.row}</td><td style={{ color: 'var(--danger)', fontSize: 12 }}>{r.errors.join(', ')}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {parsed.validRows.length > 0 && (
                <div className="card" style={{ maxHeight: 220, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t('หัวข้อ')}</th><th>{t('ชื่อ')}</th><th>{t('โทรศัพท์')}</th></tr></thead>
                      <tbody>
                        {parsed.validRows.slice(0, 20).map((r, i) => (
                          <tr key={i}><td>{r.subject}</td><td>{r.full_name}</td><td>{r.phone}</td></tr>
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
