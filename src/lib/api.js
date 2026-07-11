import { supabase } from '../supabaseClient'

// ===== CONSTANTS (ค่าคงที่ระบบที่ไม่ให้ผู้ใช้แก้เอง) =====
// รายการ dropdown อื่นๆ (สถานะ, stage, ประเภท ฯลฯ) ย้ายไปเป็น picklists ที่แก้ไขได้ในแอปแล้ว — ดู PicklistsContext
export const CONSTANTS = {
  ROLES: ['admin', 'sale', 'finance'],
}

// สถานะของคำขอตรวจยอด (payment_requests.status) — workflow คงที่ ไม่ใช่ picklist ที่แก้เองได้
export const PAYMENT_STATUS = {
  DRAFT: 'Draft',
  PENDING: 'Pending Finance Review',
  NEED_INFO: 'Need More Info',
  MISMATCH: 'Payment Mismatch',
  REJECTED: 'Rejected',
  APPROVED: 'Approved to Create Order',
  ORDER_CREATED: 'Order Created',
}
export const PAYMENT_STATUS_LIST = Object.values(PAYMENT_STATUS)

function handle(res) {
  if (res.error) throw res.error
  return res.data
}

// escape ตัวอักษรที่ทำให้ query string ของ supabase (.or/.ilike) พังได้
function safeLike(q) {
  return (q || '').replace(/[%,()]/g, '').trim()
}

// แปลงวันที่จาก <input type="date"> (สตริงตามเวลาเครื่อง) เป็นขอบเขต ISO ที่ครอบทั้งวันนั้นตามเวลาเครื่อง
// ใช้กรองคอลัมน์ timestamptz (มีเวลาด้วย) ให้ตรงกับ "วันที่" ตามเวลาเครื่องจริงๆ ไม่ใช่ตามเที่ยงคืน UTC (ต่างจาก column แบบ date เฉยๆ ที่เทียบสตริงตรงๆได้)
function dateRangeToIso(dateFrom, dateTo) {
  return {
    fromIso: dateFrom ? new Date(dateFrom + 'T00:00:00').toISOString() : null,
    toIso: dateTo ? new Date(dateTo + 'T23:59:59.999').toISOString() : null,
  }
}

// ===== BULK LOAD (ใช้กับ Dashboard, ค้นหาส่วนกลาง, และหน้ารายละเอียดบริษัท) =====
export async function getAllData() {
  const [companies, contacts, deals, activities, tasks, quotations] = await Promise.all([
    supabase.from('companies').select('*').order('created_at', { ascending: false }).then(handle),
    supabase.from('contacts').select('*').order('created_at', { ascending: false }).then(handle),
    supabase.from('deals').select('*').order('created_at', { ascending: false }).then(handle),
    supabase.from('activities').select('*').order('activity_date', { ascending: false }).then(handle),
    supabase.from('tasks').select('*').order('due_date', { ascending: true }).then(handle),
    supabase.from('quotations').select('*, product:products(id,code,name,image_path)').order('created_at', { ascending: false }).then(handle),
  ])
  return { companies, contacts, deals, activities, tasks, quotations }
}

// ===== PAGINATION (ใช้กับหน้ารายการแบบแยกหน้า ไม่โหลดทั้งหมดทีเดียว) =====
export const PAGE_SIZE = 20

function range(page) {
  const from = page * PAGE_SIZE
  return [from, from + PAGE_SIZE - 1]
}

export async function fetchCompaniesPage({ page = 0, q = '', status = '', industry = '', customerType = '' } = {}) {
  let query = supabase.from('companies').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  const sq = safeLike(q)
  if (sq) query = query.or(`name.ilike.%${sq}%,phone.ilike.%${sq}%,email.ilike.%${sq}%`)
  if (status) query = query.eq('status', status)
  if (industry) query = query.eq('industry', industry)
  if (customerType) query = query.eq('customer_type', customerType)
  const { data, error, count } = await query.range(...range(page))
  if (error) throw error
  return { rows: data, count, pageSize: PAGE_SIZE }
}

export async function fetchActivitiesPage({ page = 0, type = '' } = {}) {
  let query = supabase.from('activities').select('*, company:companies(id,name,created_by)', { count: 'exact' }).order('activity_date', { ascending: false })
  if (type) query = query.eq('type', type)
  const { data, error, count } = await query.range(...range(page))
  if (error) throw error
  return { rows: data, count, pageSize: PAGE_SIZE }
}

export async function fetchTaskCounts() {
  const today = new Date().toISOString().slice(0, 10)
  const [pending, overdue, done] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'รอดำเนินการ'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'เสร็จสิ้น').lt('due_date', today),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'เสร็จสิ้น'),
  ])
  return { pending: pending.count || 0, overdue: overdue.count || 0, done: done.count || 0 }
}

export async function fetchTasksPage({ page = 0, status = '', priority = '', q = '' } = {}) {
  let query = supabase.from('tasks').select('*, company:companies(id,name)', { count: 'exact' }).order('due_date', { ascending: true })
  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  const sq = safeLike(q)
  if (sq) query = query.ilike('subject', `%${sq}%`)
  const { data, error, count } = await query.range(...range(page))
  if (error) throw error
  return { rows: data, count, pageSize: PAGE_SIZE }
}

