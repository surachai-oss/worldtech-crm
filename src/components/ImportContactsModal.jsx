import { useEffect, useState } from 'react'
import { bulkImportContacts, listCompanyNames } from '../lib/api'
import { downloadContactTemplate, parseContactImportFile, CONTACT_IMPORT_COLUMNS } from '../lib/importExport'
import { useUi } from './UiContext'

export default function ImportContactsModal({ onClose, onImported }) {
  const { toast } = useUi()
  const [companies, setCompanies] = useState(null) // null = กำลังโหลดรายชื่อบริษัท
  const [parsed, setParsed] = useState(null) // { validRows, invalidRows }
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    listCompanyNames().then(setCompanies).catch(e => toast('โหลดรายชื่อบริษัทไม่สำเร็จ: ' + e.message, 'error'))
  }, [])

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !companies) return
    setFileName(file.name)
    try {
      const byName = new Map(companies.map(c => [c.name.trim().toLowerCase(), c.id]))
      setParsed(await parseContactImportFile(file, byName))
    } catch (err) {
      toast('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'error')
    }
  }

  const confirmImport = async () => {
    if (!parsed?.validRows.length) return
    setImporting(true)
    try {
      await bulkImportContacts(parsed.validRows)
      toast(`นำเข้าสำเร็จ ${parsed.validRows.length} รายการ`, 'success')
      onImported()
      onClose()
    } catch (err) {
      toast('นำเข้าไม่สำเร็จ: ' + err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <div className="modal-title">นำเข้าผู้ติดต่อจากไฟล์</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {!parsed ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                1) ดาวน์โหลด Template  2) กรอกข้อมูลใน Excel (ชื่อบริษัทต้องตรงกับที่มีอยู่ในระบบเป๊ะ)  3) อัปโหลดไฟล์ .xlsx กลับมาที่นี่
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={downloadContactTemplate}>
                ดาวน์โหลด Template (.xlsx)
              </button>
              <div className="form-group">
                <label className="form-label">อัปโหลดไฟล์ (.xlsx)</label>
                <input className="form-control" type="file" accept=".xlsx" onChange={onFileChange} disabled={!companies} />
                {!companies && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>กำลังโหลดรายชื่อบริษัท...</div>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                คอลัมน์ที่รองรับ: {CONTACT_IMPORT_COLUMNS.map(c => c.label).join(', ')} (ต้องกรอก "ชื่อบริษัท" กับ "ชื่อ-นามสกุล")
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}>ไฟล์: <b>{fileName}</b></div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>ถูกต้อง {parsed.validRows.length} รายการ</span>
                {parsed.invalidRows.length > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>ผิดพลาด {parsed.invalidRows.length} รายการ</span>}
              </div>
              {parsed.invalidRows.length > 0 && (
                <div className="card" style={{ marginBottom: 12, maxHeight: 140, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>แถวที่</th><th>ปัญหา</th></tr></thead>
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
                      <thead><tr><th>ชื่อ-นามสกุล</th><th>บริษัท</th><th>ตำแหน่ง</th><th>โทรศัพท์</th></tr></thead>
                      <tbody>
                        {parsed.validRows.slice(0, 20).map((r, i) => {
                          const co = companies.find(c => c.id === r.company_id)
                          return (
                            <tr key={i}>
                              <td>{r.full_name}</td>
                              <td style={{ fontSize: 12 }}>{co?.name || '-'}</td>
                              <td style={{ fontSize: 12 }}>{r.position || '-'}</td>
                              <td style={{ fontSize: 12 }}>{r.phone || '-'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {parsed.validRows.length > 20 && <div style={{ fontSize: 11, color: 'var(--text-light)', padding: 8 }}>...และอีก {parsed.validRows.length - 20} รายการ</div>}
                </div>
              )}
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={() => { setParsed(null); setFileName('') }}>เลือกไฟล์ใหม่</button>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          {parsed && (
            <button className="btn btn-primary" onClick={confirmImport} disabled={importing || !parsed.validRows.length}>
              {importing ? 'กำลังนำเข้า...' : `นำเข้า ${parsed.validRows.length} รายการ`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
