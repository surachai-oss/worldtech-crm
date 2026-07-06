// ===== สิทธิ์การจัดการข้อมูล (Admin เห็น/แก้ไขทั้งหมด, Sale เห็นเฉพาะของตัวเอง + ข้อมูลเก่าที่ยังไม่มีเจ้าของ) =====
// ต้องสอดคล้องกับ RLS policy ใน supabase/schema.sql — โค้ดฝั่งนี้ใช้ซ่อนปุ่มเพื่อ UX เท่านั้น
// สิทธิ์จริงถูกบังคับที่ฐานข้อมูลเสมอ

// แก้ไขได้ไหม: เจ้าของ, admin, หรือยังไม่มีเจ้าของ (ข้อมูลเก่า)
export function canEdit(row, perm) {
  if (!row || !perm) return false
  if (perm.isAdmin) return true
  return row.created_by === perm.userId || row.created_by == null
}

// ลบได้ไหม: เจ้าของ หรือ admin เท่านั้น (ข้อมูลเก่าที่ไม่มีเจ้าของ ลบได้เฉพาะ admin กันลบมั่ว)
export function canDelete(row, perm) {
  if (!row || !perm) return false
  if (perm.isAdmin) return true
  return row.created_by === perm.userId
}

// ใช้กับข้อมูลที่ไม่มี created_by ของตัวเอง แต่สืบสิทธิ์จากบริษัทแม่
// (contacts / activities / quotations / attachments) — edit และ delete ใช้เงื่อนไขเดียวกัน ตรงกับ RLS "for all"
export function canManageChild(company, perm) {
  return canEdit(company, perm)
}