// creditType: '' = ทั้งหมด, 'credit' = เฉพาะที่มี credit_term (ลูกค้าเครดิต), 'normal' = ที่ credit_term ว่าง (ลูกค้าธรรมดา/เงินสด)
export async function fetchQuotationsTotal({ status = '', q = '', dateFrom = '', dateTo = '', creditType = '' } = {}) {
  let query = supabase.from('quotations').select('value')
  if (status) query = query.eq('status', status)
  if (creditType === 'credit') query = query.not('credit_term', 'is', null)
  else if (creditType === 'normal') query = query.is('credit_term', null)
  const sq = safeLike(q)
  if (sq) query = query.or(`subject.ilike.%${sq}%,quot_no.ilike.%${sq}%`)
  if (dateFrom) query = query.gte('quot_date', dateFrom)
  if (dateTo) query = query.lte('quot_date', dateTo)
  const { data, error } = await query
  if (error) throw error
  return data.reduce((s, x) => s + (Number(x.value) || 0), 0)
}

export async function fetchQuotationsPage({ page = 0, status = '', q = '', dateFrom = '', dateTo = '', creditType = '' } = {}) {
  let query = supabase.from('quotations').select('*, company:companies(id,name,address,tax_id,phone,created_by,credit_term), product:products(id,code,name,image_path)', { count: 'exact' }).order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  if (creditType === 'credit') query = query.not('credit_term', 'is', null)
  else if (creditType === 'normal') query = query.is('credit_term', null)
  const sq = safeLike(q)
  if (sq) query = query.or(`subject.ilike.%${sq}%,quot_no.ilike.%${sq}%`)
  if (dateFrom) query = query.gte('quot_date', dateFrom)
  if (dateTo) query = query.lte('quot_date', dateTo)
  const { data, error, count } = await query.range(...range(page))
  if (error) throw error
  return { rows: data, count, pageSize: PAGE_SIZE }
}

// สรุปจำนวน+มูลค่าใบเสนอราคาแยกตามสถานะ (ไม่กรองด้วย status เอง เพราะต้องการเห็นทุกสถานะพร้อมกัน)
// คืนค่าเป็น { [status]: { count, total } }
export async function fetchQuotationsSummary({ q = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase.from('quotations').select('status, value')
  const sq = safeLike(q)
  if (sq) query = query.or(`subject.ilike.%${sq}%,quot_no.ilike.%${sq}%`)
  if (dateFrom) query = query.gte('quot_date', dateFrom)
  if (dateTo) query = query.lte('quot_date', dateTo)
  const { data, error } = await query
  if (error) throw error
  const byStatus = {}
  data.forEach(r => {
    const s = (byStatus[r.status] ||= { count: 0, total: 0 })
    s.count++
    s.total += Number(r.value) || 0
  })
  return byStatus
}

// ===== COMPANIES =====
export const addCompany = (d) => supabase.from('companies').insert(d).select().single().then(handle)
export const updateCompany = (id, d) => supabase.from('companies').update(d).eq('id', id).select().single().then(handle)
export const deleteCompany = (id) => supabase.from('companies').delete().eq('id', id).then(handle)
export const bulkImportCompanies = (rows) => supabase.from('companies').insert(rows).select().then(handle)
// ใช้ตรวจชื่อบริษัทซ้ำตอนนำเข้าไฟล์ Excel — คืน Map ของชื่อ (normalize) -> id
export async function listCompanyNamesMap() {
  const rows = await supabase.from('companies').select('id, name').then(handle)
  const map = new Map()
  rows.forEach(r => map.set((r.name || '').trim().toLowerCase(), r.id))
  return map
}

// ===== PICKLISTS (dropdown ที่แก้ไข/เพิ่ม/ลบตัวเลือกได้เองในแอป — แบบเดียวกับ dropdown list ใน Google Sheets) =====
export async function getAllPicklists() {
  const rows = await supabase.from('picklists').select('*')
    .order('sort_order', { ascending: true }).order('value', { ascending: true }).then(handle)
  const grouped = {}
  rows.forEach(r => { (grouped[r.list_key] ||= []).push(r) })
  return grouped
}
export const addPicklistValue = (listKey, value) =>
  supabase.from('picklists').insert({ list_key: listKey, value }).select().single().then(handle)
export const deletePicklistValue = (id) => supabase.from('picklists').delete().eq('id', id).then(handle)

// ===== CONTACTS =====
export const addContact = (d) => supabase.from('contacts').insert(d).select().single().then(handle)
export const updateContact = (id, d) => supabase.from('contacts').update(d).eq('id', id).select().single().then(handle)
export const deleteContact = (id) => supabase.from('contacts').delete().eq('id', id).then(handle)
// ===== ACTIVITIES =====
export const addActivity = (d) => supabase.from('activities').insert(d).select().single().then(handle)
export const deleteActivity = (id) => supabase.from('activities').delete().eq('id', id).then(handle)

// ===== DEALS =====
export const addDeal = (d) => supabase.from('deals').insert(d).select().single().then(handle)
export const updateDeal = (id, d) => supabase.from('deals').update(d).eq('id', id).select().single().then(handle)
export const deleteDeal = (id) => supabase.from('deals').delete().eq('id', id).then(handle)
export const updateDealStage = (id, stage) => updateDeal(id, { stage })

// ===== DEAL ITEMS (รายการสินค้าในดีล) =====
// unit_price ที่กรอกในฟอร์มถือว่ารวม VAT แล้ว — มูลค่ารวมของดีลคำนวณจากรายการเหล่านี้เสมอ ไม่ให้กรอกเอง
export const VAT_RATE = 0.07

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

// items: [{ quantity, unit_price }] -> { subtotalIncVat, exVat, vatAmount } (ทุกค่ารวม VAT อยู่แล้วในราคาต่อหน่วย)
export function computeDealTotals(items) {
  const subtotalIncVat = round2((items || []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0))
  const exVat = round2(subtotalIncVat / (1 + VAT_RATE))
  const vatAmount = round2(subtotalIncVat - exVat)
  return { subtotalIncVat, exVat, vatAmount }
}

export const listDealItems = (dealId) =>
  supabase.from('deal_items').select('*, product:products(id,code,name)').eq('deal_id', dealId)
    .order('sort_order', { ascending: true }).then(handle)

// สร้างดีล + รายการสินค้าในทีเดียว — มูลค่ารวม (value) คำนวณจาก items ให้อัตโนมัติ
export async function addDealWithItems(dealFields, items) {
  const totals = computeDealTotals(items)
  const deal = await addDeal({ ...dealFields, value: totals.subtotalIncVat })
  if (items?.length) {
    const rows = items.map((it, i) => ({
      deal_id: deal.id, product_id: it.product_id, description: it.description, quantity: it.quantity, unit_price: it.unit_price, sort_order: i
    }))
    await supabase.from('deal_items').insert(rows).then(handle)
  }
  return deal
}

// แก้ไขดีล — ลบรายการเดิมทั้งหมดแล้วใส่ชุดใหม่ทั้งหมด (ง่ายกว่า diff รายแถว และจำนวนรายการต่อดีลน้อยอยู่แล้ว)
export async function updateDealWithItems(id, dealFields, items) {
  const totals = computeDealTotals(items)
  const deal = await updateDeal(id, { ...dealFields, value: totals.subtotalIncVat })
  await supabase.from('deal_items').delete().eq('deal_id', id).then(handle)
  if (items?.length) {
    const rows = items.map((it, i) => ({
      deal_id: id, product_id: it.product_id, description: it.description, quantity: it.quantity, unit_price: it.unit_price, sort_order: i
    }))
    await supabase.from('deal_items').insert(rows).then(handle)
  }
  return deal
}

// ===== PRODUCTS (รายการสินค้า สำหรับเลือกในรายการของดีล) =====
export const listProducts = () => supabase.from('products').select('*').order('code', { ascending: true }).then(handle)
export const addProduct = (d) => supabase.from('products').insert(d).select().single().then(handle)
export const updateProduct = (id, d) => supabase.from('products').update(d).eq('id', id).select().single().then(handle)
export const deleteProduct = (id) => supabase.from('products').delete().eq('id', id).then(handle)
export const bulkImportProducts = (rows) => supabase.from('products').insert(rows).select().then(handle)

// ===== รูปสินค้า (Supabase Storage bucket "product-images" — public ต่างจาก "attachments") =====
export const PRODUCT_IMAGES_BUCKET = 'product-images'

// bucket เป็น public เลยได้ URL ตรงๆ ไม่ต้องขอ signed URL แบบ attachments
export function getProductImageUrl(imagePath) {
  if (!imagePath) return null
  return supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(imagePath).data.publicUrl
}

export async function uploadProductImage(productId, file) {
  if (file.size > MAX_ATTACHMENT_SIZE) throw new Error('ไฟล์ใหญ่เกิน 20MB')
  const safeName = file.name.replace(/[^\w.\-ก-๙ ]/g, '_')
  const path = `${productId}/${Date.now()}_${safeName}`
  const { error: upErr } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, file)
  if (upErr) throw upErr
  return updateProduct(productId, { image_path: path })
}

