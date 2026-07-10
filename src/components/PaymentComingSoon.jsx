// หน้าจอชั่วคราวสำหรับ 3 แท็บใหม่ในกลุ่ม "การเงิน" (คำขอตรวจยอด / ตรวจสอบยอดโอน / แดชบอร์ดการชำระเงิน)
// ยังไม่มีตาราง/ตรรกะเบื้องหลัง — รอออกแบบสคีมา/สิทธิ์การใช้งานร่วมกับผู้ใช้ก่อน (ดู README หัวข้อ "Payment Verification")
export default function PaymentComingSoon({ title, bullets }) {
  return (
    <div>
      <div className="section-header">
        <div className="section-title">{title}</div>
      </div>
      <div className="card">
        <div className="card-body">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>หน้านี้อยู่ระหว่างออกแบบ</div>
          <div style={{ fontSize: 13, color: 'var(--text-light)', marginBottom: 12 }}>
            เมนูนี้เตรียมไว้สำหรับระบบตรวจสอบยอดโอน + อนุมัติจากฝ่ายบัญชี ตามที่ขอไว้ ยังไม่ได้เชื่อมข้อมูลจริงเพราะต้องออกแบบตาราง/สิทธิ์การใช้งานเพิ่มก่อน
          </div>
          {bullets?.length > 0 && (
            <ul style={{ fontSize: 13, color: 'var(--text)', paddingLeft: 20, lineHeight: 1.8 }}>
              {bullets.map(b => <li key={b}>{b}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
