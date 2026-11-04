import { useEffect, useState } from 'react'
import {
  bulkImportDeals, bulkImportQuotations, bulkImportOrders,
  listProducts, fetchActiveOrderQuotationIds,
} from '../lib/api'
import {
  downloadDealTemplate, downloadQuotationTemplate, downloadOrderTemplate,
  parseLineDocImportFile, parseOrderImportFile, exportImportIssues,
  DEAL_IMPORT_COLUMNS, QUOTATION_IMPORT_COLUMNS, ORDER_IMPORT_COLUMNS,
} from '../lib/importExport'
import { mergeDocumentTemplate } from '../lib/documentTemplate'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// นำเข้าเอกสารเป็นชุดจากไฟล์ Excel — ใช้ร่วมกันทั้งดีล ใบเสนอราคา และออเดอร์
//
// ดีลกับใบเสนอราคาใช้ไฟล์หน้าตาเดียวกัน (1 แถว = 1 รายการสินค้า จับกลุ่มด้วย "เลขที่ใบ (กลุ่ม)")
// ส่งออกจากที่หนึ่งแล้วเอาไปนำเข้าอีกที่หนึ่งได้เลย เพราะคอลัมน์หลักเป็นชุดเดียวกัน
//
// ออเดอร์ต่างออกไป เป็น 1 แถว = 1 ออเดอร์ ที่อ้างใบเสนอราคาที่มีอยู่ เพราะฐานข้อมูลบังคับว่า
// ใบเสนอราคา 1 ใบเปิดออเดอร์ที่ยัง Active ได้แค่ 1 ใบ และต้องมีที่อยู่จัดส่งเสมอ
// รายการสินค้าจึงคัดลอกจากใบเสนอราคาให้เอง ไม่ให้กรอกซ้ำ
const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

const KIND = {
  deal: {
    title: 'นำเข้าดีลการขายเป็นชุด',
    columns: DEAL_IMPORT_COLUMNS,
    unit: 'ดีล',
    issuesFile: 'รายการที่มีปัญหา_นำเข้าดีล.xlsx',
    createdHead: 'ชื่อดีล',
    afterNote: 'ดีลที่นำเข้าจะอยู่ใน Stage ที่ระบุในไฟล์ (เว้นว่าง = Lead) และผู้เสนอราคาคือคุณ',
  },
  quotation: {
    title: 'นำเข้าใบเสนอราคาเป็นชุด',
    columns: QUOTATION_IMPORT_COLUMNS,
    unit: 'ใบ',
    issuesFile: 'รายการที่มีปัญหา_นำเข้าใบเสนอราคา.xlsx',
    createdHead: 'เลขที่',
    afterNote: 'ใบที่นำเข้าจะอยู่ในสถานะ Draft ทั้งหมด ตรวจความถูกต้องแล้วค่อยเปลี่ยนสถานะส่งลูกค้า',
  },
  order: {
    title: 'นำเข้าออเดอร์เป็นชุด',
    columns: ORDER_IMPORT_COLUMNS,
    unit: 'ออเดอร์',
    issuesFile: 'รายการที่มีปัญหา_นำเข้าออเดอร์.xlsx',
    createdHead: 'เลขออเดอร์',
    afterNote: 'ออเดอร์บันทึกแล้วแก้ไขไม่ได้ (ยกเลิกได้อย่างเดียว) — ตรวจความถูกต้องก่อนส่งต่อให้บัญชี',
  },
}

