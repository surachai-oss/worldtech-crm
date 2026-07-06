import Papa from 'papaparse'

// ===== นำเข้าบริษัทลูกค้าจากไฟล์ CSV (เปิด/แก้ไขได้ปกติใน Excel — บันทึกเป็น .csv ก่อนอัปโหลด) =====
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

const EXAMPLE_ROW = {
  name: 'บริษัท ตัวอย่าง จำกัด', industry: 'เทคโนโลยี', phone: '02-xxx-xxxx',
  email: 'contact@example.com', website: 'https://www.example.com', address: 'ที่อยู่ตัวอย่าง',
  status: 'Active', owner: 'ชื่อผู้รับผิดชอบ', lead_source: '', note: ''
}

export function downloadCompanyTemplate() {
  const headers = COMPANY_IMPORT_COLUMNS.map(c => c.label)
  const csv = Papa.unparse({ fields: headers, data: [COMPANY_IMPORT_COLUMNS.map(c => EXAMPLE_ROW[c.key] || '')] })
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'template_นำเข้าบริษัทลูกค้า.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// คืนค่า { validRows, invalidRows } — invalidRows มี { row, errors, data } สำหรับแสดงผลพรีวิว
export function parseCompanyImportFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const labelToKey = {}
        COMPANY_IMPORT_COLUMNS.forEach(c => { labelToKey[c.label] = c.key })

        const validRows = []
        const invalidRows = []
        result.data.forEach((raw, i) => {
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
        resolve({ validRows, invalidRows })
      },
      error: (err) => reject(err)
    })
  })
}

// ===== นำเข้าผู้ติดต่อจากไฟล์ CSV (เช่น ลูกค้าที่กรอกฟอร์มเข้ามาจากเฟซบุ๊ก/เว็บไซต์) =====
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

export function downloadContactTemplate() {
  const headers = CONTACT_IMPORT_COLUMNS.map(c => c.label)
  const csv = Papa.unparse({ fields: headers, data: [CONTACT_IMPORT_COLUMNS.map(c => CONTACT_EXAMPLE_ROW[c.key] || '')] })
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'template_นำเข้าผู้ติดต่อ.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// companiesByName: Map ของ "ชื่อบริษัท normalize แล้ว (trim + lowercase)" -> company id
// ใช้จับคู่คอลัมน์ "ชื่อบริษัท" ในไฟล์กับบริษัทที่มีอยู่จริงในระบบ
export function parseContactImportFile(file, companiesByName) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const labelToKey = {}
        CONTACT_IMPORT_COLUMNS.forEach(c => { labelToKey[c.label] = c.key })

        const validRows = []
        const invalidRows = []
        result.data.forEach((raw, i) => {
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
        resolve({ validRows, invalidRows })
      },
      error: (err) => reject(err)
    })
  })
}