export async function deleteProductImage(productId, imagePath) {
  if (imagePath) await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([imagePath])
  return updateProduct(productId, { image_path: null })
}

// ===== TASKS =====
export const addTask = (d) => supabase.from('tasks').insert(d).select().single().then(handle)
export const updateTask = (id, d) => supabase.from('tasks').update(d).eq('id', id).select().single().then(handle)
export const deleteTask = (id) => supabase.from('tasks').delete().eq('id', id).then(handle)
export const completeTask = (id) => updateTask(id, { status: 'เสร็จสิ้น' })

// ===== QUOTATIONS =====
async function genQuotNo() {
  const { data, error } = await supabase.rpc('gen_quot_no')
  if (error) throw error
  return data
}
export const updateQuotation = (id, d) => supabase.from('quotations').update(d).eq('id', id).select().single().then(handle)
export const updateQuotationStatus = (id, status) => updateQuotation(id, { status })
export const updateQuotationPaymentStatus = (id, payment_status) => updateQuotation(id, { payment_status })
export const deleteQuotation = (id) => supabase.from('quotations').delete().eq('id', id).then(handle)

// ใบเสนอราคาที่ยังไม่ชำระและมีวันครบกำหนดชำระแล้ว — ใช้ทำสรุปเตือนตามเก็บเงินในหน้าใบเสนอราคา (ดู payment_due_date/payment_status)
// select ทุกคอลัมน์ (ไม่ใช่แค่ที่โชว์ในสรุป) เพราะแถวนี้ถูกส่งตรงให้ onEdit เปิด QuotationModal ได้ — ถ้า select บางคอลัมน์ ฟิลด์ที่ขาดจะโดนรีเซ็ตเป็นค่า default ตอนบันทึกทับ
export async function fetchPendingPayments() {
  const { data, error } = await supabase.from('quotations')
    .select('*, company:companies(id,name)')
    .eq('payment_status', 'ยังไม่ชำระ')
    .not('payment_due_date', 'is', null)
    .order('payment_due_date', { ascending: true })
  if (error) throw error
  return data
}

// ===== QUOTATION ITEMS (รายการสินค้าในใบเสนอราคา — ใบเสนอราคาหนึ่งมีได้หลายรายการ เหมือนดีล) =====
// ใช้ computeDealTotals ตัวเดียวกันกับดีล เพราะสูตรคิด VAT เหมือนกัน (unit_price รวม VAT แล้ว)
export const listQuotationItems = (quotationId) =>
  supabase.from('quotation_items').select('*, product:products(id,code,name,image_path)').eq('quotation_id', quotationId)
    .order('sort_order', { ascending: true }).then(handle)

