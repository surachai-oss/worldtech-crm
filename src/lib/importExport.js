import ExcelJS from 'exceljs'
import { POSITION_OPTIONS, BUSINESS_TYPE_OPTIONS, PURCHASE_REASON_OPTIONS } from './leadOptions'
import { paymentStatusLabel } from './format'

// ===== เครื่องมือกลางสำหรับอ่าน/สร้างไฟล์ Excel (.xlsx) — ใช้ร่วมกันทุกฟีเจอร์ import ในระบบ =====
// ใช้ exceljs แทน xlsx บน npm เพราะเวอร์ชันที่ติดตั้งผ่าน npm มีช่องโหว่ความปลอดภัยที่ยังไม่มีแพตช์

function cellText(cell) {
  const v = cell.value
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('')
    if (v.result != null) return String(v.result)
    if (v.text != null) return String(v.text)
    return ''
  }
  return String(v).trim()
}

// อ่านไฟล์ .xlsx เป็น array ของ object {label: value} โดยใช้แถวแรกของ sheet แรกเป็นหัวคอลัมน์
export async function readExcelRows(file) {
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  if (!sheet) return []

  const headers = {} // colNumber -> label
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => { headers[colNumber] = cellText(cell) })

  const rows = []
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r)
    const obj = {}
    let hasValue = false
    Object.entries(headers).forEach(([colNumber, label]) => {
      if (!label) return
      const text = cellText(row.getCell(Number(colNumber)))
      if (text) hasValue = true
      obj[label] = text
    })
    if (hasValue) rows.push(obj)
  }
  return rows
}

const TEMPLATE_DROPDOWN_ROWS = 500 // จำนวนแถวที่ใส่ dropdown ให้ล่วงหน้าในคอลัมน์ที่มีตัวเลือก

// เขียนตัวเลือกไว้ในชีตซ่อนอีกชีตหนึ่ง ใช้เป็นแหล่งข้อมูลของ dropdown ในชีตหลัก
// (ใส่ตัวเลือกตรงๆ ในสูตร data validation จะพังถ้ารายการยาว/เยอะเกิน 255 ตัวอักษรรวมกัน เช่นรายชื่อบริษัท)
function addDropdownListsSheet(workbook, dropdowns) {
  const keys = Object.keys(dropdowns).filter(k => dropdowns[k]?.length)
  if (!keys.length) return {}
  const listSheet = workbook.addWorksheet('Lists')
  listSheet.state = 'veryHidden'
  const refs = {}
  keys.forEach((key, i) => {
    const values = dropdowns[key]
    const col = listSheet.getColumn(i + 1)
    values.forEach((v, r) => { listSheet.getCell(r + 1, i + 1).value = v })
    refs[key] = `Lists!$${col.letter}$1:$${col.letter}$${values.length}`
  })
  return refs
}

