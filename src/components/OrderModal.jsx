import { useEffect, useState } from 'react'
import { listQuotationItems, computeDealTotals, fetchActiveOrderQuotationIds, listProducts } from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import SearchableSelect from './SearchableSelect'

const EMPTY_ITEM = { product_id: '', description: '', quantity: 1, unit_price: '' }

// map แถวรายการสินค้าจากใบเสนอราคา -> รูปแบบรายการของออเดอร์ (ไม่มีส่วนลด/หมายเหตุเหมือน quotation_items/deal_items)
function mapCopiedItems(rows) {
  return rows.map(r => ({
    product_id: r.product_id || '', description: r.description || r.product?.name || '',
    quantity: r.quantity, unit_price: r.unit_price,
  }))
}

// ฟอร์มสร้างออเดอร์ใหม่ — เลือกใบเสนอราคา -> คัดลอกบริษัท/รายการสินค้าทั้งหมดมาให้อัตโนมัติ -> กรอกที่อยู่จัดส่งเพิ่ม
// เลขออเดอร์ (WTE{ปี}WT{เลขรัน}) รันจาก DB ตอนบันทึกจริง (ไม่ได้รันไว้ล่วงหน้าตอนเปิดฟอร์ม กันเลขขาดหายจากฟอร์มที่เปิดค้างไว้แล้วไม่บันทึก)
// onSave(fields, items) — บันทึกแล้วแก้ไขไม่ได้อีก (ยกเลิกได้อย่างเดียว) จึงไม่มีโหมดแก้ไขในคอมโพเนนต์นี้
export default function OrderModal({ companies, quotations, currentUser, onClose, onSave }) {
  const { toast } = useUi()
  const [quotationId, setQuotationId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [quotNo, setQuotNo] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [shippingAddress, setShippingAddress] = useState('')
  const [shippingContactName, setShippingContactName] = useState('')
  const [shippingContactPhone, setShippingContactPhone] = useState('')
  const [usedQuotationIds, setUsedQuotationIds] = useState(null)
  const [products, setProducts] = useState(null)

  useEffect(() => {
    fetchActiveOrderQuotationIds().then(setUsedQuotationIds).catch(() => setUsedQuotationIds(new Set()))
    listProducts().then(setProducts).catch(() => setProducts([]))
  }, [])

  const companyById = new Map(companies.map(c => [c.id, c]))
  // ตัดใบเสนอราคาที่ผูกออเดอร์ Active อยู่แล้วออกจากตัวเลือก (เลือกซ้ำไม่ได้จนกว่าออเดอร์เดิมจะถูกยกเลิก)
  const availableQuots = usedQuotationIds ? quotations.filter(q => !usedQuotationIds.has(q.id)) : []

  const onQuotationChange = async (quotId) => {
    setQuotationId(quotId)
    if (!quotId) { setCompanyId(''); setCustomerName(''); setQuotNo(''); return }
    const quot = quotations.find(q => q.id === quotId)
    setCompanyId(quot?.company_id || '')
    setCustomerName(companyById.get(quot?.company_id)?.name || '')
    setQuotNo(quot?.quot_no || '')
    try {
      const rows = await listQuotationItems(quotId)
      if (rows.length) setItems(mapCopiedItems(rows))
      toast('คัดลอกข้อมูลจากใบเสนอราคาแล้ว', 'success')
    } catch (e) { toast('ดึงข้อมูลจากใบเสนอราคาไม่สำเร็จ: ' + e.message, 'error') }
  }

  const updateItem = (i, patch) => setItems(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addItem = () => setItems(rows => [...rows, { ...EMPTY_ITEM }])
  const removeItem = (i) => setItems(rows => rows.filter((_, idx) => idx !== i))
  const onProductChange = (i, productId) => {
    const p = (products || []).find(x => x.id === productId)
    updateItem(i, { product_id: productId, description: p ? p.name : items[i].description })
  }

  const totals = computeDealTotals(items)
  const cleanItems = items.filter(it => it.description?.trim())

  // onSave (App.jsx) ปิดมอดัลทันทีแล้วค่อย run() ในพื้นหลัง — เหมือนมอดัลอื่นในระบบ (ไม่รอผลลัพธ์/ไม่มี spinner ค้าง)
  const submit = () => {
    if (!quotationId) { toast('กรุณาเลือกใบเสนอราคา', 'error'); return }
    if (!cleanItems.length) { toast('กรุณาใส่รายการสินค้าอย่างน้อย 1 รายการ', 'error'); return }
    if (!shippingAddress.trim()) { toast('กรุณากรอกที่อยู่จัดส่ง', 'error'); return }
    onSave({
      quotation_id: quotationId, quot_no: quotNo, company_id: companyId || null, customer_name: customerName,
      shipping_address: shippingAddress.trim(), shipping_contact_name: shippingContactName.trim() || null,
      shipping_contact_phone: shippingContactPhone.trim() || null,
      sales_id: currentUser.id, sales_name: currentUser.name,
    }, cleanItems)
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div className="modal-title">สร้างออเดอร์</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label required">เลขที่ใบเสนอราคา</label>
            <SearchableSelect
              options={availableQuots} value={quotationId} onChange={onQuotationChange}
              placeholder={usedQuotationIds === null ? 'กำลังโหลด...' : '-- พิมพ์เพื่อค้นหาเลขที่ใบเสนอราคา --'}
              getOptionLabel={q => `${q.quot_no} - ${q.subject} (${companyById.get(q.company_id)?.name || '-'})`}
              disabled={usedQuotationIds === null}
            />
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>แสดงเฉพาะใบเสนอราคาที่ยังไม่ถูกใช้เปิดออเดอร์อื่น</div>
          </div>

          {companyId && <div style={{ marginBottom: 12, fontSize: 13 }}>บริษัท: <b>{customerName}</b></div>}

          <label className="form-label" style={{ marginTop: 4 }}>รายการสินค้า (คัดลอกจากใบเสนอราคาให้อัตโนมัติ แก้ไขได้ก่อนบันทึก)</label>
          <div className="table-wrap" style={{ marginBottom: 4 }}>
            <table>
              <thead>
                <tr>
                  <th>สินค้า / รายการ</th>
                  <th style={{ width: 70 }}>จำนวน</th>
                  <th style={{ width: 120 }}>ราคา/หน่วย</th>
                  <th style={{ width: 110 }}>รวม</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>
                      <SearchableSelect options={products || []} value={it.product_id} onChange={v => onProductChange(i, v)} freeText={it.description} onFreeTextChange={v => updateItem(i, { description: v })} placeholder={products ? '-- พิมพ์ชื่อสินค้า หรือพิมพ์เอง --' : 'กำลังโหลด...'} getOptionLabel={p => `${p.code} - ${p.name}`} disabled={!products} />
                    </td>
                    <td><input className="form-control" type="number" min="0" value={it.quantity} onChange={e => updateItem(i, { quantity: e.target.value })} /></td>
                    <td><input className="form-control" type="number" min="0" value={it.unit_price} onChange={e => updateItem(i, { unit_price: e.target.value })} /></td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toLocaleString('th-TH')}</td>
                    <td><button type="button" className="btn btn-danger btn-xs" onClick={() => removeItem(i)}>ลบ</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ เพิ่มรายการ</button>
          <div className="card" style={{ marginTop: 8, marginBottom: 14 }}>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13 }}>
              <div>ไม่รวม VAT: <b>{totals.exVat.toLocaleString('th-TH')}</b></div>
              <div>VAT 7%: <b>{totals.vatAmount.toLocaleString('th-TH')}</b></div>
              <div>รวมทั้งสิ้น: <b style={{ color: 'var(--navy)' }}>{fmtCurrency(totals.subtotalIncVat)}</b></div>
            </div>
          </div>

          <label className="form-label" style={{ marginTop: 4 }}>ที่อยู่จัดส่ง</label>
          <div className="form-group">
            <label className="form-label required">ที่อยู่สำหรับจัดส่งสินค้า</label>
            <textarea className="form-control" rows={2} value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ชื่อผู้รับ (ถ้ามี)</label>
              <input className="form-control" value={shippingContactName} onChange={e => setShippingContactName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">เบอร์โทรผู้รับ (ถ้ามี)</label>
              <input className="form-control" value={shippingContactPhone} onChange={e => setShippingContactPhone(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">เซลล์ผู้เปิดออเดอร์</label>
            <input className="form-control" value={currentUser.name} disabled />
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-light)' }}>เลขที่ออเดอร์จะรันอัตโนมัติหลังกดบันทึก — ออเดอร์ที่บันทึกแล้วแก้ไขไม่ได้ ถ้าลงข้อมูลผิดต้องยกเลิกแล้วเปิดใหม่</div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit}>บันทึกออเดอร์</button>
        </div>
      </div>
    </div>
  )
}

// ป็อปอัปดูรายละเอียดออเดอร์ (อ่านอย่างเดียว) + ปุ่มยกเลิก — ไม่มีโหมดแก้ไขเพราะออเดอร์ที่บันทึกแล้วแก้ไม่ได้
export function OrderDetailModal({ order, items, onClose, onCancel }) {
  const { toast } = useUi()
  const [reason, setReason] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [busy, setBusy] = useState(false)

  // onCancel (App.jsx action) จัดการ toast/error เองผ่าน run() อยู่แล้ว ไม่โยน error กลับมา — ปิดมอดัลได้ทันทีหลัง await
  const doCancel = async () => {
    if (!reason.trim()) { toast('กรุณาระบุเหตุผลที่ยกเลิก', 'error'); return }
    setBusy(true)
    await onCancel(order, reason.trim())
    onClose()
  }

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-light)' }}>{label}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <div className="modal-title">ออเดอร์ · {order.order_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Row label="เลขที่ใบเสนอราคา" value={order.quot_no || '-'} />
          <Row label="บริษัท" value={order.customer_name || order.company?.name || '-'} />
          <Row label="ที่อยู่จัดส่ง" value={order.shipping_address} />
          {order.shipping_contact_name && <Row label="ผู้รับ" value={`${order.shipping_contact_name}${order.shipping_contact_phone ? ` (${order.shipping_contact_phone})` : ''}`} />}
          <Row label="เซลล์ผู้เปิดออเดอร์" value={order.sales_name || '-'} />
          <Row label="สถานะ" value={<span className={`badge ${order.status === 'Active' ? 'badge-green' : 'badge-gray'}`}>{order.status === 'Active' ? 'ใช้งานอยู่' : 'ยกเลิกแล้ว'}</span>} />
          {order.status === 'Cancelled' && order.cancel_reason && <Row label="เหตุผลที่ยกเลิก" value={order.cancel_reason} />}

          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>สินค้า/รายการ</th><th style={{ textAlign: 'center' }}>จำนวน</th><th style={{ textAlign: 'right' }}>ราคา/หน่วย</th><th style={{ textAlign: 'right' }}>รวม</th></tr></thead>
              <tbody>
                {(items || []).map(it => (
                  <tr key={it.id}>
                    <td>{it.description || it.product?.name || '-'}</td>
                    <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{fmtCurrency(it.unit_price)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13 }}>ยอดรวม: <b style={{ color: 'var(--navy)' }}>{fmtCurrency(order.value)}</b></div>

          {order.status === 'Active' && (
            showCancelForm ? (
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label required">เหตุผลที่ยกเลิกออเดอร์</label>
                <textarea className="form-control" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="เช่น ลงข้อมูลผิด กรอกจำนวน/ราคาผิด" />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowCancelForm(false)} disabled={busy}>ไม่ยกเลิก</button>
                  <button className="btn btn-danger btn-sm" onClick={doCancel} disabled={busy}>{busy ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกออเดอร์'}</button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-danger btn-sm" onClick={() => setShowCancelForm(true)}>ยกเลิกออเดอร์</button>
              </div>
            )
          )}
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={onClose}>ปิด</button></div>
      </div>
    </div>
  )
}
