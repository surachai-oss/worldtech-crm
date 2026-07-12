import { useEffect, useState } from 'react'
import { fetchOrders, listOrderItems, ORDER_STATUS, PAYMENT_STATUS, ACCOUNTING_DOC_STATUS } from '../lib/api'
import { fmtCurrency, fmtDate, paymentStatusLabel, paymentBadgeClass, docStatusBadgeClass } from '../lib/format'
import { useUi } from './UiContext'
import { OrderDetailModal } from './OrderModal'
import AccountingDocModal from './AccountingDocModal'
import OrderPaymentModal from './OrderPaymentModal'

// เอาคำขอตรวจยอดล่าสุดของออเดอร์มาโชว์สถานะที่ปุ่ม — เลือกใบที่ยัง "ไม่ถูกปฏิเสธ" ก่อน (ตรงกับใบที่เปิดป็อปอัปแล้วจะเจอ) ถ้าถูกปฏิเสธหมดค่อยโชว์ใบล่าสุดที่ถูกปฏิเสธ
function latestPaymentRequest(order) {
  const list = order.payment_requests || []
  if (!list.length) return null
  const sorted = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return sorted.find(p => p.status !== PAYMENT_STATUS.REJECTED) || sorted[0]
}
// ออเดอร์หนึ่งใบมีคำขอเอกสารบัญชีได้ใบเดียวอยู่แล้ว (ดู AccountingDocModal) แต่กันเหนียวเผื่อมีมากกว่า 1 ก็เอาใบล่าสุด
function latestDocRequest(order) {
  const list = order.accounting_document_requests || []
  if (!list.length) return null
  return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
}
// สีปุ่มบ่งบอกว่าต้องมีคนทำอะไรต่อไหม — แดง = รอเซลล์แก้ไข/เปิดใหม่, เขียว = อนุมัติ/เสร็จแล้ว, กรมท่า = ปกติ/รอบัญชี
function paymentBtnClass(status) {
  if (!status) return 'btn-secondary'
  if ([PAYMENT_STATUS.NEED_INFO, PAYMENT_STATUS.MISMATCH, PAYMENT_STATUS.REJECTED].includes(status)) return 'btn-danger'
  if (status === PAYMENT_STATUS.APPROVED) return 'btn-success'
  return 'btn-secondary'
}
const DOC_DONE_STATES = [ACCOUNTING_DOC_STATUS.READY, ACCOUNTING_DOC_STATUS.SENT_TO_CUSTOMER, ACCOUNTING_DOC_STATUS.PENDING_ORIGINAL, ACCOUNTING_DOC_STATUS.ORIGINAL_SENT, ACCOUNTING_DOC_STATUS.COMPLETED]
function docBtnClass(status) {
  if (!status) return 'btn-secondary'
  if (status === ACCOUNTING_DOC_STATUS.WAITING_SALES_INFO) return 'btn-danger'
  if (DOC_DONE_STATES.includes(status)) return 'btn-success'
  return 'btn-secondary'
}

export default function Orders({ reloadKey, companies, perm, currentUser, settings, onAdd, onCancel }) {
  const { toast } = useUi()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState(null) // { order, items }
  const [docModalOrder, setDocModalOrder] = useState(null)
  const [paymentModalOrder, setPaymentModalOrder] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      fetchOrders({ status, q, dateFrom: fromDate, dateTo: toDate })
        .then(r => { if (alive) setRows(r) })
        .catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [status, q, fromDate, toDate, reloadKey, toast])

  const openDetail = async (order) => {
    try { setDetail({ order, items: await listOrderItems(order.id) }) }
    catch (e) { toast('โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error') }
  }

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">ออเดอร์ <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} รายการ)</span></div>
        <button className="btn btn-primary" onClick={onAdd}>+ สร้างออเดอร์</button>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          <option value={ORDER_STATUS.ACTIVE}>ใช้งานอยู่</option>
          <option value={ORDER_STATUS.CANCELLED}>ยกเลิกแล้ว</option>
        </select>
        <input className="filter-input" placeholder="ค้นหา เลขออเดอร์/เลขใบเสนอราคา/ลูกค้า..." value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title="วันที่สร้าง ตั้งแต่" />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>ถึง</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title="วันที่สร้าง ถึง" />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>ล้าง</button>}
        </div>
      </div>
      {detail && <OrderDetailModal order={detail.order} items={detail.items} onClose={() => setDetail(null)} onCancel={onCancel} />}
      {docModalOrder && <AccountingDocModal order={docModalOrder} currentUser={currentUser} onClose={() => setDocModalOrder(null)} />}
      {paymentModalOrder && <OrderPaymentModal order={paymentModalOrder} companies={companies} perm={perm} currentUser={currentUser} settings={settings} onClose={() => setPaymentModalOrder(null)} />}
      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>เลขออเดอร์</th><th>เลขใบเสนอราคา</th><th>บริษัท</th><th>ยอดรวม</th><th>เซลล์</th><th>วันที่สร้าง</th><th>สถานะ</th><th>การจัดการ</th></tr></thead>
              <tbody>
                {rows.map(o => {
                  const pr = latestPaymentRequest(o)
                  const doc = latestDocRequest(o)
                  return (
                    <tr key={o.id}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{o.order_no}</td>
                      <td style={{ fontSize: 12 }}>{o.quot_no || '-'}</td>
                      <td>{o.customer_name || o.company?.name || '-'}</td>
                      <td style={{ fontWeight: 600 }}>{fmtCurrency(o.value)}</td>
                      <td style={{ fontSize: 12 }}>{o.sales_name || '-'}</td>
                      <td style={{ fontSize: 12 }}>{fmtDate(o.created_at)}</td>
                      <td><span className={`badge ${o.status === ORDER_STATUS.ACTIVE ? 'badge-green' : 'badge-gray'}`}>{o.status === ORDER_STATUS.ACTIVE ? 'ใช้งานอยู่' : 'ยกเลิกแล้ว'}</span></td>
                      <td className="td-actions">
                        <button className="btn btn-outline btn-xs" onClick={() => openDetail(o)}>ดูรายละเอียด</button>
                        {o.status === ORDER_STATUS.ACTIVE && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                            <button className={`btn ${paymentBtnClass(pr?.status)} btn-xs`} onClick={() => setPaymentModalOrder(o)}>ขอตรวจยอด</button>
                            {pr && <span className={`badge ${paymentBadgeClass(pr.status)}`} style={{ fontSize: 10 }}>{paymentStatusLabel(pr.status)}</span>}
                          </div>
                        )}
                        {o.status === ORDER_STATUS.ACTIVE && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                            <button className={`btn ${docBtnClass(doc?.document_status)} btn-xs`} onClick={() => setDocModalOrder(o)}>เอกสารบัญชี</button>
                            {doc && (
                              <div style={{ display: 'flex', gap: 3 }}>
                                <span className={`badge ${docStatusBadgeClass(doc.document_status)}`} style={{ fontSize: 10 }}>{doc.document_status}</span>
                                {doc.revised_at && <span className="badge badge-orange" style={{ fontSize: 10 }}>อัพเดท</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีออเดอร์'}</div></div>}
        </div>
      </div>
    </div>
  )
}
