export function fmtCurrency(n) {
  if (!n) return '0 ฿'
  return Number(n).toLocaleString('th-TH') + ' ฿'
}

export function fmtDate(d) {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return d }
}

export function isOverdue(ds) {
  if (!ds) return false
  return new Date(ds) < new Date(new Date().toDateString())
}

export function isDueToday(ds) {
  if (!ds) return false
  return new Date(ds).toDateString() === new Date().toDateString()
}

export function stageBadgeClass(s) {
  const m = { 'Lead': 'badge-gray', 'Qualified': 'badge-blue', 'Proposal': 'badge-yellow', 'Negotiation': 'badge-orange', 'Closed Won': 'badge-green', 'Closed Lost': 'badge-red' }
  return m[s] || 'badge-gray'
}

export function statusBadgeClass(s) {
  const m = { 'Active': 'badge-green', 'Prospect': 'badge-blue', 'Inactive': 'badge-gray', 'รอดำเนินการ': 'badge-yellow', 'กำลังดำเนินการ': 'badge-blue', 'เสร็จสิ้น': 'badge-green', 'ยกเลิก': 'badge-red' }
  return m[s] || 'badge-gray'
}

export function quotBadgeClass(s) {
  const m = { 'Draft': 'badge-gray', 'Sent': 'badge-blue', 'Approved': 'badge-green', 'Rejected': 'badge-red', 'Expired': 'badge-orange' }
  return m[s] || 'badge-gray'
}

export function activityColor(t) {
  return { 'โทรศัพท์': '#e6f4fd', 'อีเมล': '#e6f7f0', 'ประชุม': '#fff3cd', 'Line': '#f0faf0', 'เยี่ยมชมลูกค้า': '#f3e6ff', 'สาธิตสินค้า': '#ebf0fa', 'อื่นๆ': '#f7fafc' }[t] || '#f7fafc'
}

const STAGE_COLORS = { 'Lead': '#718096', 'Qualified': '#3182ce', 'Proposal': '#d69e2e', 'Negotiation': '#dd6b20', 'Closed Won': '#38a169', 'Closed Lost': '#e53e3e' }
export function stageColor(stage) {
  return STAGE_COLORS[stage] || '#805ad5' // สี default สำหรับ stage ที่เพิ่มเองใหม่
}

export function fmtFileSize(bytes) {
  if (!bytes) return '-'
  const units = ['B', 'KB', 'MB', 'GB']
  let n = Number(bytes), i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}
