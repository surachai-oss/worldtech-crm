import ExcelJS from 'exceljs'
import { POSITION_OPTIONS, BUSINESS_TYPE_OPTIONS, PURCHASE_REASON_OPTIONS } from './leadOptions'

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

export const exportLeadsToExcel = (rows) =>
  exportRowsToExcel(LEAD_EXPORT_COLUMNS, rows.map(r => ({
    ...r,
    created_at: (r.created_at || '').slice(0, 10),
    appliance_interest: r.appliance_interest?.length ? r.appliance_interest.join(', ') : (r.interested_product || '')
  })), 'ผู้ติดต่อ.xlsx')

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