// สร้างใบเสนอราคา + รายการสินค้าในทีเดียว — value คำนวณจาก items ให้อัตโนมัติ
export async function addQuotationWithItems(fields, items) {
  const totals = computeDealTotals(items)
  const quot_no = await genQuotNo()
  const quot = await supabase.from('quotations').insert({ ...fields, quot_no, value: totals.subtotalIncVat }).select().single().then(handle)
  if (items?.length) {
    const rows = items.map((it, i) => ({
      quotation_id: quot.id, product_id: it.product_id, description: it.description, quantity: it.quantity, unit_price: it.unit_price, sort_order: i
    }))
    await supabase.from('quotation_items').insert(rows).then(handle)
  }
  return quot
}

// แก้ไขใบเสนอราคา — ลบรายการเดิมทั้งหมดแล้วใส่ชุดใหม่ทั้งหมด (แบบเดียวกับดีล)
export async function updateQuotationWithItems(id, fields, items) {
  const totals = computeDealTotals(items)
  const quot = await updateQuotation(id, { ...fields, value: totals.subtotalIncVat })
  await supabase.from('quotation_items').delete().eq('quotation_id', id).then(handle)
  if (items?.length) {
    const rows = items.map((it, i) => ({
      quotation_id: id, product_id: it.product_id, description: it.description, quantity: it.quantity, unit_price: it.unit_price, sort_order: i
    }))
    await supabase.from('quotation_items').insert(rows).then(handle)
  }
  return quot
}

// ไฟล์ใบเสนอราคาที่ลูกค้าเซ็นแล้วส่งกลับมา — เก็บใน bucket "attachments" เดียวกับเอกสารแนบอื่น
// ใช้ quotations.file_url เป็น path ในไฟล์แนบ (คอลัมน์เดิมที่มีอยู่แล้วแต่ไม่เคยใช้งาน) + signed_file_name เก็บชื่อไฟล์เดิมไว้แสดงผล
export async function uploadSignedQuotation(quotationId, file) {
  if (file.size > MAX_ATTACHMENT_SIZE) throw new Error('ไฟล์ใหญ่เกิน 20MB')
  const safeName = file.name.replace(/[^\w.\-ก-๙ ]/g, '_')
  const path = `signed-quotations/${quotationId}/${Date.now()}_${safeName}`
  const { error: upErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file)
  if (upErr) throw upErr
  return supabase.from('quotations').update({ file_url: path, signed_file_name: file.name })
    .eq('id', quotationId).select().single().then(handle)
}

export async function deleteSignedQuotation(quotationId, filePath) {
  await supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath])
  return supabase.from('quotations').update({ file_url: null, signed_file_name: null })
    .eq('id', quotationId).select().single().then(handle)
}

// ===== ATTACHMENTS (Supabase Storage bucket "attachments") =====
export const ATTACHMENTS_BUCKET = 'attachments'
export const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024 // 20MB

export async function listAttachments(companyId) {
  return supabase.from('attachments').select('*').eq('company_id', companyId)
    .order('created_at', { ascending: false }).then(handle)
}

export async function uploadAttachment(companyId, file, uploadedBy) {
  if (file.size > MAX_ATTACHMENT_SIZE) throw new Error('ไฟล์ใหญ่เกิน 20MB')
  // Supabase Storage ปฏิเสธ key ที่มีอักขระไทย/เว้นวรรค ("Invalid key") ต้องใช้แค่ ASCII สำหรับ path จริง
  // ชื่อไฟล์เดิม (รวมภาษาไทย) เก็บแยกไว้ที่คอลัมน์ file_name เพื่อโชว์ในหน้าเว็บ ไม่กระทบ
  const safeName = file.name.replace(/[^\w.-]/g, '_')
  const path = `${companyId}/${Date.now()}_${safeName}`
  const { error: upErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file)
  if (upErr) throw upErr
  return supabase.from('attachments').insert({
    company_id: companyId, file_name: file.name, file_path: path,
    file_size: file.size, mime_type: file.type, uploaded_by: uploadedBy
  }).select().single().then(handle)
}

export async function getAttachmentUrl(filePath) {
  const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(filePath, 60)
  if (error) throw error
  return data.signedUrl
}

export async function deleteAttachment(id, filePath) {
  await supabase.storage.from(ATTACHMENTS_BUCKET).remove([filePath])
  return supabase.from('attachments').delete().eq('id', id).then(handle)
}

// ===== PROFILES / ROLES (Admin / Sale) =====
export async function getMyProfile(userId) {
  return supabase.from('profiles').select('*').eq('id', userId).maybeSingle().then(handle)
}

export async function listProfiles() {
  return supabase.from('profiles').select('*').order('created_at', { ascending: true }).then(handle)
}

export const updateProfileRole = (id, role) =>
  supabase.from('profiles').update({ role }).eq('id', id).select().single().then(handle)

// ต้อง login เป็น admin — เรียก Netlify Function ที่ถือ service role key ไว้ฝั่ง server เท่านั้น
export async function adminCreateUser({ email, password, full_name }, accessToken) {
  const res = await fetch('/.netlify/functions/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ email, password, full_name })
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'สร้างผู้ใช้งานไม่สำเร็จ')
  return json
}

