import { supabase } from '../supabaseClient'

// ===== CONSTANTS (เดิมมาจาก CONSTANTS ใน Code.gs) =====
export const CONSTANTS = {
  DEAL_STAGES: ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost'],
  ACTIVITY_TYPES: ['โทรศัพท์', 'อีเมล', 'ประชุม', 'Line', 'เยี่ยมชมลูกค้า', 'สาธิตสินค้า', 'อื่นๆ'],
  TASK_PRIORITIES: ['ต่ำ', 'ปกติ', 'สูง', 'เร่งด่วน'],
  TASK_STATUSES: ['รอดำเนินการ', 'กำลังดำเนินการ', 'เสร็จสิ้น', 'ยกเลิก'],
  COMPANY_STATUSES: ['Active', 'Prospect', 'Inactive'],
  QUOT_STATUSES: ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'],
  INDUSTRIES: [
    'เทคโนโลยี', 'การผลิต', 'การค้าปลีก', 'การเงินและธนาคาร', 'สุขภาพและการแพทย์',
    'การศึกษา', 'อสังหาริมทรัพย์', 'โลจิสติกส์', 'อาหารและเครื่องดื่ม', 'พลังงาน',
    'สื่อและโฆษณา', 'ท่องเที่ยวและโรงแรม', 'ก่อสร้าง', 'เกษตรกรรม', 'อื่นๆ'
  ]
}

function handle(res) {
  if (res.error) throw res.error
  return res.data
}

// ===== BULK LOAD =====
export async function getAllData() {
  const [companies, contacts, deals, activities, tasks, quotations] = await Promise.all([
    supabase.from('companies').select('*').order('created_at', { ascending: false }).then(handle),
    supabase.from('contacts').select('*').order('created_at', { ascending: false }).then(handle),
    supabase.from('deals').select('*').order('created_at', { ascending: false }).then(handle),
    supabase.from('activities').select('*').order('activity_date', { ascending: false }).then(handle),
    supabase.from('tasks').select('*').order('due_date', { ascending: true }).then(handle),
    supabase.from('quotations').select('*').order('created_at', { ascending: false }).then(handle),
  ])
  return { companies, contacts, deals, activities, tasks, quotations }
}

// ===== COMPANIES =====
export const addCompany = (d) => supabase.from('companies').insert(d).select().single().then(handle)
export const updateCompany = (id, d) => supabase.from('companies').update(d).eq('id', id).select().single().then(handle)
export const deleteCompany = (id) => supabase.from('companies').delete().eq('id', id).then(handle)

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
export async function addQuotation(d) {
  const quot_no = await genQuotNo()
  return supabase.from('quotations').insert({ ...d, quot_no }).select().single().then(handle)
}
export const updateQuotationStatus = (id, status) =>
  supabase.from('quotations').update({ status }).eq('id', id).select().single().then(handle)
export const deleteQuotation = (id) => supabase.from('quotations').delete().eq('id', id).then(handle)

// ===== DASHBOARD (คำนวณฝั่ง client จาก getAllData) =====
export function computeDashboard(data) {
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
  CONSTANTS.DEAL_STAGES.forEach(s => { stageData[s] = { count: 0, value: 0 } })
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

  return {
    summary: {
      activeCompanies, totalCompanies: companies.length,
      openDeals: openDeals.length, openValue,
      wonDeals: wonDeals.length, wonValue,
      pendingTasks, overdueTasks,
      totalQuotations: quotations.length
    },
    stageData, recentActivities, upcomingTasks, topDeals
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
