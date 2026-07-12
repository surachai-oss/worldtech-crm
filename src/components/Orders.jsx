import { useEffect, useState } from 'react'
import { fetchOrders, listOrderItems, ORDER_STATUS } from '../lib/api'
import { fmtCurrency, fmtDate } from '../lib/format'
import { useUi } from './UiContext'
import { OrderDetailModal } from './OrderModal'
import AccountingDocModal from './AccountingDocModal'
import OrderPaymentModal from './OrderPaymentModal'

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
                {rows.map(o => (
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
                      {o.status === ORDER_STATUS.ACTIVE && <button className="btn btn-secondary btn-xs" onClick={() => setPaymentModalOrder(o)}>ขอตรวจยอด</button>}
                      {o.status === ORDER_STATUS.ACTIVE && <button className="btn btn-secondary btn-xs" onClick={() => setDocModalOrder(o)}>เอกสารบัญชี</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีออเดอร์'}</div></div>}
        </div>
      </div>
    </div>
  )
}
