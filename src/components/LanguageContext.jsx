import { createContext, useContext, useEffect, useState } from 'react'

const LanguageContext = createContext(null)
const STORAGE_KEY = 'wt_lang'

// พจนานุกรมไทย -> อังกฤษ ของข้อความ UI ที่เขียนโค้ดไว้ตรงๆ เท่านั้น (ปุ่ม/ป้าย/หัวข้อ) — ไม่ใช่ข้อมูลที่ผู้ใช้กรอก/ตั้งค่าเอง
// เช่น ชื่อบริษัท, หมายเหตุ, ตัวเลือกใน picklists ที่ admin เพิ่มเอง ซึ่งแปลอัตโนมัติไม่ได้และคงเป็นภาษาที่กรอกไว้เสมอ
// แปลทีละส่วน — ข้อความที่ยังไม่มีในนี้จะโชว์เป็นภาษาไทยต่อไปตามปกติ (t() คืนค่าเดิมถ้าไม่พบคำแปล ไม่ error)
export const EN_DICT = {
  // ===== Sidebar =====
  'แดชบอร์ด': 'Dashboard',
  'ข้อมูลลูกค้า': 'Customers',
  'บริษัทลูกค้า': 'Companies',
  'ผู้ติดต่อ': 'Contacts',
  'การขาย': 'Sales',
  'ดีลการขาย': 'Deals',
  'ใบเสนอราคา': 'Quotations',
  'ออเดอร์': 'Orders',
  'ข้อมูลสินค้า': 'Products',
  'สินค้า': 'Products',
  'ติดตาม': 'Follow-up',
  'ประวัติการติดต่อ': 'Activity History',
  'งาน Follow-up': 'Follow-up Tasks',
  'การเงิน': 'Finance',
  'ตรวจสอบยอดโอน': 'Payment Review',
  'เอกสารบัญชี': 'Accounting Documents',
  'ผู้ดูแลระบบ': 'Admin',
  'ผู้ใช้งาน': 'Users',
  'ผู้ใช้งาน (Users)': 'Users',
  'ออกจากระบบ': 'Log out',
  'ออก': 'Log out',

  // ===== Common buttons/actions =====
  'แก้ไข': 'Edit',
  'ลบ': 'Delete',
  'บันทึก': 'Save',
  'ยกเลิก': 'Cancel',
  'ปิด': 'Close',
  'ยืนยัน': 'Confirm',
  'เพิ่ม': 'Add',
  'ค้นหา...': 'Search...',
  'ค้นหา': 'Search',
  'ส่งออกเป็น Excel': 'Export to Excel',
  'ส่งออกข้อมูล': 'Export',
  'นำเข้าจากไฟล์': 'Import from file',
  'ดูรายละเอียด': 'View details',
  'ดู': 'View',
  'ดู/แก้ไข': 'View/Edit',
  'การจัดการ': 'Actions',
  'สถานะ': 'Status',
  'ทุกสถานะ': 'All statuses',
  'วันที่': 'Date',
  'ถึง': 'to',
  'ล้าง': 'Clear',
  'กำลังโหลด...': 'Loading...',
  'ไม่มีข้อมูล': 'No data',
  'แจ้งเตือน': 'Notifications',
  'บริษัท': 'Company',
  'ลูกค้า': 'Customer',
  'มูลค่า': 'Value',
  'รวม': 'Total',
  'รายการ': 'items',
  'ดีล': 'deals',

  // ===== Dashboard =====
  'ภาพรวมการขาย': 'Sales Overview',
  'ยอดขายรวม': 'Total Sales',
  'จำนวนดีล': 'Number of Deals',
  'บริษัทลูกค้าทั้งหมด': 'Total Companies',
  'ต้องตามเก็บเงิน': 'Payments to Follow Up',
  'Pipeline การขาย': 'Sales Pipeline',

  // ===== Deals =====
  '+ เพิ่มดีล': '+ Add Deal',
  '+ เพิ่ม': '+ Add',
  'ยอดขายที่ปิดดีลสำเร็จ': 'Closed-Won Sales',
  'ยอดที่ต้องติดตาม': 'Amount to Follow Up',
  'รายวัน': 'Daily',
  'รายสัปดาห์': 'Weekly',
  'รายเดือน': 'Monthly',
  'ดีล / สินค้า': 'Deal / Product',
  'จัดการ': 'Actions',
  'ไม่ระบุวันที่': 'No date',
  'ออกใบเสนอราคา': 'Create Quotation',
  'วันที่คาดว่าปิดดีล': 'Expected Close Date',
  'วันที่ต้อง Follow up': 'Follow-up Date',

  // ===== Companies =====
  '+ เพิ่มบริษัท': '+ Add Company',
  'อุตสาหกรรม': 'Industry',
  'เบอร์โทร': 'Phone',
  'อีเมล': 'Email',
  'ประเภทลูกค้า': 'Customer Type',
  'ทุกประเภท': 'All Types',
  'ทุกอุตสาหกรรม': 'All Industries',
  'ชื่อบริษัท': 'Company Name',
  'โทรศัพท์': 'Phone',
  'ผู้รับผิดชอบ': 'Owner',
  'บุคคล': 'Individual',
  'ยังไม่มีข้อมูลบริษัท': 'No companies yet',

  // ===== Dashboard =====
  'บริษัท Active': 'Active Companies',
  'ดีลที่ดำเนินการ': 'Open Deals',
  'ปิดดีลสำเร็จ': 'Closed Won',
  'วันปิด': 'Close Date',
  'งานเกินกำหนด': 'Overdue Tasks',
  'งาน': 'Task',
  'ครบกำหนด': 'Due Date',
  'ลำดับ': 'Priority',
  'ต้องตามเก็บเงิน (ลูกค้าเครดิต)': 'Payments to Follow Up (Credit Customers)',
  'ตั้งแต่': 'From',
  'ไม่มีข้อมูลในช่วงที่เลือก': 'No data in the selected range',
  'กดเพื่อดูรายละเอียด': 'Click for details',
  'Pipeline': 'Pipeline',
  'Top Deals': 'Top Deals',
  'ดูทั้งหมด': 'View all',
  'กิจกรรมล่าสุด': 'Recent Activities',
  'ยังไม่มีกิจกรรม': 'No activities yet',
  'งานที่ต้องทำ (14 วัน)': 'Tasks Due (14 Days)',
  'ไม่มีงานใน 14 วัน': 'No tasks in the next 14 days',
  'ยังไม่มีดีล': 'No deals yet',
  'โดย': 'by',

  // ===== Quotations =====
  '+ สร้างใบเสนอราคา': '+ Create Quotation',
  'เลขที่': 'No.',
  'หัวข้อ': 'Subject',
  'ประเภท': 'Type',
  'ทุกประเภทลูกค้า': 'All Customer Types',
  'ลูกค้าธรรมดา': 'Cash Customer',
  'ลูกค้าเครดิต': 'Credit Customer',
  'คัดลอก': 'Copy',
  'สร้างดีล': 'Create Deal',
  'ธรรมดา': 'Normal',
  'ยังไม่มีใบเสนอราคา': 'No quotations yet',
  'คัดลอกเป็นใบเสนอราคาใหม่': 'Copy as a new quotation',

  // ===== Orders =====
  '+ สร้างออเดอร์': '+ Create Order',
  'สร้างออเดอร์': 'Create Order',
  'เลขที่ออเดอร์': 'Order No.',
  'เลขที่ใบเสนอราคา': 'Quotation No.',
  'เซลล์': 'Sales Rep',
  'วันที่สร้าง': 'Created Date',
  'ใช้งานอยู่': 'Active',
  'ยกเลิกแล้ว': 'Cancelled',
  'ขอตรวจยอด': 'Request Payment Review',
  'เปิดออเดอร์แล้ว': 'Order Opened',
  'เสร็จสิ้น': 'Completed',
  'อัพเดท': 'Updated',
  'ประเภทออเดอร์': 'Order Type',
  'สินค้าปกติ (WT)': 'Normal Goods (WT)',
  'สินค้า Grade B (GB)': 'Grade B Goods (GB)',
  'เลขที่ออเดอร์ (โดยประมาณ)': 'Order No. (estimated)',
  'รายการสินค้า': 'Line Items',
  'จำนวน': 'Qty',
  'ราคา/หน่วย': 'Unit Price',
  '+ เพิ่มรายการ': '+ Add Item',
  'ที่อยู่จัดส่ง': 'Shipping Address',
  'ที่อยู่สำหรับจัดส่งสินค้า': 'Shipping Address',
  'ชื่อผู้รับ (ถ้ามี)': 'Recipient Name (optional)',
  'เบอร์โทรผู้รับ (ถ้ามี)': 'Recipient Phone (optional)',
  'หมายเหตุ': 'Remark',
  'บันทึกออเดอร์': 'Save Order',
  'เซลล์ผู้เปิดออเดอร์': 'Order Created By',
  'เลขออเดอร์': 'Order No.',
  'เลขใบเสนอราคา': 'Quotation No.',
  'ยอดรวม': 'Total',
  'ยังไม่มีออเดอร์': 'No orders yet',
  'ดูรายละเอียด': 'View details',
  'แสดงเฉพาะใบเสนอราคาที่ยังไม่ถูกใช้เปิดออเดอร์อื่น': 'Only showing quotations not yet used for another order',
  'เลขประจำตัวผู้เสียภาษี': 'Tax ID',
  'ที่อยู่': 'Address',
  'โทร': 'Tel',
  'สินค้า / รายการ': 'Product / Item',
  'ไม่รวม VAT': 'Excl. VAT',
  'รวมทั้งสิ้น': 'Grand Total',
  'เหตุผลที่ยกเลิก': 'Cancellation Reason',
  'เหตุผลที่ยกเลิกออเดอร์': 'Reason for Cancelling Order',
  'ไม่ยกเลิก': "Don't Cancel",
  'ยืนยันยกเลิกออเดอร์': 'Confirm Cancel Order',
  'กำลังยกเลิก...': 'Cancelling...',
  'ยกเลิกออเดอร์': 'Cancel Order',
  'ผู้รับ': 'Recipient',
  'โทรศัพท์บริษัท': 'Company Phone',
  'อีเมลบริษัท': 'Company Email',
  'ที่อยู่บริษัท': 'Company Address',
  'กำลังบันทึก...': 'Saving...',
  'กรุณาระบุเหตุผลที่ยกเลิก': 'Please specify a cancellation reason',
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) || 'th' } catch { return 'th' }
  })
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* noop: private mode ฯลฯ */ }
  }, [lang])

  const t = (th) => (lang === 'en' ? (EN_DICT[th] || th) : th)

  return <LanguageContext.Provider value={{ lang, setLang, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  return useContext(LanguageContext)
}
