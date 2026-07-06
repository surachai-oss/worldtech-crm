import Papa from 'papaparse'
import { CONSTANTS } from './api'

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
  name: 'บริษัท ตัวอย่าง จำกัด', industry: CONSTANTS.INDUSTRIES[0], phone: '02-xxx-xxxx',
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