// ===== DASHBOARD (คำนวณฝั่ง client จาก getAllData) =====
// stages: รายชื่อ deal stage ปัจจุบัน (จาก picklists) — ใช้แค่จัดกลุ่มตาราง Pipeline ให้ตรงกับ stage ที่มีจริงตอนนี้
export function computeDashboard(data, stages = []) {
  const { companies, deals, tasks, activities, quotations } = data
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const activeCompanies = companies.filter(c => c.status === 'Active').length
  const openDeals = deals.filter(d => d.stage !== 'Closed Won' && d.stage !== 'Closed Lost')
  const openValue = openDeals.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const wonDeals = deals.filter(d => d.stage === 'Closed Won')
  const wonValue = wonDeals.reduce((s, d) => s + (Number(d.value) || 0), 0)
  const pendingTasks = tasks.filter(t => t.status === 'รอดำเนินการ').length
  const overdueTasks = tasks.filter(t => {
    if (t.status === 'เสร็จสิ้น' || !t.due_date) return false
    return new Date(t.due_date) < today
  }).length

  const stageData = {}
  stages.forEach(s => { stageData[s] = { count: 0, value: 0 } })
  deals.forEach(d => {
    if (stageData[d.stage]) {
      stageData[d.stage].count++
      stageData[d.stage].value += Number(d.value) || 0
    }
  })

  const recentActivities = [...activities]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
    .map(a => ({ ...a, companyName: companies.find(c => c.id === a.company_id)?.name || '' }))

  const nextDate = new Date(); nextDate.setDate(nextDate.getDate() + 14)
  const upcomingTasks = tasks
    .filter(t => t.status !== 'เสร็จสิ้น' && t.due_date && new Date(t.due_date) <= nextDate)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 8)
    .map(t => ({ ...t, companyName: companies.find(c => c.id === t.company_id)?.name || '' }))

  const topDeals = [...openDeals]
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0))
    .slice(0, 5)
    .map(d => ({ ...d, companyName: companies.find(c => c.id === d.company_id)?.name || '' }))

  // ใบเสนอราคาเครดิตที่ยังไม่ชำระและมีวันครบกำหนดแล้ว — เตือนเซลล์กันลืมตามเก็บเงิน (ดูสรุปเดียวกันแบบเต็มในหน้าใบเสนอราคา)
  const pendingPaymentsAll = quotations
    .filter(q => q.payment_status && q.payment_status !== 'ชำระแล้ว' && q.payment_due_date)
    .sort((a, b) => new Date(a.payment_due_date) - new Date(b.payment_due_date))
    .map(q => ({ ...q, companyName: companies.find(c => c.id === q.company_id)?.name || '' }))
  const overduePayments = pendingPaymentsAll.filter(q => new Date(q.payment_due_date) < today).length

  return {
    summary: {
      activeCompanies, totalCompanies: companies.length,
      openDeals: openDeals.length, openValue,
      wonDeals: wonDeals.length, wonValue,
      pendingTasks, overdueTasks,
      totalQuotations: quotations.length,
      pendingPayments: pendingPaymentsAll.length, overduePayments
    },
    stageData, recentActivities, upcomingTasks, topDeals, pendingPayments: pendingPaymentsAll.slice(0, 8)
  }
}

// ===== SEARCH (คำนวณฝั่ง client) =====
export function searchAll(data, query) {
  if (!query || query.trim().length < 2) return []
  const q = query.toLowerCase().trim()
  const result = []
  data.companies.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.phone || '').includes(q) ||
    (c.email || '').toLowerCase().includes(q)
  ).forEach(c => result.push({ type: 'company', id: c.id, label: c.name, sub: c.industry }))

  data.contacts.filter(c =>
    (c.full_name || '').toLowerCase().includes(q) ||
    (c.phone || '').includes(q) ||
    (c.email || '').toLowerCase().includes(q)
  ).forEach(c => {
    const co = data.companies.find(x => x.id === c.company_id)
    result.push({ type: 'contact', id: c.company_id, label: c.full_name, sub: co?.name || '' })
  })

  data.deals.filter(d => (d.name || '').toLowerCase().includes(q))
    .forEach(d => {
      const co = data.companies.find(x => x.id === d.company_id)
      result.push({ type: 'deal', id: d.id, companyId: d.company_id, label: d.name, sub: co?.name || '' })
    })

  return result.slice(0, 15)
}

