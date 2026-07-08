import { useState } from 'react'
import { bulkImportCompanies, updateCompany, listCompanyNamesMap } from '../lib/api'
import { downloadCompanyTemplate, parseCompanyImportFile, exportCompanyImportIssues, COMPANY_IMPORT_COLUMNS } from '../lib/importExport'
import { useUi } from './UiContext'
import { usePicklists } from './PicklistsContext'

export default function ImportCompaniesModal({ perm, onClose, onImported }) {
  const { toast } = useUi()
  const { list } = usePicklists()
  const [parsed, setParsed] = useState(null) // { validRows, invalidRows, duplicateRows }
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileName(file.name)
    try {
      const existingNames = await listCompanyNamesMap()
      const result = await parseCompanyImportFile(file, existingNames)
      setParsed(result)
    } catch (err) {
      toast('อ่านไฟล์ไม่สำเร็จ: ' + err.message, 'error')
    }
  }

  const setDuplicateAction = (idx, action) => {
    setParsed(p => ({ ...p, duplicateRows: p.duplicateRows.map((r, i) => i === idx ? { ...r, action } : r) }))
  }

  const unresolvedDuplicates = parsed?.duplicateRows.filter(r => !r.action).length || 0

  const confirmImport = async () => {
    if (!parsed || unresolvedDuplicates) return
    setImporting(true)
    try {
      const toInsert = [
        ...parsed.validRows,
        ...parsed.duplicateRows.filter(r => r.action === 'new').map(r => r.data)
      ].map(r => ({ ...r, created_by: perm.userId }))
      const toUpdate = parsed.duplicateRows.filter(r => r.action === 'overwrite')
      if (toInsert.length) await bulkImportCompanies(toInsert)
      await Promise.all(toUpdate.map(r => updateCompany(r.existingId, r.data)))
      toast(`นำเข้าสำเร็จ ${toInsert.length + toUpdate.length} รายการ`, 'success')
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
          <div className="modal-title">นำเข้าบริษัทลูกค้าจากไฟล์</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {!parsed ? (
            <>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                1) ดาวน์โหลด Template  2) กรอกข้อมูลใน Excel  3) อัปโหลดไฟล์ .xlsx กลับมาที่นี่
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginBottom: 16 }}
                onClick={() => downloadCompanyTemplate({ industries: list('industries'), statuses: list('company_statuses'), leadSources: list('lead_sources'), customerTypes: list('customer_types') })}>
                ดาวน์โหลด Template (.xlsx)
              </button>
              <div className="form-group">
                <label className="form-label">อัปโหลดไฟล์ (.xlsx)</label>
                <input className="form-control" type="file" accept=".xlsx" onChange={onFileChange} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                คอลัมน์ที่รองรับ: {COMPANY_IMPORT_COLUMNS.map(c => c.label).join(', ')} (มีแค่ "ชื่อบริษัท" ที่จำเป็น — คอลัมน์ประเภทลูกค้า/อุตสาหกรรม/สถานะ/ที่มา มี dropdown ตัวเลือกให้ในไฟล์แล้ว)
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}>ไฟล์: <b>{fileName}</b></div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>ถูกต้อง {parsed.validRows.length} รายการ</span>
                {parsed.duplicateRows.length > 0 && <span style={{ color: 'var(--warning, #b8860b)', fontWeight: 600 }}>ชื่อซ้ำกับข้อมูลเดิม {parsed.duplicateRows.length} รายการ</span>}
                {parsed.invalidRows.length > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>ผิดพลาด {parsed.invalidRows.length} รายการ</span>}
                {(parsed.invalidRows.length > 0 || parsed.duplicateRows.length > 0) && (
                  <button className="btn btn-outline btn-xs" onClick={() => exportCompanyImportIssues(parsed.invalidRows, parsed.duplicateRows)}>
                    ส่งออกเฉพาะแถวที่มีปัญหา
                  </button>
                )}
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
              {parsed.duplicateRows.length > 0 && (
                <div className="card" style={{ marginBottom: 12, maxHeight: 220, overflow: 'auto' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-light)', padding: '8px 8px 0' }}>
                    ชื่อบริษัทเหล่านี้มีอยู่แล้วในระบบ — เลือกว่าจะสร้างเป็นรายการใหม่ (ซ้ำชื่อ) หรืออัปเดตทับข้อมูลเดิม ก่อนกดนำเข้า
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>แถวที่</th><th>ชื่อบริษัท</th><th>เลือกการทำงาน</th></tr></thead>
                      <tbody>
                        {parsed.duplicateRows.map((r, i) => (
                          <tr key={i}>
                            <td>{r.row}</td>
                            <td>{r.data.name}</td>
                            <td>
                              <label style={{ fontSize: 12, marginRight: 12 }}>
                                <input type="radio" name={`dup-${i}`} checked={r.action === 'new'} onChange={() => setDuplicateAction(i, 'new')} /> สร้างใหม่ (ซ้ำชื่อ)
                              </label>
                              <label style={{ fontSize: 12 }}>
                                <input type="radio" name={`dup-${i}`} checked={r.action === 'overwrite'} onChange={() => setDuplicateAction(i, 'overwrite')} /> อัปเดตทับข้อมูลเดิม
                              </label>
                            </td>
                          </tr>
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
                      <thead><tr><th>ชื่อบริษัท</th><th>อุตสาหกรรม</th><th>โทรศัพท์</th><th>ที่มา</th></tr></thead>
                      <tbody>
                        {parsed.validRows.slice(0, 20).map((r, i) => (
                          <tr key={i}><td>{r.name}</td><td style={{ fontSize: 12 }}>{r.industry || '-'}</td><td style={{ fontSize: 12 }}>{r.phone || '-'}</td><td style={{ fontSize: 12 }}>{r.lead_source || '-'}</td></tr>
                        ))}
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
            <button className="btn btn-primary" onClick={confirmImport}
              disabled={importing || unresolvedDuplicates > 0 || (!parsed.validRows.length && !parsed.duplicateRows.length)}>
              {importing
                ? 'กำลังนำเข้า...'
                : unresolvedDuplicates > 0
                  ? `เลือกการทำงานให้ครบ (เหลือ ${unresolvedDuplicates} รายการ)`
                  : `นำเข้า ${parsed.validRows.length + parsed.duplicateRows.length} รายการ`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