export default function ImportDocsModal({
  kind, companies = [], quotations = [], currentUser, settings = {},
  creditTerms = [], stages = [], sources = [], provinces = [],
  onClose, onImported,
}) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const cfg = KIND[kind]
  const isOrder = kind === 'order'

  const [products, setProducts] = useState(null)
  const [usedQuotIds, setUsedQuotIds] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (isOrder) {
      fetchActiveOrderQuotationIds()
        .then(setUsedQuotIds)
        .catch(e => { setUsedQuotIds(new Set()); toast(t('ตรวจใบเสนอราคาที่เปิดออเดอร์แล้วไม่สำเร็จ') + ': ' + e.message, 'error') })
      setProducts([])
      return
    }
    listProducts()
      .then(setProducts)
      .catch(e => { setProducts([]); toast(t('โหลดรายการสินค้าไม่สำเร็จ') + ': ' + e.message, 'error') })
  }, [isOrder, toast, t])

  const ready = isOrder ? usedQuotIds !== null : products !== null
  // ใบเสนอราคาที่ยังเปิดออเดอร์ได้ — ใส่เป็น dropdown ใน template จะได้ไม่ต้องพิมพ์เลขเอง
  const openQuotations = isOrder && usedQuotIds ? quotations.filter(q => !usedQuotIds.has(q.id)) : []

  const onDownload = async () => {
    try {
      if (kind === 'deal') await downloadDealTemplate(companies, products || [], stages, sources)
      else if (kind === 'quotation') await downloadQuotationTemplate(companies, products || [], creditTerms)
      else await downloadOrderTemplate(openQuotations, provinces)
    } catch (e) { toast(t('ดาวน์โหลด Template ไม่สำเร็จ') + ': ' + e.message, 'error') }
  }

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileName(file.name)
    try {
      if (isOrder) {
        const quotationsByNo = new Map(quotations.map(q => [norm(q.quot_no), q]))
        setParsed(await parseOrderImportFile(file, { quotationsByNo, usedQuotationIds: usedQuotIds }))
      } else {
        const companiesByName = new Map(companies.map(c => [norm(c.name), c]))
        const productsByCode = new Map((products || []).map(p => [norm(p.code), p]))
        setParsed(await parseLineDocImportFile(file, kind, { companiesByName, productsByCode }))
      }
    } catch (err) {
      toast(t('อ่านไฟล์ไม่สำเร็จ') + ': ' + err.message, 'error')
    }
  }

  const list = parsed ? (isOrder ? parsed.rows : parsed.groups) : []
  const groupTotal = (g) => g.items.reduce((s, it) => s + it.quantity * it.unit_price, 0)

  const confirmImport = async () => {
    if (!list.length) return
    setImporting(true)
    try {
      let r
      if (kind === 'deal') {
        r = await bulkImportDeals(parsed.groups, { proposerName: currentUser?.name || '', defaultStage: stages[0] || 'Lead' })
      } else if (kind === 'quotation') {
        r = await bulkImportQuotations(parsed.groups, {
          proposerName: currentUser?.name || '',
          salePhone: mergeDocumentTemplate(settings).quotation.defaultSalePhone || '',
        })
      } else {
        r = await bulkImportOrders(parsed.rows, {
          currentUser,
          companiesById: new Map(companies.map(c => [c.id, c])),
        })
      }
      setResult(r)
      if (r.created.length) {
        toast(lang === 'en' ? `Imported ${r.created.length}` : `นำเข้าสำเร็จ ${r.created.length} ${cfg.unit}`, r.failed.length ? 'warning' : 'success')
        onImported()
      }
      if (r.failed.length && !r.created.length) toast(t('นำเข้าไม่สำเร็จสักรายการ'), 'error')
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
          <div className="modal-title">{t(cfg.title)}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {result ? (
            /* ---------- หลังนำเข้า: บอกผลรายใบ เพราะสร้างทีละใบ อาจสำเร็จบางใบ ---------- */
            <>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{t('สำเร็จ')} {result.created.length} {t(cfg.unit)}</span>
                {result.failed.length > 0 && <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{t('ไม่สำเร็จ')} {result.failed.length} {t(cfg.unit)}</span>}
              </div>
              {result.created.length > 0 && (
                <div className="card" style={{ marginBottom: 12, maxHeight: 220, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t(isOrder ? 'เลขที่ใบเสนอราคา' : 'เลขที่ใบ (กลุ่ม)')}</th><th>{t(cfg.createdHead)}</th><th className="col-left">{t('หัวข้อ')}</th></tr></thead>
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
                      <thead><tr><th>{t('อ้างอิง')}</th><th className="col-left">{t('ปัญหา')}</th></tr></thead>
                      <tbody>
                        {result.failed.map((r, i) => (
                          <tr key={i}><td>{r.ref}</td><td className="col-left" style={{ color: 'var(--danger)', fontSize: 12 }}>{r.message}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 10, lineHeight: 1.6 }}>{t(cfg.afterNote)}</div>
            </>
          ) : !parsed ? (
            /* ---------- ก่อนเลือกไฟล์ ---------- */
            <>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                {t('1) ดาวน์โหลด Template  2) กรอกข้อมูลใน Excel  3) อัปโหลดไฟล์ .xlsx กลับมาที่นี่')}
              </div>
              <button className="btn btn-outline btn-sm" onClick={onDownload} disabled={!ready}>
                {!ready ? t('กำลังโหลด...') : t('ดาวน์โหลด Template (.xlsx)')}
              </button>
              <div style={{ fontSize: 12, color: 'var(--text-light)', margin: '8px 0 16px', lineHeight: 1.7 }}>
                {!ready ? t('กำลังเตรียมข้อมูล...') : isOrder
                  ? <>{t('ในไฟล์จะมี dropdown ให้เลือก')} <b>{t('ใบเสนอราคาที่ยังเปิดออเดอร์ได้')} {openQuotations.length} {t('ใบ')}</b> {t('ดึงจากระบบ ณ ตอนกดดาวน์โหลด')}</>
                  : <>
                      {t('ในไฟล์จะมี dropdown ให้เลื่อนเลือก')} <b>{t('บริษัท')} {companies.length} {t('ราย')}</b> {t('และ')} <b>{t('สินค้า')} {products?.length || 0} {t('รายการ')}</b> {t('ไม่ต้องพิมพ์ชื่อเอง')}
                      <br />{t('รายชื่อดึงจากระบบ ณ ตอนกดดาวน์โหลด — สินค้าหรือบริษัทที่เพิ่งเพิ่มเข้าระบบจะมีให้เลือกทันที')}
                    </>}
              </div>
              <div className="form-group">
                <label className="form-label">{t('อัปโหลดไฟล์ (.xlsx)')}</label>
                <input className="form-control" type="file" accept=".xlsx" onChange={onFileChange} disabled={!ready} />
              </div>

              <div className="card" style={{ padding: 12, fontSize: 12, lineHeight: 1.8, background: 'var(--gray-bg)' }}>
                <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>{t('วิธีกรอก')}</div>
                {isOrder ? (
                  <>
                    <div>• <b>{t('1 แถว = 1 ออเดอร์')}</b> {t('(ไม่ใช่ 1 รายการสินค้า เหมือนไฟล์ดีล/ใบเสนอราคา)')}</div>
                    <div>• {t('ใส่เลขที่ใบเสนอราคาที่จะเปิดออเดอร์ แล้วกรอกที่อยู่จัดส่งกับเบอร์โทร')}</div>
                    <div>• <b>{t('รายการสินค้าไม่ต้องกรอก')}</b> {t('ระบบดึงจากใบเสนอราคาให้เอง จะได้ตรงกันเสมอ')}</div>
                    <div>• {t('ใบเสนอราคา 1 ใบเปิดออเดอร์ได้ครั้งเดียว ใบที่เปิดไปแล้วจะถูกข้ามแล้วรายงาน')}</div>
                  </>
                ) : (
                  <>
                    <div>• <b>{t('1 แถว = สินค้า 1 รายการ')}</b> {t('ใบที่มีสินค้า 5 อย่าง ให้กรอก 5 แถว')}</div>
                    <div>• {t('แถวที่อยู่ใบเดียวกัน ใส่ "เลขที่ใบ (กลุ่ม)" ให้ตรงกัน เช่น A, B, C — ใช้แค่ในไฟล์ ไม่ใช่เลขที่จริง')}</div>
                    <div>• {t('ข้อมูลหัวใบ (บริษัท หัวข้อ วันที่ ส่วนลด) กรอกแค่แถวแรกของแต่ละกลุ่มก็พอ')}</div>
                    <div>• {t('ช่องรหัสสินค้าและชื่อบริษัท กดลูกศรในช่องแล้วเลื่อนเลือกได้เลย')}</div>
                    <div>• {t('ถ้าเป็นรายการพิมพ์เอง (เช่น ค่าขนส่ง) เว้นช่องรหัสสินค้าไว้แล้วกรอกชื่อรายการแทน')}</div>
                    <div>• <b>{t('ไฟล์ดีลกับใบเสนอราคาใช้คอลัมน์ชุดเดียวกัน')}</b> {t('ส่งออกจากที่หนึ่งแล้วเอามานำเข้าอีกที่หนึ่งได้เลย')}</div>
                  </>
                )}
                <div>• {t('ในไฟล์มีแถวตัวอย่างสีเหลืองให้ดูเป็นแนว จะลบทิ้งหรือปล่อยไว้ก็ได้ ระบบข้ามให้อยู่แล้ว')}</div>
                <div>• {t('หัวคอลัมน์ที่มีดาว (*) และพื้นสีน้ำเงินคือช่องที่ต้องกรอก สีเทาคือไม่บังคับ — เอาเมาส์ชี้หัวคอลัมน์ใน Excel จะมีคำอธิบายขึ้น')}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8 }}>
                {t('คอลัมน์ในไฟล์')}: {cfg.columns.map(c => c.label).join(', ')}
              </div>
            </>
          ) : (
            /* ---------- ตรวจทานก่อนยืนยัน ---------- */
            <>
              <div style={{ fontSize: 13, marginBottom: 8 }}>{t('ไฟล์:')} <b>{fileName}</b></div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{t('พร้อมนำเข้า')} {list.length} {t(cfg.unit)}</span>
                {parsed.invalidRows.length > 0 && (
                  <>
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{t('มีปัญหา')} {parsed.invalidRows.length} {t('รายการ')}</span>
                    <button className="btn btn-outline btn-xs" onClick={() => exportImportIssues(parsed.invalidRows, cfg.issuesFile)}>
                      {t('โหลดไฟล์รายการที่มีปัญหา')}
                    </button>
                  </>
                )}
              </div>

              {parsed.invalidRows.length > 0 && (
                <div className="card" style={{ marginBottom: 12, maxHeight: 150, overflow: 'auto' }}>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>{t('แถวที่')}</th><th>{t('อ้างอิง')}</th><th className="col-left">{t('ปัญหา')}</th></tr></thead>
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

              {list.length > 0 && (
                <div className="card" style={{ maxHeight: 260, overflow: 'auto' }}>
                  <div className="table-wrap">
                    {isOrder ? (
                      <table>
                        <thead><tr>
                          <th>{t('ใบเสนอราคา')}</th><th className="col-left">{t('หัวข้อ')}</th>
                          <th>{t('ประเภท')}</th><th className="col-left">{t('จังหวัด')}</th>
                        </tr></thead>
                        <tbody>
                          {parsed.rows.map((r, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{r.quotation.quot_no}</td>
                              <td className="col-left">{r.quotation.subject}</td>
                              <td>{r.order_type || 'ปกติ'}</td>
                              <td className="col-left">{r.shipping_province}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table>
                        <thead><tr>
                          <th>{t('กลุ่ม')}</th><th className="col-left">{t('บริษัท')}</th><th className="col-left">{t('หัวข้อ')}</th>
                          <th className="col-right">{t('รายการ')}</th><th className="col-right">{t('ยอดรวม')}</th>
                        </tr></thead>
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
                    )}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 10, lineHeight: 1.6 }}>
                {!isOrder && <div>{t('ยอดรวมที่แสดงยังไม่หักส่วนลดท้ายบิล ระบบจะคิดให้ตอนบันทึก')}</div>}
                <div>{t(cfg.afterNote)}</div>
              </div>
              <button className="btn btn-outline btn-sm" style={{ marginTop: 12 }} onClick={reset}>{t('เลือกไฟล์ใหม่')}</button>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{result ? t('ปิด') : t('ยกเลิก')}</button>
          {parsed && !result && (
            <button className="btn btn-primary" onClick={confirmImport} disabled={importing || !list.length}>
              {importing ? t('กำลังนำเข้า...') : `${t('นำเข้า')} ${list.length} ${t(cfg.unit)}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
