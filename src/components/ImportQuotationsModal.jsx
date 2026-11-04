import { useEffect, useState } from 'react'
import { bulkImportQuotations, listProducts } from '../lib/api'
import {
  downloadQuotationTemplate, parseQuotationImportFile, exportQuotationImportIssues,
  QUOTATION_IMPORT_COLUMNS,
} from '../lib/importExport'
import { fmtCurrency } from '../lib/format'
import { mergeDocumentTemplate } from '../lib/documentTemplate'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// นำเข้าใบเสนอราคาเป็นชุด — 1 แถวในไฟล์ = 1 รายการสินค้า จับกลุ่มเป็นใบเดียวกันด้วยคอลัมน์ "เลขที่ใบ (กลุ่ม)"
// ไม่สร้างบริษัทใหม่ให้อัตโนมัติ ถ้าชื่อไม่ตรงจะข้ามแล้วรายงาน (ตามที่ตกลงกันไว้)
// เพราะชื่อบริษัทพิมพ์ผิดนิดเดียวก็กลายเป็นบริษัทซ้ำในระบบ ซึ่งแก้ทีหลังยากกว่ากรอกไฟล์ใหม่
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

export default function ImportQuotationsModal({ companies = [], currentUserName, settings = {}, creditTerms = [], onClose, onImported }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [products, setProducts] = useState(null)
  const [parsed, setParsed] = useState(null)   // { groups, invalidRows }
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)   // { created, failed }

  useEffect(() => {
    listProducts()
      .then(setProducts)
      .catch(e => { setProducts([]); toast(t('โหลดรายการสินค้าไม่สำเร็จ') + ': ' + e.message, 'error') })
  }, [toast, t])

  const onDownload = async () => {
    try {
      await downloadQuotationTemplate(companies, products || [], creditTerms.filter(Boolean))
    } catch (e) { toast(t('ดาวน์โหลด Template ไม่สำเร็จ') + ': ' + e.message, 'error') }
  }

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileName(file.name)
    try {
      const companiesByName = new Map(companies.map(c => [norm(c.name), c]))
      const productsByCode = new Map((products || []).map(p => [norm(p.code), p]))
      setParsed(await parseQuotationImportFile(file, companiesByName, productsByCode))
    } catch (err) {
      toast(t('อ่านไฟล์ไม่สำเร็จ') + ': ' + err.message, 'error')
    }
  }

  const groupTotal = (g) => g.items.reduce((s, it) => s + it.quantity * it.unit_price, 0)

  const confirmImport = async () => {
    if (!parsed?.groups.length) return
    setImporting(true)
    try {
      const r = await bulkImportQuotations(parsed.groups, {
        proposerName: currentUserName || '',
        salePhone: mergeDocumentTemplate(settings).quotation.defaultSalePhone || '',
      })
      setResult(r)
      if (r.created.length) {
        toast(lang === 'en' ? `Imported ${r.created.length} quotation(s)` : `นำเข้าสำเร็จ ${r.created.length} ใบ`, r.failed.length ? 'warning' : 'success')
        onImported()
      }
      if (r.failed.length && !r.created.length) toast(t('นำเข้าไม่สำเร็จสักใบ'), 'error')
    } catch (err) {
      toast(t('นำเข้าไม่สำเร็จ') + ': ' + err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const reset = () => { setParsed(null); setFileName(''); setResult(null) }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <div className="modal-title">{t('นำเข้าใบเสนอราคาเป็นชุด')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {result ? (
            /* ---------- หลังนำเข้า: บอกผลรายใบ เพราะสร้างทีละใบ อาจสำเร็จบางใบ ---------- */
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{t('สำเร็จ')} {result.created.length} {t('ใบ')}</span>
                {result.failed.length > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{t('ไม่สำเร็จ')} {result.failed.length} {t('ใบ')}</span>}
              </div>
              {result.created.length > 0 && (
                <div className="card" style={{ marginBottom: 12, maxHeight: 220, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t('เลขที่ใบ (กลุ่ม)')}</th><th>{t('เลขที่')}</th><th className="col-left">{t('หัวข้อ')}</th></tr></thead>
                      <tbody>
                        {result.created.map((r, i) => (
                          <tr key={i}>
                            <td>{r.ref}</td>
                            <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{r.quot_no}</td>
                            <td className="col-left">{r.subject}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {result.failed.length > 0 && (
                <div className="card" style={{ maxHeight: 160, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t('เลขที่ใบ (กลุ่ม)')}</th><th className="col-left">{t('ปัญหา')}</th></tr></thead>
                      <tbody>
                        {result.failed.map((r, i) => (
                          <tr key={i}><td>{r.ref}</td><td className="col-left" style={{ color: 'var(--danger)', fontSize: 12 }}>{r.message}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 10, lineHeight: 1.6 }}>
                {t('ใบที่นำเข้าจะอยู่ในสถานะ Draft ทั้งหมด ตรวจความถูกต้องแล้วค่อยเปลี่ยนสถานะส่งลูกค้า')}
              </div>
            </>
          ) : !parsed ? (
            /* ---------- ก่อนเลือกไฟล์ ---------- */
            <>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                {t('1) ดาวน์โหลด Template  2) กรอกข้อมูลใน Excel  3) อัปโหลดไฟล์ .xlsx กลับมาที่นี่')}
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginBottom: 16 }} onClick={onDownload} disabled={products === null}>
                {products === null ? t('กำลังโหลด...') : t('ดาวน์โหลด Template (.xlsx)')}
              </button>
              <div className="form-group">
                <label className="form-label">{t('อัปโหลดไฟล์ (.xlsx)')}</label>
                <input className="form-control" type="file" accept=".xlsx" onChange={onFileChange} disabled={products === null} />
              </div>

              <div className="card" style={{ padding: 12, fontSize: 12, lineHeight: 1.8, background: 'var(--gray-bg)' }}>
                <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>{t('วิธีกรอก')}</div>
                <div>• <b>{t('1 แถว = สินค้า 1 รายการ')}</b> {t('ใบที่มีสินค้า 5 อย่าง ให้กรอก 5 แถว')}</div>
                <div>• {t('แถวที่อยู่ใบเดียวกัน ใส่ "เลขที่ใบ (กลุ่ม)" ให้ตรงกัน เช่น A, B, C หรือ 1, 2, 3 — ใช้แค่ในไฟล์ ไม่ใช่เลขที่จริง')}</div>
                <div>• {t('ข้อมูลหัวใบ (บริษัท หัวข้อ วันที่ ส่วนลด) กรอกแค่แถวแรกของแต่ละกลุ่มก็พอ')}</div>
                <div>• {t('สินค้าที่มีในระบบให้ใส่รหัสสินค้า ถ้าเป็นรายการพิมพ์เอง (เช่น ค่าขนส่ง) เว้นรหัสไว้แล้วกรอกชื่อรายการแทน')}</div>
                <div>• <b>{t('เลขที่ QT ไม่ต้องกรอก')}</b> {t('ระบบรันให้เองตอนบันทึก')}</div>
                <div>• {t('ชื่อบริษัทต้องตรงกับที่มีในระบบ ถ้าไม่ตรงจะข้ามใบนั้นแล้วรายงานให้แก้')}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8 }}>
                {t('คอลัมน์ในไฟล์')}: {QUOTATION_IMPORT_COLUMNS.map(c => c.label).join(', ')}
              </div>
            </>
          ) : (
            /* ---------- ตรวจทานก่อนยืนยัน ---------- */
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{t('ไฟล์:')} <b>{fileName}</b></div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                  {lang === 'en' ? `Valid: ${parsed.groups.length} quotation(s)` : `พร้อมนำเข้า ${parsed.groups.length} ใบ`}
                </span>
                {parsed.invalidRows.length > 0 && (
                  <>
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                      {lang === 'en' ? `Problems: ${parsed.invalidRows.length}` : `มีปัญหา ${parsed.invalidRows.length} รายการ`}
                    </span>
                    <button className="btn btn-outline btn-xs" onClick={() => exportQuotationImportIssues(parsed.invalidRows)}>
                      {t('โหลดไฟล์รายการที่มีปัญหา')}
                    </button>
                  </>
                )}
              </div>

              {parsed.invalidRows.length > 0 && (
                <div className="card" style={{ marginBottom: 12, maxHeight: 150, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t('แถวที่')}</th><th>{t('เลขที่ใบ (กลุ่ม)')}</th><th className="col-left">{t('ปัญหา')}</th></tr></thead>
                      <tbody>
                        {parsed.invalidRows.map((r, i) => (
                          <tr key={i}>
                            <td>{r.row}</td><td>{r.ref || '-'}</td>
                            <td className="col-left" style={{ color: 'var(--danger)', fontSize: 12 }}>{r.errors.join(', ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {parsed.groups.length > 0 && (
                <div className="card" style={{ maxHeight: 260, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('กลุ่ม')}</th><th className="col-left">{t('บริษัท')}</th><th className="col-left">{t('หัวข้อ')}</th>
                          <th className="col-right">{t('รายการ')}</th><th className="col-right">{t('ยอดรวม')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.groups.map((g, i) => (
                          <tr key={i}>
                            <td>{g.ref}</td>
                            <td className="col-left">{g.company_name}</td>
                            <td className="col-left">{g.subject}</td>
                            <td className="col-right">{g.items.length}</td>
                            <td className="col-right" style={{ fontWeight: 600 }}>{fmtCurrency(groupTotal(g))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 10, lineHeight: 1.6 }}>
                <div>{t('ยอดรวมที่แสดงยังไม่หักส่วนลดท้ายบิล ระบบจะคิดให้ตอนบันทึก')}</div>
                <div>{t('ใบที่นำเข้าจะเป็นสถานะ Draft และผู้เสนอราคาคือคุณ')}</div>
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={reset}>{t('เลือกไฟล์ใหม่')}</button>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{result ? t('ปิด') : t('ยกเลิก')}</button>
          {parsed && !result && (
            <button className="btn btn-primary" onClick={confirmImport} disabled={importing || !parsed.groups.length}>
              {importing ? t('กำลังนำเข้า...') : (lang === 'en' ? `Import ${parsed.groups.length} quotation(s)` : `นำเข้า ${parsed.groups.length} ใบ`)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