// ===== LEADS (ลีดจากฟอร์มสาธารณะ) =====
export async function fetchLeadsPage({ page = 0, status = '', q = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase.from('leads').select('*, company:companies(id,name)', { count: 'exact' }).order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const sq = safeLike(q)
  if (sq) query = query.or(`subject.ilike.%${sq}%,full_name.ilike.%${sq}%,phone.ilike.%${sq}%,email.ilike.%${sq}%`)
  const { fromIso, toIso } = dateRangeToIso(dateFrom, dateTo)
  if (fromIso) query = query.gte('created_at', fromIso)
  if (toIso) query = query.lte('created_at', toIso)
  const { data, error, count } = await query.range(...range(page))
  if (error) throw error
  return { rows: data, count, pageSize: PAGE_SIZE }
}

// ดึงลีดทั้งหมดที่ตรงกับตัวกรองปัจจุบัน (ไม่จำกัดหน้า) — ใช้สำหรับ export เป็น Excel เท่านั้น
export async function fetchAllLeads({ status = '', q = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase.from('leads').select('*').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const sq = safeLike(q)
  if (sq) query = query.or(`subject.ilike.%${sq}%,full_name.ilike.%${sq}%,phone.ilike.%${sq}%,email.ilike.%${sq}%`)
  const { fromIso, toIso } = dateRangeToIso(dateFrom, dateTo)
  if (fromIso) query = query.gte('created_at', fromIso)
  if (toIso) query = query.lte('created_at', toIso)
  return query.then(handle)
}

// สรุปจำนวนลีดแยกตามช่องทางที่มา (source) ตามตัวกรองปัจจุบัน — ใช้ดูว่าเดือนนี้ลีดมาจากช่องทางไหนเท่าไหร่
export async function fetchLeadsSourceSummary({ status = '', q = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase.from('leads').select('source')
  if (status) query = query.eq('status', status)
  const sq = safeLike(q)
  if (sq) query = query.or(`subject.ilike.%${sq}%,full_name.ilike.%${sq}%,phone.ilike.%${sq}%,email.ilike.%${sq}%`)
  const { fromIso, toIso } = dateRangeToIso(dateFrom, dateTo)
  if (fromIso) query = query.gte('created_at', fromIso)
  if (toIso) query = query.lte('created_at', toIso)
  const { data, error } = await query
  if (error) throw error
  const bySource = {}
  data.forEach(r => {
    const key = r.source || 'ไม่ระบุที่มา'
    bySource[key] = (bySource[key] || 0) + 1
  })
  return bySource
}

// สรุปจำนวนลีดแยกตามสถานะ ตามช่วงวันที่/คำค้นหาที่ตั้งไว้ (ไม่ขึ้นกับตัวกรองสถานะเอง เพื่อให้เห็นทุกสถานะพร้อมกันเสมอ)
export async function fetchLeadsStatusSummary({ q = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase.from('leads').select('status')
  const sq = safeLike(q)
  if (sq) query = query.or(`subject.ilike.%${sq}%,full_name.ilike.%${sq}%,phone.ilike.%${sq}%,email.ilike.%${sq}%`)
  const { fromIso, toIso } = dateRangeToIso(dateFrom, dateTo)
  if (fromIso) query = query.gte('created_at', fromIso)
  if (toIso) query = query.lte('created_at', toIso)
  const { data, error } = await query
  if (error) throw error
  const byStatus = {}
  data.forEach(r => {
    const key = r.status || 'ไม่ระบุสถานะ'
    byStatus[key] = (byStatus[key] || 0) + 1
  })
  return byStatus
}

export const addLead = (d) => supabase.from('leads').insert(d).select().single().then(handle)
export const updateLead = (id, d) => supabase.from('leads').update(d).eq('id', id).select().single().then(handle)
export const deleteLead = (id) => supabase.from('leads').delete().eq('id', id).then(handle)
// นำเข้าผู้ติดต่อจากไฟล์ Excel — insert ตรงผ่าน client ได้เลย (ต่างจากฟอร์มสาธารณะที่ต้องผ่าน Netlify Function) เพราะผู้ใช้ในหน้านี้ login แล้ว ตรงกับ RLS policy "leads insert"
export const bulkImportLeads = (rows) => supabase.from('leads').insert(rows).select().then(handle)

// ฟอร์มลีดสาธารณะไม่ต้อง login — ส่งผ่าน Netlify Function ที่ใช้ Service Role Key เขียนแทน ไม่เรียก supabase client ตรงๆ
export async function submitPublicLead({ subject, full_name, phone, email, interested_product, message, source, position, business_type, appliance_interest, purchase_reason }) {
  const res = await fetch('/.netlify/functions/submit-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, full_name, phone, email, interested_product, message, source, position, business_type, appliance_interest, purchase_reason })
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'ส่งข้อมูลไม่สำเร็จ')
  return json
}

// ===== AUDIT LOG (บันทึกประวัติ write action สำคัญ เช่น payment request submit/approve) =====
export async function writeAuditLog({ entity_type, entity_id, action, actor_name, detail = '' }) {
  // best-effort — ถ้าเขียน log พลาดไม่ควรทำให้ action หลักล้มเหลว
  const { data: s } = await supabase.auth.getUser()
  await supabase.from('audit_logs').insert({ entity_type, entity_id, action, actor_id: s?.user?.id || null, actor_name, detail }).then(() => {}, () => {})
}
export const fetchAuditLogs = (entityId) =>
  supabase.from('audit_logs').select('*').eq('entity_id', entityId).order('created_at', { ascending: false }).then(handle)

// ===== PAYMENT REQUESTS (คำขอตรวจยอดโอน) =====
// เลขคำขอ / เลขอ้างอิงอนุมัติ สร้างจาก sequence ฝั่ง DB (rpc) กัน race condition เหมือน gen_quot_no
async function genPrNo() {
  const { data, error } = await supabase.rpc('gen_pr_no')
  if (error) throw error
  return data
}
async function genApprovalRefNo() {
  const { data, error } = await supabase.rpc('gen_approval_ref_no')
  if (error) throw error
  return data
}

export async function fetchPaymentRequests({ status = '', q = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase.from('payment_requests').select('*, company:companies(id,name)').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const sq = safeLike(q)
  if (sq) query = query.or(`customer_name.ilike.%${sq}%,pr_no.ilike.%${sq}%,po_reference.ilike.%${sq}%,order_no.ilike.%${sq}%`)
  const { fromIso, toIso } = dateRangeToIso(dateFrom, dateTo)
  if (fromIso) query = query.gte('created_at', fromIso)
  if (toIso) query = query.lte('created_at', toIso)
  const { data, error } = await query
  if (error) throw error
  return data
}

export const fetchPaymentRequestById = (id) =>
  supabase.from('payment_requests').select('*, company:companies(id,name)').eq('id', id).single().then(handle)

export const listPaymentItems = (paymentRequestId) =>
  supabase.from('payment_items').select('*').eq('payment_request_id', paymentRequestId).order('sort_order', { ascending: true }).then(handle)

// ยอดรวมของคำขอ = ผลรวม (จำนวน×ราคาต่อหน่วย − ส่วนลด) โดยราคาต่อหน่วยรวม VAT แล้ว (สูตรเดียวกับดีล/ใบเสนอราคา)
function paymentTotal(items) {
  return round2((items || []).reduce((s, it) => s + ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0)), 0))
}

function paymentItemRows(paymentRequestId, items) {
  return items.map((it, i) => ({
    payment_request_id: paymentRequestId,
    product_id: it.product_id || null,
    sku: it.sku || '',
    product_name: it.product_name || '',
    quantity: Number(it.quantity) || 0,
    unit_price: Number(it.unit_price) || 0,
    discount: Number(it.discount) || 0,
    line_total: (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0),
    remark: it.remark || '',
    sort_order: i,
  }))
}

// สร้างคำขอ + รายการสินค้า — created_by ถูกเซ็ตโดย trigger ฝั่ง DB (set_created_by)
export async function addPaymentRequestWithItems(fields, items) {
  const { _actorName, ...rest } = fields   // _actorName ใช้แค่เขียน audit log ไม่ใช่คอลัมน์จริง ต้องตัดออกก่อน insert
  const pr_no = await genPrNo()
  const pr = await supabase.from('payment_requests').insert({ ...rest, pr_no, total_amount: paymentTotal(items) }).select().single().then(handle)
  if (items?.length) await supabase.from('payment_items').insert(paymentItemRows(pr.id, items)).then(handle)
  await writeAuditLog({ entity_type: 'payment_request', entity_id: pr.id, action: 'create', actor_name: _actorName, detail: `สร้างคำขอ ${pr_no}` })
  return pr
}

// แก้ไข — ลบรายการเดิมทั้งหมดแล้วใส่ชุดใหม่ (แบบเดียวกับดีล/ใบเสนอราคา)
export async function updatePaymentRequestWithItems(id, fields, items) {
  const { _actorName, ...rest } = fields
  const pr = await supabase.from('payment_requests').update({ ...rest, total_amount: paymentTotal(items) }).eq('id', id).select().single().then(handle)
  await supabase.from('payment_items').delete().eq('payment_request_id', id).then(handle)
  if (items?.length) await supabase.from('payment_items').insert(paymentItemRows(id, items)).then(handle)
  return pr
}

export const updatePaymentRequest = (id, d) =>
  supabase.from('payment_requests').update(d).eq('id', id).select().single().then(handle)

export const deletePaymentRequest = (id) =>
  supabase.from('payment_requests').delete().eq('id', id).then(handle)

// Sale กด Submit ให้บัญชีตรวจ — validation หลักเช็คที่ฝั่ง frontend ก่อนเรียก
export async function submitPaymentRequest(id, actorName) {
  const pr = await updatePaymentRequest(id, { status: PAYMENT_STATUS.PENDING })
  await writeAuditLog({ entity_type: 'payment_request', entity_id: id, action: 'submit', actor_name: actorName, detail: 'ส่งให้บัญชีตรวจ' })
  return pr
}

// ===== Finance actions =====
// reviewerName = ชื่อผู้อนุมัติ (บัญชีระบุเอง เป็นลายเซ็นว่าท่านไหนอนุมัติ), financeRefNo = เลขอ้างอิงที่บัญชีกรอกไว้แมทช์ภายหลัง (ไม่บังคับ)
export async function approvePaymentRequest(id, { remark = '', reviewerName, financeRefNo = '' } = {}) {
  const approval_ref_no = await genApprovalRefNo()
  const pr = await updatePaymentRequest(id, {
    status: PAYMENT_STATUS.APPROVED, approval_ref_no,
    finance_reviewer_name: reviewerName, finance_reviewed_at: new Date().toISOString(), finance_remark: remark || null,
    finance_ref_no: financeRefNo || null,
  })
  await writeAuditLog({ entity_type: 'payment_request', entity_id: id, action: 'approve', actor_name: reviewerName, detail: `อนุมัติ ${approval_ref_no}${financeRefNo ? ` (ref ${financeRefNo})` : ''}` })
  return pr
}

async function financeSetStatus(id, status, action, { remark, reviewerName }) {
  const pr = await updatePaymentRequest(id, {
    status, finance_reviewer_name: reviewerName, finance_reviewed_at: new Date().toISOString(), finance_remark: remark,
  })
  await writeAuditLog({ entity_type: 'payment_request', entity_id: id, action, actor_name: reviewerName, detail: remark })
  return pr
}
export const requestMorePaymentInfo = (id, opts) => financeSetStatus(id, PAYMENT_STATUS.NEED_INFO, 'need_info', opts)
export const markPaymentMismatch = (id, opts) => financeSetStatus(id, PAYMENT_STATUS.MISMATCH, 'mismatch', opts)
export const rejectPaymentRequest = (id, opts) => financeSetStatus(id, PAYMENT_STATUS.REJECTED, 'reject', opts)

// Sale เปิดออเดอร์หลังอนุมัติ
export async function markPaymentOrderCreated(id, { orderNo, remark = '', actorName }) {
  const pr = await updatePaymentRequest(id, {
    status: PAYMENT_STATUS.ORDER_CREATED, order_no: orderNo,
    order_created_at: new Date().toISOString(), order_created_by: actorName,
    remark: remark || null,
  })
  await writeAuditLog({ entity_type: 'payment_request', entity_id: id, action: 'order_created', actor_name: actorName, detail: `เปิดออเดอร์ ${orderNo}` })
  return pr
}

// อัปโหลดสลิปการโอน — เก็บใน bucket "attachments" เดียวกับเอกสารแนบอื่น (path แยกโฟลเดอร์ payment-slips)
export async function uploadPaymentSlip(paymentRequestId, file) {
  if (file.size > MAX_ATTACHMENT_SIZE) throw new Error('ไฟล์ใหญ่เกิน 20MB')
  const safeName = file.name.replace(/[^\w.-]/g, '_')
  const path = `payment-slips/${paymentRequestId || 'new'}/${Date.now()}_${safeName}`
  const { error: upErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file)
  if (upErr) throw upErr
  return path
}
export const getPaymentSlipUrl = (filePath) => getAttachmentUrl(filePath)

// แจ้งเตือนฝ่ายบัญชีว่ามีคำขอตรวจยอดใหม่รอตรวจ — เรียก Netlify Function เดียว ยิงพร้อมกันหลายช่องทาง (in-app/Telegram/อีเมล)
// best-effort: ถ้าช่องทางไหนยังไม่ตั้งค่า (Telegram/อีเมล) หรือส่งพลาด จะไม่ทำให้การ submit ล้มเหลว — in-app ใช้ได้เสมอไม่ต้องตั้งค่าเพิ่ม
export async function notifyFinancePaymentSubmitted(prId) {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData?.session?.access_token
    if (!accessToken) return { skipped: true }
    const res = await fetch('/.netlify/functions/notify-finance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ paymentRequestId: prId })
    })
    return await res.json().catch(() => ({}))
  } catch {
    return { skipped: true }
  }
}

// ===== NOTIFICATIONS (แจ้งเตือนในระบบ — กระดิ่งมุมบน) =====
export async function fetchMyNotifications(limit = 20) {
  const { data: s } = await supabase.auth.getUser()
  if (!s?.user) return []
  return supabase.from('notifications').select('*').eq('user_id', s.user.id)
    .order('created_at', { ascending: false }).limit(limit).then(handle)
}

export async function fetchUnreadNotificationCount() {
  const { data: s } = await supabase.auth.getUser()
  if (!s?.user) return 0
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', s.user.id).is('read_at', null)
  if (error) throw error
  return count || 0
}

export const markNotificationRead = (id) =>
  supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).then(handle)

