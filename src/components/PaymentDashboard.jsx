import { useEffect, useState } from 'react'
import { fetchPaymentDashboard, PAYMENT_STATUS } from '../lib/api'
import { fmtCurrency, paymentStatusLabel } from '../lib/format'
import { useUi } from './UiContext'

export default function PaymentDashboard({ reloadKey }) {
  const { toast } = useUi()
  const [d, setD] = useState(null)

  useEffect(() => {
    let alive = true
    fetchPaymentDashboard()
      .then(r => { if (alive) setD(r) })
      .catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
    return () => { alive = false }
  }, [reloadKey, toast])

  if (!d) return <div className="empty-state"><div>กำลังโหลด...</div></div>

  // การ์ดสรุปตามสถานะ (เรียงตาม workflow) + สีตามความหมาย
  const statusCards = [
    { key: PAYMENT_STATUS.PENDING, cls: '' },
    { key: PAYMENT_STATUS.NEED_INFO, cls: 'navy' },
    { key: PAYMENT_STATUS.MISMATCH, cls: 'red' },
    { key: PAYMENT_STATUS.APPROVED, cls: 'green' },
    { key: PAYMENT_STATUS.ORDER_CREATED, cls: 'blue' },
    { key: PAYMENT_STATUS.REJECTED, cls: 'red' },
  ]

  return (
    <div>
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {statusCards.map(c => (
          <div className={`kpi-card ${c.cls}`} key={c.key}>
            <div className="kpi-label">{paymentStatusLabel(c.key)}</div>
            <div className="kpi-value">{d.byStatus[c.key] || 0}</div>
          </div>
        ))}
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card green">
          <div className="kpi-label">ยอดอนุมัติรวม</div>
          <div className="kpi-value" style={{ fontSize: 19 }}>{fmtCurrency(d.totalApproved)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">คำขอที่สร้างวันนี้</div>
          <div className="kpi-value">{d.createdToday}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">อนุมัติวันนี้</div>
          <div className="kpi-value">{d.approvedToday}</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">อนุมัติแล้วยังไม่เปิดออเดอร์</div>
          <div className="kpi-value">{d.approvedNoOrder}</div>
        </div>
      </div>
    </div>
  )
}