// สร้างไฟล์ Excel template (แถวหัวคอลัมน์ตัวหนา + ตัวอย่าง 1 แถว) แล้วดาวน์โหลดให้ผู้ใช้
// dropdowns (ไม่บังคับ): { columnKey: [ตัวเลือก, ...] } — คอลัมน์ที่ระบุจะมี dropdown ให้เลือกในไฟล์ Excel เลย ไม่ต้องพิมพ์เอง
export async function downloadExcelTemplate(columns, exampleRow, filename, dropdowns = {}) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Template')
  sheet.columns = columns.map(c => ({ header: c.label, key: c.key, width: 24 }))
  sheet.getRow(1).font = { bold: true }
  sheet.addRow(exampleRow)

  const refs = addDropdownListsSheet(workbook, dropdowns)
  columns.forEach((c, idx) => {
    const ref = refs[c.key]
    if (!ref) return
    const colNumber = idx + 1
    for (let row = 2; row <= TEMPLATE_DROPDOWN_ROWS; row++) {
      sheet.getCell(row, colNumber).dataValidation = { type: 'list', allowBlank: true, formulae: [ref] }
    }
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// สร้างไฟล์ Excel จากข้อมูลที่มีอยู่แล้วในระบบแล้วดาวน์โหลดให้ผู้ใช้ (ตรงข้ามกับ downloadExcelTemplate ที่สร้างไฟล์เปล่าให้กรอก)
// columns: [{ key, label }] ใช้ key ดึงค่าจาก rows แต่ละแถว, label เป็นหัวคอลัมน์
export async function exportRowsToExcel(columns, rows, filename) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data')
  sheet.columns = columns.map(c => ({ header: c.label, key: c.key, width: 24 }))
  sheet.getRow(1).font = { bold: true }
  rows.forEach(row => sheet.addRow(columns.reduce((o, c) => ({ ...o, [c.key]: row[c.key] ?? '' }), {})))

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ===== นำเข้าบริษัทลูกค้าจากไฟล์ Excel =====
export const COMPANY_IMPORT_COLUMNS = [
  { key: 'name', label: 'ชื่อบริษัท', required: true },
  { key: 'customer_type', label: 'ประเภทลูกค้า' },
  { key: 'industry', label: 'อุตสาหกรรม' },
  { key: 'phone', label: 'โทรศัพท์' },
  { key: 'email', label: 'อีเมล' },
  { key: 'website', label: 'เว็บไซต์' },
  { key: 'address', label: 'ที่อยู่' },
  { key: 'tax_id', label: 'เลขประจำตัวผู้เสียภาษี' },
  { key: 'status', label: 'สถานะ' },
  { key: 'owner', label: 'ผู้รับผิดชอบ' },
  { key: 'lead_source', label: 'ที่มา' },
  { key: 'note', label: 'หมายเหตุ' },
]

const COMPANY_EXAMPLE_ROW = {
  name: 'บริษัท ตัวอย่าง จำกัด', customer_type: 'นิติบุคคล/บริษัท', industry: 'เทคโนโลยี', phone: '02-xxx-xxxx',
  email: 'contact@example.com', website: 'https://www.example.com', address: 'ที่อยู่ตัวอย่าง', tax_id: '0-0000-00000-00-0',
  status: 'Active', owner: 'ชื่อผู้รับผิดชอบ', lead_source: '', note: ''
}

// picklists: { industries, statuses, leadSources, customerTypes } — รายการตัวเลือกปัจจุบันจากระบบ (ดึงมาจาก usePicklists ตอนเรียก)
export const downloadCompanyTemplate = (picklists = {}) =>
  downloadExcelTemplate(COMPANY_IMPORT_COLUMNS, COMPANY_EXAMPLE_ROW, 'template_นำเข้าบริษัทลูกค้า.xlsx', {
    customer_type: picklists.customerTypes, industry: picklists.industries, status: picklists.statuses, lead_source: picklists.leadSources
  })

// existingNames: Map ของชื่อบริษัท (normalize เป็นตัวพิมพ์เล็ก+ตัดช่องว่าง) -> id บริษัทที่มีอยู่แล้วในระบบ ใช้ตรวจชื่อซ้ำ
// คืนค่า { validRows, invalidRows, duplicateRows } — invalidRows มี { row, errors, data } สำหรับแสดงผลพรีวิว
// duplicateRows คือแถวที่ชื่อซ้ำกับบริษัทที่มีอยู่แล้ว (ไม่ใช่ error แต่ต้องให้ผู้อัปโหลดเลือกว่าจะสร้างใหม่หรืออัปเดตทับของเดิม)
export async function parseCompanyImportFile(file, existingNames = new Map()) {
  const rawRows = await readExcelRows(file)
  const labelToKey = {}
  COMPANY_IMPORT_COLUMNS.forEach(c => { labelToKey[c.label] = c.key })

  const seenInFile = new Set()
  const validRows = []
  const invalidRows = []
  const duplicateRows = []
  rawRows.forEach((raw, i) => {
    const row = {}
    Object.entries(raw).forEach(([label, value]) => {
      const key = labelToKey[label.trim()]
      if (key) row[key] = (value || '').trim()
    })
    const errors = []
    if (!row.name) errors.push('กรุณากรอกชื่อบริษัท')
    const normName = (row.name || '').toLowerCase()
    if (row.name && seenInFile.has(normName)) errors.push('ชื่อบริษัทซ้ำกันในไฟล์นี้')
    if (row.name) seenInFile.add(normName)
    if (errors.length) { invalidRows.push({ row: i + 2, errors, data: row }); return }
    const existingId = existingNames.get(normName)
    if (existingId) duplicateRows.push({ row: i + 2, data: row, existingId, action: null })
    else validRows.push(row)
  })
  return { validRows, invalidRows, duplicateRows }
}

// ส่งออกเฉพาะแถวที่มีปัญหา (ชื่อขาด/ซ้ำในไฟล์/ซ้ำกับข้อมูลเดิม) เป็นไฟล์ Excel ให้ผู้อัปโหลดตรวจสอบ
export const exportCompanyImportIssues = (invalidRows, duplicateRows) => {
  const columns = [...COMPANY_IMPORT_COLUMNS, { key: '_issue', label: 'ปัญหา' }]
  const rows = [
    ...invalidRows.map(r => ({ ...r.data, _issue: r.errors.join(', ') })),
    ...duplicateRows.map(r => ({ ...r.data, _issue: 'ชื่อบริษัทนี้มีอยู่แล้วในระบบ' }))
  ]
  return exportRowsToExcel(columns, rows, 'รายการที่มีปัญหา_นำเข้าบริษัทลูกค้า.xlsx')
}

// ===== นำเข้าสินค้าจากไฟล์ Excel =====
export const PRODUCT_IMPORT_COLUMNS = [
  { key: 'code', label: 'รหัสสินค้า', required: true },
  { key: 'name', label: 'ชื่อสินค้า', required: true },
]

const PRODUCT_EXAMPLE_ROW = { code: 'SKU-001', name: 'ชื่อสินค้าตัวอย่าง' }

export const downloadProductTemplate = () =>
  downloadExcelTemplate(PRODUCT_IMPORT_COLUMNS, PRODUCT_EXAMPLE_ROW, 'template_นำเข้าสินค้า.xlsx')

// existingCodes: Set ของรหัสสินค้าที่มีอยู่แล้วในระบบ (normalize แล้ว เป็นตัวพิมพ์เล็ก) ใช้กันเพิ่มรหัสซ้ำ
export async function parseProductImportFile(file, existingCodes) {
  const rawRows = await readExcelRows(file)
  const labelToKey = {}
  PRODUCT_IMPORT_COLUMNS.forEach(c => { labelToKey[c.label] = c.key })

  const seenInFile = new Set()
  const validRows = []
  const invalidRows = []
  rawRows.forEach((raw, i) => {
    const row = {}
    Object.entries(raw).forEach(([label, value]) => {
      const key = labelToKey[label.trim()]
      if (key) row[key] = (value || '').trim()
    })
    const errors = []
    if (!row.code) errors.push('กรุณากรอกรหัสสินค้า')
    if (!row.name) errors.push('กรุณากรอกชื่อสินค้า')
    const normCode = (row.code || '').toLowerCase()
    if (row.code && existingCodes.has(normCode)) errors.push('รหัสสินค้านี้มีอยู่แล้วในระบบ')
    if (row.code && seenInFile.has(normCode)) errors.push('รหัสสินค้าซ้ำกันในไฟล์นี้')
    if (row.code) seenInFile.add(normCode)
    if (errors.length) invalidRows.push({ row: i + 2, errors, data: row })
    else validRows.push(row)
  })
  return { validRows, invalidRows }
}

// ===== ส่งออกสินค้าเป็นไฟล์ Excel =====
const PRODUCT_EXPORT_COLUMNS = [
  { key: 'code', label: 'รหัสสินค้า' },
  { key: 'name', label: 'ชื่อสินค้า' },
  { key: 'created_at', label: 'วันที่เพิ่ม' },
]

export const exportProductsToExcel = (rows) =>
  exportRowsToExcel(PRODUCT_EXPORT_COLUMNS, rows.map(r => ({ ...r, created_at: (r.created_at || '').slice(0, 10) })), 'สินค้า.xlsx')

// ===== ส่งออกลีด/ผู้ติดต่อเป็นไฟล์ Excel =====
const LEAD_EXPORT_COLUMNS = [
  { key: 'subject', label: 'หัวข้อ' },
  { key: 'full_name', label: 'ชื่อ-นามสกุล' },
  { key: 'phone', label: 'โทรศัพท์' },
  { key: 'email', label: 'อีเมล' },
  { key: 'position', label: 'ตำแหน่ง' },
  { key: 'business_type', label: 'ประเภทธุรกิจ' },
  { key: 'appliance_interest', label: 'สนใจเครื่องใช้ไฟฟ้า' },
  { key: 'purchase_reason', label: 'เหตุผลในการซื้อ' },
  { key: 'message', label: 'ข้อความเพิ่มเติม' },
  { key: 'source', label: 'ที่มา' },
  { key: 'status', label: 'สถานะ' },
  { key: 'created_at', label: 'วันที่' },
]

// ประวัติการติดต่อ (activities ที่ผูกกับ lead_id) — ใส่เป็นชีตที่สองในไฟล์เดียวกัน ให้ดูควบคู่กับข้อมูลผู้ติดต่อได้เลย
const LEAD_HISTORY_COLUMNS = [
  { key: 'lead_full_name', label: 'ชื่อผู้ติดต่อ' },
  { key: 'lead_phone', label: 'โทรศัพท์' },
  { key: 'type', label: 'ประเภทการติดต่อ' },
  { key: 'activity_date', label: 'วันที่' },
  { key: 'subject', label: 'หัวข้อ' },
  { key: 'detail', label: 'รายละเอียด' },
  { key: 'recorded_by', label: 'ผู้บันทึก' },
]

export async function exportLeadsToExcel(rows, history = []) {
  const workbook = new ExcelJS.Workbook()

  const leadSheet = workbook.addWorksheet('ผู้ติดต่อ')
  leadSheet.columns = LEAD_EXPORT_COLUMNS.map(c => ({ header: c.label, key: c.key, width: 24 }))
  leadSheet.getRow(1).font = { bold: true }
  rows.forEach(r => {
    const row = {
      ...r,
      created_at: (r.created_at || '').slice(0, 10),
      appliance_interest: r.appliance_interest?.length ? r.appliance_interest.join(', ') : (r.interested_product || '')
    }
    leadSheet.addRow(LEAD_EXPORT_COLUMNS.reduce((o, c) => ({ ...o, [c.key]: row[c.key] ?? '' }), {}))
  })

  const leadById = new Map(rows.map(r => [r.id, r]))
  const historySheet = workbook.addWorksheet('ประวัติการติดต่อ')
  historySheet.columns = LEAD_HISTORY_COLUMNS.map(c => ({ header: c.label, key: c.key, width: 24 }))
  historySheet.getRow(1).font = { bold: true }
  history.forEach(a => {
    const lead = leadById.get(a.lead_id)
    const row = {
      ...a,
      lead_full_name: lead?.full_name || '',
      lead_phone: lead?.phone || '',
      activity_date: (a.activity_date || '').slice(0, 10),
    }
    historySheet.addRow(LEAD_HISTORY_COLUMNS.reduce((o, c) => ({ ...o, [c.key]: row[c.key] ?? '' }), {}))
  })

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ผู้ติดต่อ.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

// ===== ส่งออกออเดอร์เป็นไฟล์ Excel =====
const ORDER_EXPORT_COLUMNS = [
  { key: 'order_no', label: 'เลขออเดอร์' },
  { key: 'quot_no', label: 'เลขใบเสนอราคา' },
  { key: 'customer_name', label: 'บริษัท' },
  { key: 'value', label: 'ยอดรวม' },
  { key: 'sales_name', label: 'เซลล์' },
  { key: 'created_at', label: 'วันที่สร้าง' },
  { key: 'status', label: 'สถานะ' },
]

export const exportOrdersToExcel = (rows) =>
  exportRowsToExcel(ORDER_EXPORT_COLUMNS, rows.map(r => ({
    ...r,
    customer_name: r.customer_name || r.company?.name || '',
    created_at: (r.created_at || '').slice(0, 10),
    status: r.status === 'Active' ? 'ใช้งานอยู่' : (r.status === 'Cancelled' ? 'ยกเลิกแล้ว' : (r.status || '')),
  })), 'ออเดอร์.xlsx')

// ===== ส่งออกคำขอตรวจยอดเป็นไฟล์ Excel (ใช้ทั้งหน้าคำขอตรวจยอดของเซลล์ และหน้าตรวจสอบยอดโอนของบัญชี) =====
// บัญชีเอาไฟล์นี้ไปแมทช์กับระบบบัญชีภายหลังได้ — มีทั้งเลขคำขอ/เลขอนุมัติ/เลขอ้างอิงบัญชี/เลขออเดอร์
const PAYMENT_EXPORT_COLUMNS = [
  { key: 'pr_no', label: 'เลขคำขอ' },
  { key: 'request_date', label: 'วันที่คำขอ' },
  { key: 'customer_name', label: 'ลูกค้า' },
  { key: 'credit_type', label: 'ประเภทลูกค้า' },
  { key: 'payment_type', label: 'ประเภทการชำระ' },
  { key: 'po_reference', label: 'เลขที่ PO' },
  { key: 'total_amount', label: 'ยอดรวม (รวม VAT)' },
  { key: 'status_label', label: 'สถานะ' },
  { key: 'requested_by_name', label: 'ผู้ส่งคำขอ' },
  { key: 'finance_reviewer_name', label: 'ผู้อนุมัติ' },
  { key: 'finance_ref_no', label: 'เลขอ้างอิงบัญชี' },
  { key: 'approval_ref_no', label: 'เลขอนุมัติระบบ' },
  { key: 'finance_remark', label: 'หมายเหตุบัญชี' },
  { key: 'order_no', label: 'เลขออเดอร์' },
  { key: 'created_at', label: 'สร้างเมื่อ' },
]

// ===== ส่งออกดีลจากป็อปอัปสรุปราย วัน/สัปดาห์/เดือน/ปี ในหน้าดีลการขาย เป็นไฟล์ Excel (เอาไปวิเคราะห์ต่อ) =====
const DEAL_EXPORT_COLUMNS = [
  { key: 'period', label: 'ช่วงเวลา' },
  { key: 'name', label: 'ดีล' },
  { key: 'company', label: 'บริษัท' },
  { key: 'stage', label: 'Stage' },
  { key: 'date', label: 'วันที่' },
  { key: 'value', label: 'มูลค่า' },
  { key: 'owner', label: 'ผู้รับผิดชอบ' },
]

export const exportDealsToExcel = (rows, filename = 'ดีล.xlsx') =>
  exportRowsToExcel(DEAL_EXPORT_COLUMNS, rows, filename)

export const exportPaymentRequestsToExcel = (rows, filename = 'คำขอตรวจยอด.xlsx') =>
  exportRowsToExcel(PAYMENT_EXPORT_COLUMNS, rows.map(r => ({
    ...r,
    customer_name: r.customer_name || r.company?.name || '',
    request_date: (r.request_date || '').slice(0, 10),
    total_amount: Number(r.total_amount || 0),
    status_label: paymentStatusLabel(r.status),
    order_no: r.order_no || r.order?.order_no || '',
    created_at: (r.created_at || '').slice(0, 10),
  })), filename)

// ===== นำเข้าผู้ติดต่อ/ลีดจากไฟล์ Excel =====
export const LEAD_IMPORT_COLUMNS = [
  { key: 'subject', label: 'หัวข้อ', required: true },
  { key: 'full_name', label: 'ชื่อ-นามสกุล', required: true },
  { key: 'phone', label: 'โทรศัพท์', required: true },
  { key: 'email', label: 'อีเมล' },
  { key: 'position', label: 'ตำแหน่ง' },
  { key: 'business_type', label: 'ประเภทธุรกิจ' },
  { key: 'appliance_interest', label: 'สนใจเครื่องใช้ไฟฟ้า (คั่นด้วยจุลภาคถ้ามีหลายอย่าง)' },
  { key: 'purchase_reason', label: 'เหตุผลในการซื้อ' },
  { key: 'message', label: 'ข้อความเพิ่มเติม' },
  { key: 'source', label: 'ที่มา' },
]

const LEAD_EXAMPLE_ROW = {
  subject: 'สอบถามราคาตู้แช่แข็ง', full_name: 'สมชาย ใจดี', phone: '08x-xxx-xxxx', email: 'somchai@example.com',
  position: 'เจ้าของกิจการ', business_type: 'ร้านอาหาร / คาเฟ่', appliance_interest: 'ตู้แช่แข็ง, ตู้เย็น',
  purchase_reason: 'สำหรับธุรกิจ', message: '', source: 'เว็บไซต์'
}

// ใช้ตัวเลือกชุดเดียวกับฟอร์มสาธารณะ (leadOptions.js) เป็น dropdown ในไฟล์ template — ไม่ใส่ dropdown ให้ "สนใจเครื่องใช้ไฟฟ้า" เพราะเป็นช่องกรอกได้หลายค่าคั่นด้วยจุลภาค
export const downloadLeadTemplate = () =>
  downloadExcelTemplate(LEAD_IMPORT_COLUMNS, LEAD_EXAMPLE_ROW, 'template_นำเข้าผู้ติดต่อ.xlsx', {
    position: POSITION_OPTIONS, business_type: BUSINESS_TYPE_OPTIONS, purchase_reason: PURCHASE_REASON_OPTIONS
  })

// ไม่เช็คซ้ำกับข้อมูลเดิม (ต่างจากบริษัท/สินค้า) เพราะลีดหลายรายการมาจากคนเดียวกัน/เบอร์เดียวกันได้ตามปกติ (ติดต่อมาหลายครั้ง)
export async function parseLeadImportFile(file) {
  const rawRows = await readExcelRows(file)
  const labelToKey = {}
  LEAD_IMPORT_COLUMNS.forEach(c => { labelToKey[c.label] = c.key })

  const validRows = []
  const invalidRows = []
  rawRows.forEach((raw, i) => {
    const row = {}
    Object.entries(raw).forEach(([label, value]) => {
      const key = labelToKey[label.trim()]
      if (key) row[key] = (value || '').trim()
    })
    const errors = []
    if (!row.subject) errors.push('กรุณากรอกหัวข้อ')
    if (!row.full_name) errors.push('กรุณากรอกชื่อ-นามสกุล')
    if (!row.phone) errors.push('กรุณากรอกโทรศัพท์')
    if (errors.length) { invalidRows.push({ row: i + 2, errors, data: row }); return }
    validRows.push({
      ...row,
      appliance_interest: row.appliance_interest ? row.appliance_interest.split(',').map(s => s.trim()).filter(Boolean) : [],
      status: 'ใหม่'
    })
  })
  return { validRows, invalidRows }
}

// ===== ส่งออกประวัติการเช็คราคาเป็นไฟล์ Excel =====
// คอลัมน์ "กำไรรวม" ใส่ให้เฉพาะบัญชี/แอดมิน — ไฟล์ที่เซลล์ดาวน์โหลดจะไม่มีตัวเลขที่ย้อนหาต้นทุนได้
const PRICE_CHECK_EXPORT_COLUMNS = [
  { key: 'check_no', label: 'เลขที่' },
  { key: 'created_at', label: 'วันที่' },
  { key: 'product_code', label: 'รหัสสินค้า' },
  { key: 'product_name', label: 'ชื่อสินค้า' },
  { key: 'quantity', label: 'จำนวน' },
  { key: 'offer_price', label: 'ราคาที่เสนอ/ชิ้น' },
  { key: 'shipping_cost', label: 'ค่าขนส่ง' },
  { key: 'net_sales', label: 'ยอดขายรวม' },
  { key: 'shipping_buffer', label: 'Shipping Buffer' },
  { key: 'provision_buffer', label: 'Provision Buffer' },
  { key: 'margin_percent', label: 'Margin (%)' },
  { key: 'auto_tier', label: 'Tier' },
  { key: 'price_status', label: 'สถานะ' },
  { key: 'floor_price', label: 'Floor Price' },
  { key: 'suggested_min_price', label: 'ราคาแนะนำขั้นต่ำ' },
  { key: 'recommendation', label: 'คำแนะนำ' },
  { key: 'created_by_name', label: 'ผู้เช็ค' },
]

export const exportPriceChecksToExcel = (rows, includeProfit = false) => {
  const columns = includeProfit
    ? [...PRICE_CHECK_EXPORT_COLUMNS.slice(0, 10), { key: 'total_profit', label: 'กำไรรวม' }, ...PRICE_CHECK_EXPORT_COLUMNS.slice(10)]
    : PRICE_CHECK_EXPORT_COLUMNS
  return exportRowsToExcel(columns, rows.map(r => ({
    ...r,
    created_at: (r.created_at || '').slice(0, 10)
  })), 'ประวัติเช็คราคา.xlsx')
}

// ===== นำเข้าต้นทุนสินค้าจากไฟล์ Excel (บัญชี/แอดมินเท่านั้น) =====
// Template ถูกเติมรหัส+ชื่อสินค้าทุกตัวมาให้แล้ว บัญชีแค่กรอกตัวเลขลงในแถวที่ต้องการ ไม่ต้องพิมพ์รหัสเอง
// Shipping/Provision Buffer และค่าขนส่งมาตรฐาน ไม่มีในไฟล์ — ใช้ค่ากลางจากหน้า "ต้นทุนสินค้า" (ตั้งรายตัวได้ในป็อปอัปแก้ไข)
// required/hint/example ใช้สร้างชีต "วิธีกรอก" ในไฟล์ template ให้บัญชีอ่านได้ในไฟล์เลย ไม่ต้องกลับมาถามในระบบ
export const PRODUCT_COST_IMPORT_COLUMNS = [
  {
    key: 'code', label: 'รหัสสินค้า', locked: true,
    required: 'ระบบเติมให้', example: 'SKU-001',
    hint: 'ห้ามแก้ — ระบบใช้ช่องนี้จับคู่กับสินค้าในระบบ ถ้าแก้แล้วไม่ตรงจะนำเข้าไม่ได้',
  },
  {
    // ใส่มาให้อ่านประกอบเท่านั้น ตอนนำเข้าไม่ได้ใช้
    key: 'name', label: 'ชื่อสินค้า', locked: true,
    required: 'ระบบเติมให้', example: 'ตู้เย็น 2 ประตู 15 คิว',
    hint: 'ไว้ดูว่ากรอกถูกตัวไหม ตอนนำเข้าระบบไม่ได้ใช้ช่องนี้',
  },
  {
    key: 'cost_price', label: 'ต้นทุน/ชิ้น', numeric: true,
    required: 'บังคับ', example: '1850',
    hint: 'ต้นทุนจริงต่อ 1 ชิ้น ต้องมากกว่า 0 — ถ้าจะกรอกแถวนี้ต้องมีช่องนี้เสมอ',
  },
  {
    key: 'normal_selling_price', label: 'ราคาขายปกติ', numeric: true,
    required: 'ไม่บังคับ', example: '2390',
    hint: 'ราคาที่ขายทั่วไป โชว์ให้เซลล์เห็นเป็นตัวเทียบ ไม่ได้เอาไปคำนวณ Margin',
  },
  {
    key: 'target_margin_percent', label: 'Margin เป้าหมาย (%)', numeric: true,
    required: 'ควรกรอก', example: '20',
    hint: 'Margin ที่คำนวณได้ถึงค่านี้ = "ผ่าน / ขายได้" — ถ้าเว้นว่างระบบถือเป็น 0 แทบทุกราคาจะขึ้นว่าผ่าน',
  },
  {
    key: 'minimum_margin_percent', label: 'Margin ขั้นต่ำ (%)', numeric: true,
    required: 'ควรกรอก', example: '12',
    hint: 'ต่ำกว่าเป้าหมายแต่ยังถึงค่านี้ = "ขายได้ แต่ Margin ต่ำ" / ต่ำกว่าค่านี้ = "ต่ำกว่าเกณฑ์" ต้องคุยหัวหน้า',
  },
  {
    key: 'floor_price', label: 'Floor Price', numeric: true,
    required: 'ควรกรอก', example: '2150',
    hint: 'ราคาต่อชิ้นต่ำสุดที่ยอมได้ เซลล์เสนอต่ำกว่านี้ = "ไม่ควรขาย" ทันที — เว้นว่างระบบถือเป็น 0 คือไม่มีเพดานล่าง',
  },
  {
    key: 'category', label: 'หมวดหมู่สินค้า',
    required: 'ไม่บังคับ', example: 'ตู้เย็น',
    hint: 'ข้อความอิสระ ใช้จัดกลุ่มสินค้าเวลาดูรายการ',
  },
]

// ช่องที่บัญชีต้องกรอกเอง (ไม่นับรหัส/ชื่อที่เติมมาให้) — ใช้ตัดสินว่าแถวไหน "ยังไม่ได้กรอก" แล้วข้ามไป
const COST_FILLABLE_KEYS = PRODUCT_COST_IMPORT_COLUMNS.filter(c => !c.locked).map(c => c.key)

// เขียนชีต "วิธีกรอก" — อธิบายทีละช่อง + สูตรที่ระบบใช้ + เกณฑ์ตัดสินสถานะ
// settings: [{ key, value }] จาก margin_settings เอามาโชว์ค่า buffer จริงที่ใช้อยู่ ไม่ใช่เลขที่ hardcode ไว้ในคำอธิบาย
function addCostHowToSheet(workbook, settings = []) {
  const val = (k, fallback) => settings.find(s => s.key === k)?.value ?? fallback
  const ship = val('shipping_buffer_percent', '2')
  const prov = val('provision_buffer_percent', '2')
  const defShip = val('default_shipping_cost', '0')

  const sheet = workbook.addWorksheet('วิธีกรอก')
  sheet.columns = [{ width: 22 }, { width: 14 }, { width: 78 }, { width: 16 }]

  const title = (text) => {
    const r = sheet.addRow([text])
    r.font = { bold: true, size: 12, color: { argb: 'FF1B315E' } }
    sheet.addRow([])
  }
  const line = (text) => sheet.addRow([text])

  title('วิธีกรอกไฟล์นำเข้าต้นทุนสินค้า')
  line('• กรอกเฉพาะแถวของสินค้าที่ต้องการ แถวไหนปล่อยว่างทั้งแถวระบบจะข้ามให้ ไม่ขึ้นเป็นข้อผิดพลาด')
  line('• แถวที่กรอกจะเขียนทับค่าเดิมของสินค้านั้น (ค่าที่เห็นอยู่ในไฟล์คือค่าปัจจุบันในระบบ แก้ทับได้เลย)')
  line('• กรอกเป็นตัวเลขล้วน ไม่ต้องใส่ลูกน้ำ ไม่ต้องใส่คำว่าบาท และไม่ต้องใส่เครื่องหมาย %')
  line('• คอลัมน์พื้นเทา (รหัสสินค้า / ชื่อสินค้า) ห้ามแก้ ระบบใช้จับคู่กับสินค้าในระบบ')
  sheet.addRow([])

  title('แต่ละช่องกรอกอย่างไร')
  const head = sheet.addRow(['ช่อง', 'ต้องกรอกไหม', 'กรอกอย่างไร', 'ตัวอย่าง'])
  head.font = { bold: true }
  head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } } })
  PRODUCT_COST_IMPORT_COLUMNS.forEach(c => {
    const r = sheet.addRow([c.label, c.required || '', c.hint || '', c.example || ''])
    r.getCell(3).alignment = { wrapText: true, vertical: 'top' }
    r.getCell(1).font = { bold: true }
  })
  sheet.addRow([])

  title('สูตรที่ระบบใช้คำนวณ')
  line('ยอดขายรวม       = ราคาที่เซลล์เสนอ × จำนวน')
  line(`Shipping Buffer  = ยอดขายรวม × ${ship}%`)
  line(`Provision Buffer = ยอดขายรวม × ${prov}%`)
  line('ต้นทุนรวม        = (ต้นทุน/ชิ้น × จำนวน) + ค่าขนส่งจริง + Shipping Buffer + Provision Buffer')
  line('กำไร             = ยอดขายรวม − ต้นทุนรวม')
  line('Margin (%)       = กำไร ÷ ยอดขายรวม × 100')
  sheet.addRow([])
  line(`หมายเหตุ: ค่าขนส่งจริงเซลล์เป็นคนกรอกตอนเช็คราคา ถ้าไม่กรอกระบบใช้ค่ามาตรฐาน ${defShip} บาท`)
  line('ค่า Buffer และค่าขนส่งมาตรฐานไม่มีในไฟล์นี้ ใช้ค่ากลางของระบบ ถ้าสินค้าตัวไหนต้องใช้ค่าเฉพาะ ตั้งได้ที่ปุ่ม "แก้ไข" ในหน้าต้นทุนสินค้า')
  sheet.addRow([])

  title('ระบบตัดสินสถานะอย่างไร (ไล่จากบนลงล่าง เจอข้อไหนก่อนใช้ข้อนั้น)')
  const head2 = sheet.addRow(['สถานะที่เซลล์เห็น', 'เงื่อนไข', 'แปลว่า'])
  head2.font = { bold: true }
  head2.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } } })
  const rules = [
    ['ไม่ควรขาย', 'ราคาที่เสนอ < Floor Price  หรือ  กำไร ≤ 0', 'ต่ำกว่าราคาขั้นต่ำหรือขาดทุน ไม่ควรเสนอ'],
    ['ผ่าน / ขายได้', 'Margin ≥ Margin เป้าหมาย', 'เสนอราคานี้ได้เลย'],
    ['ขายได้ แต่ Margin ต่ำ', 'Margin ≥ Margin ขั้นต่ำ (แต่ยังไม่ถึงเป้าหมาย)', 'ขายได้ แต่ควรดูจำนวนและเงื่อนไขก่อน'],
    ['ต่ำกว่าเกณฑ์', 'Margin < Margin ขั้นต่ำ (แต่ยังมีกำไรและไม่ต่ำกว่า Floor Price)', 'ยังมีกำไร แต่ต้องคุยหัวหน้าก่อนเสนอ'],
  ]
  rules.forEach(([a, b, c]) => {
    const r = sheet.addRow([a, b, c])
    r.getCell(1).font = { bold: true }
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' }
  })
  sheet.addRow([])

  title('ข้อควรระวัง')
  line('• Floor Price ไม่ควรต่ำกว่าต้นทุน/ชิ้น ไม่งั้นระบบจะยอมให้เสนอราคาที่ขาดทุนได้')
  line('• Margin ขั้นต่ำ ไม่ควรสูงกว่า Margin เป้าหมาย')
  line('• ถ้าเว้น Margin เป้าหมายและ Margin ขั้นต่ำไว้ ระบบถือเป็น 0 ทั้งคู่ เกือบทุกราคาจะขึ้นว่า "ผ่าน / ขายได้" — ควรกรอกเสมอ')
  line('• สินค้าที่ยังไม่มีต้นทุนจะไม่ขึ้นให้เซลล์เลือกในหน้าเช็คราคา')
  line('• เซลล์ไม่เห็นตัวเลขต้นทุนในไฟล์นี้และในระบบ เห็นแค่ Margin เป็นเปอร์เซ็นต์กับสถานะ')
}