export async function markAllNotificationsRead() {
  const { data: s } = await supabase.auth.getUser()
  if (!s?.user) return
  await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('user_id', s.user.id).is('read_at', null).then(handle)
}

// ===== มิเรอร์ไฟล์ใบเสนอราคาขึ้น Google Drive (โฟลเดอร์ปี > เดือน) — คู่กับ Supabase Storage ไม่ได้แทนที่ =====
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function callDriveUpload(payload) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData?.session?.access_token
  if (!accessToken) throw new Error('ไม่พบสิทธิ์เข้าใช้งาน')
  const res = await fetch('/.netlify/functions/upload-drive-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload)
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'อัปโหลดขึ้น Google Drive ไม่สำเร็จ')
  return json
}

// จัดกลุ่มโฟลเดอร์ตามวันที่ออกใบเสนอราคาจริง (quot_date) ไม่ใช่เวลาที่กดอัปโหลด กันย้ายโฟลเดอร์ผิดถ้าแก้ไขใบเสนอราคาข้ามวัน/เดือน
function driveDateFolderPath(quot) {
  const d = new Date(quot.quot_date || quot.created_at)
  const month = d.getMonth() + 1
  return [
    String(d.getFullYear()),
    `${String(month).padStart(2, '0')} - ${THAI_MONTHS[month - 1]}`,
    String(d.getDate()).padStart(2, '0')
  ]
}

