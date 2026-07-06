import ExcelJS from 'exceljs'

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

// สร้างไฟล์ Excel template (แถวหัวคอลัมน์ตัวหนา + ตัวอย่าง 1 แถว) แล้วดาวน์โหลดให้ผู้ใช้
export async function downloadExcelTemplate(columns, exampleRow, filename) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Template')
  sheet.columns = columns.map(c => ({ header: c.label, key: c.key, width: 24 }))
  sheet.getRow(1).font = { bold: true }
  sheet.addRow(exampleRow)
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
  { key: 'industry', label: 'อุตสาหกรรม' },
  { key: 'phone', label: 'โทรศัพท์' },
  { key: 'email', label: 'อีเมล' },
  { key: 'website', label: 'เว็บไซต์' },
  { key: 'address', label: 'ที่อยู่' },
  { key: 'status', label: 'สถานะ' },
  { key: 'owner', label: 'ผู้รับผิดชอบ' },
  { key: 'lead_source', label: 'ที่มา' },
  { key: 'note', label: 'หมายเหตุ' },
]

const COMPANY_EXAMPLE_ROW = {
  name: 'บริษัท ตัวอย่าง จำกัด', industry: 'เทคโนโลยี', phone: '02-xxx-xxxx',
  email: 'contact@example.com', website: 'https://www.example.com', address: 'ที่อยู่ตัวอย่าง',
  status: 'Active', owner: 'ชื่อผู้รับผิดชอบ', lead_source: '', note: ''
}

export const downloadCompanyTemplate = () =>
  downloadExcelTemplate(COMPANY_IMPORT_COLUMNS, COMPANY_EXAMPLE_ROW, 'template_นำเข้าบริษัทลูกค้า.xlsx')

// คืนค่า { validRows, invalidRows } — invalidRows มี { row, errors, data } สำหรับแสดงผลพรีวิว
export async function parseCompanyImportFile(file) {
  const rawRows = await readExcelRows(file)
  const labelToKey = {}
  COMPANY_IMPORT_COLUMNS.forEach(c => { labelToKey[c.label] = c.key })

  const validRows = []
  const invalidRows = []
  rawRows.forEach((raw, i) => {
    const row = {}
    Object.entries(raw).forEach(([label, value]) => {
      const key = labelToKey[label.trim()]
      if (key) row[key] = (value || '').trim()
    })
    const errors = []
    if (!row.name) errors.push('กรุณากรอกชื่อบริษัท')
    if (errors.length) invalidRows.push({ row: i + 2, errors, data: row })
    else validRows.push(row)
  })
  return { validRows, invalidRows }
}

// ===== นำเข้าผู้ติดต่อจากไฟล์ Excel (เช่น ลูกค้าที่กรอกฟอร์มเข้ามาจากเฟซบุ๊ก/เว็บไซต์) =====
// ต้องระบุ "ชื่อบริษัท" ให้ตรงกับบริษัทที่มีอยู่ในระบบเป๊ะ เพราะต้องแม็ปเป็น company_id (FK)
export const CONTACT_IMPORT_COLUMNS = [
  { key: 'company_name', label: 'ชื่อบริษัท', required: true },
  { key: 'full_name', label: 'ชื่อ-นามสกุล', required: true },
  { key: 'position', label: 'ตำแหน่ง' },
  { key: 'department', label: 'แผนก' },
  { key: 'phone', label: 'โทรศัพท์' },
  { key: 'email', label: 'อีเมล' },
  { key: 'line_id', label: 'Line ID' },
  { key: 'note', label: 'หมายเหตุ' },
]

const CONTACT_EXAMPLE_ROW = {
  company_name: 'บริษัท ตัวอย่าง จำกัด', full_name: 'สมชาย ใจดี', position: 'ผู้จัดการฝ่ายจัดซื้อ',
  department: 'จัดซื้อ', phone: '08x-xxx-xxxx', email: 'contact@example.com', line_id: '', note: ''
}

export const downloadContactTemplate = () =>
  downloadExcelTemplate(CONTACT_IMPORT_COLUMNS, CONTACT_EXAMPLE_ROW, 'template_นำเข้าผู้ติดต่อ.xlsx')

// companiesByName: Map ของ "ชื่อบริษัท normalize แล้ว (trim + lowercase)" -> company id
// ใช้จับคู่คอลัมน์ "ชื่อบริษัท" ในไฟล์กับบริษัทที่มีอยู่จริงในระบบ
export async function parseContactImportFile(file, companiesByName) {
  const rawRows = await readExcelRows(file)
  const labelToKey = {}
  CONTACT_IMPORT_COLUMNS.forEach(c => { labelToKey[c.label] = c.key })

  const validRows = []
  const invalidRows = []
  rawRows.forEach((raw, i) => {
    const row = {}
    Object.entries(raw).forEach(([label, value]) => {
      const key = labelToKey[label.trim()]
      if (key) row[key] = (value || '').trim()
    })
    const errors = []
    if (!row.full_name) errors.push('กรุณากรอกชื่อ-นามสกุล')
    if (!row.company_name) errors.push('กรุณากรอกชื่อบริษัท')
    const companyId = companiesByName.get((row.company_name || '').toLowerCase())
    if (row.company_name && !companyId) errors.push('ไม่พบบริษัทนี้ในระบบ (ชื่อต้องตรงกับที่มีอยู่)')
    if (errors.length) { invalidRows.push({ row: i + 2, errors, data: row }); return }
    const rest = { ...row }
    delete rest.company_name
    validRows.push({ ...rest, company_id: companyId })
  })
  return { validRows, invalidRows }
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