// products: [{ id, code, name, category, cost }] จาก fetchProductCosts — เติมค่าเดิมที่เคยกรอกไว้ลงไปด้วย
// จะได้แก้ไขทับได้เลย ไม่ต้องกรอกใหม่ทั้งหมด (ไฟล์ที่โหลดออกไปคือสถานะปัจจุบันของระบบ)
export async function downloadProductCostTemplate(products = [], settings = []) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Template')
  sheet.columns = PRODUCT_COST_IMPORT_COLUMNS.map(c => ({ header: c.label, key: c.key, width: c.key === 'name' ? 34 : 20 }))
  sheet.getRow(1).font = { bold: true }
  // คำอธิบายสั้นๆ ติดหัวคอลัมน์ไว้ด้วย (เอาเมาส์ชี้แล้วเห็น) — รายละเอียดเต็มอยู่ในชีต "วิธีกรอก"
  PRODUCT_COST_IMPORT_COLUMNS.forEach((c, i) => {
    if (c.hint) sheet.getCell(1, i + 1).note = `${c.required || ''}\n${c.hint}`
  })

  products.forEach(p => {
    const c = p.cost || {}
    sheet.addRow({
      code: p.code,
      name: p.name,
      cost_price: c.cost_price ?? '',
      normal_selling_price: c.normal_selling_price ?? '',
      target_margin_percent: c.target_margin_percent ?? '',
      minimum_margin_percent: c.minimum_margin_percent ?? '',
      floor_price: c.floor_price ?? '',
      category: p.category ?? '',
    })
  })

  // รหัส/ชื่อสินค้าเป็นตัวจับคู่กับระบบ — ทำพื้นเทาไว้เป็นสัญญาณว่าไม่ต้องแก้ (ไม่ล็อกชีต กันไฟล์แก้ไขไม่ได้)
  ;[1, 2].forEach(col => {
    sheet.getColumn(col).eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F3F6' } }
    })
  })

  addCostHowToSheet(workbook, settings)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'template_นำเข้าต้นทุนสินค้า.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