// อัปโหลด/เขียนทับ PDF ใบเสนอราคาขึ้น Google Drive (โฟลเดอร์ Quatation > ปี > เดือน > วัน) — เก็บ drive_file_id ไว้เขียนทับไฟล์เดิมครั้งต่อไป ไม่สร้างไฟล์ซ้ำทุกครั้งที่บันทึก/แก้ไข
export async function uploadQuotationPdfToDrive(quot, pdfBlob) {
  const folderPath = driveDateFolderPath(quot)
  const fileBase64 = await blobToBase64(pdfBlob)
  const { fileId } = await callDriveUpload({
    fileBase64, mimeType: 'application/pdf', fileName: `${quot.quot_no}.pdf`,
    folderPath, existingFileId: quot.drive_file_id || null
  })
  await updateQuotation(quot.id, { drive_file_id: fileId })
  return fileId
}

// อัปโหลด/เขียนทับไฟล์ที่ลูกค้าเซ็นกลับขึ้น Google Drive (ต่อท้ายชื่อไฟล์ด้วย _Sign) — เก็บไฟล์เดิมไว้ที่ชื่อเดียวกันเสมอ
export async function uploadSignedFileToDrive(quot, file) {
  const folderPath = driveDateFolderPath(quot)
  const ext = (file.name.match(/\.[^.]+$/) || [''])[0]
  const fileBase64 = await blobToBase64(file)
  const { fileId } = await callDriveUpload({
    fileBase64, mimeType: file.type || 'application/octet-stream', fileName: `${quot.quot_no}_Sign${ext}`,
    folderPath, existingFileId: quot.drive_signed_file_id || null
  })
  await updateQuotation(quot.id, { drive_signed_file_id: fileId })
  return fileId
}

// มิเรอร์เอกสารแนบบริษัท (ภพ20/หนังสือรับรอง ฯลฯ) ขึ้น Google Drive แยกโฟลเดอร์ตามชื่อบริษัท — คนละโฟลเดอร์หลักกับใบเสนอราคา
export async function uploadAttachmentToDrive(company, attachment, file) {
  const fileBase64 = await blobToBase64(file)
  const { fileId } = await callDriveUpload({
    fileBase64, mimeType: file.type || 'application/octet-stream', fileName: attachment.file_name,
    folderPath: [company.name], purpose: 'company-doc', existingFileId: attachment.drive_file_id || null
  })
  await supabase.from('attachments').update({ drive_file_id: fileId }).eq('id', attachment.id)
  return fileId
}