// productsByCode: Map ของ 'รหัสสินค้าตัวพิมพ์เล็ก' -> { id, code, name } ใช้จับคู่แถวในไฟล์กับสินค้าจริง
// แถวที่ยังไม่ได้กรอกอะไรเลยจะถูกข้าม (ไม่นับเป็น error) เพราะ template แจกมาครบทุกสินค้า บัญชีมักกรอกทีละส่วน
export async function parseProductCostImportFile(file, productsByCode) {
  const rawRows = await readExcelRows(file)
  const labelToCol = {}
  PRODUCT_COST_IMPORT_COLUMNS.forEach(c => { labelToCol[c.label] = c })

  const seenInFile = new Set()
  const validRows = []
  const invalidRows = []
  let skipped = 0

  rawRows.forEach((raw, i) => {
    const row = {}
    Object.entries(raw).forEach(([label, value]) => {
      const col = labelToCol[label.trim()]
      if (col) row[col.key] = String(value ?? '').trim()
    })

    // ยังไม่ได้กรอกอะไรในแถวนี้เลย = ข้ามไปเงียบๆ
    if (COST_FILLABLE_KEYS.every(k => !row[k])) { skipped++; return }

    const errors = []
    const code = row.code || ''
    const normCode = code.toLowerCase()
    const product = normCode ? productsByCode.get(normCode) : null

    if (!code) errors.push('ไม่มีรหัสสินค้าในแถวนี้')
    else if (!product) errors.push('ไม่พบรหัสสินค้านี้ในระบบ (เพิ่มที่หน้าสินค้าก่อน)')
    else if (seenInFile.has(normCode)) errors.push('รหัสสินค้าซ้ำกันในไฟล์นี้')
    if (code) seenInFile.add(normCode)

    // ช่องตัวเลขเว้นว่างได้ (= ล้างค่าเดิม) แต่ถ้ากรอกมาต้องเป็นตัวเลขจริง — ยกเว้นต้นทุนที่บังคับ
    const nums = {}
    PRODUCT_COST_IMPORT_COLUMNS.filter(c => c.numeric).forEach(c => {
      const v = row[c.key]
      if (v === '' || v === undefined) { nums[c.key] = null; return }
      const n = Number(String(v).replace(/,/g, ''))
      if (isNaN(n)) errors.push(`${c.label} ต้องเป็นตัวเลข`)
      else nums[c.key] = n
    })
    if (nums.cost_price === null) errors.push('กรุณากรอกต้นทุน/ชิ้น')
    else if (nums.cost_price <= 0) errors.push('ต้นทุน/ชิ้น ต้องมากกว่า 0')

    if (errors.length) { invalidRows.push({ row: i + 2, errors, data: row }); return }

    validRows.push({
      product_id: product.id,
      code: product.code,
      name: product.name,
      cost: {
        cost_price: nums.cost_price,
        normal_selling_price: nums.normal_selling_price,
        target_margin_percent: nums.target_margin_percent,
        minimum_margin_percent: nums.minimum_margin_percent,
        floor_price: nums.floor_price,
        status: 'Active',
      },
      meta: { category: row.category || null },
    })
  })

  return { validRows, invalidRows, skipped }
}
