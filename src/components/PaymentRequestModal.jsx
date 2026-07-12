import { useEffect, useState } from 'react'
import { listProducts, listPaymentItems, listOrderItems, fetchOrders, computeDealTotals, ORDER_STATUS } from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import EditableSelect from './EditableSelect'
import SearchableSelect from './SearchableSelect'

const EMPTY_ITEM = { product_id: '', sku: '', product_name: '', quantity: 1, unit_price: '', discount: 0, remark: '' }

const todayStr = () => new Date().toISOString().slice(0, 10)

// ป้ายประเภทลูกค้า (เครดิต/เงินสด) จากค่า credit_term ของบริษัท
function creditLabel(term) {
  if (term === null || term === undefined || term === '' || Number(term) === 0) return 'ลูกค้าเงินสด'
  const days = Number(term)
  return Number.isFinite(days) && days > 0 ? `ลูกค้าเครดิต (เครดิต ${days} วัน)` : 'ลูกค้าเครดิต'
}

// map แถวรายการสินค้าจากออเดอร์ -> รูปแบบรายการของคำขอตรวจยอด
function mapCopiedItems(rows) {
  return rows.map(r => ({
    product_id: r.product_id || '',
    sku: r.product?.code || '',
    product_name: r.description || r.product?.name || '',
    quantity: r.quantity, unit_price: r.unit_price, discount: 0, remark: ''
  }))
}

// ป็อปอัปเล็กๆ ให้ Sale ยืนยันเปิดออเดอร์หลังบัญชีอนุมัติแล้ว — เลขออเดอร์ดึงจากออเดอร์ที่ผูกไว้ตั้งแต่สร้างคำขอ (ไม่ต้องกรอกเอง)
export function PaymentOrderModal({ pr, onClose, onSave }) {
  const { toast } = useUi()
  const [remark, setRemark] = useState('')
  const orderNo = pr.order?.order_no || pr.order_no || ''
  const submit = () => {
    if (!orderNo) { toast('ไม่พบเลขที่ออเดอร์ที่ผูกกับคำขอนี้', 'error'); return }
    onSave(pr, orderNo, remark.trim())
  }
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">เปิดออเดอร์ · {pr.pr_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-light)' }}>เลขที่ออเดอร์</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{orderNo || '-'}</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">หมายเหตุ</label>
            <textarea className="form-control" rows={2} value={remark} onChange={e => setRemark(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit}>ยืนยันเปิดออเดอร์</button>
        </div>
      </div>
    </div>
  )
}

// ฟอร์มสร้าง/แก้ไขคำขอตรวจยอดโอน — บัญชีเทียบยอดจากรายการสินค้า (รวม VAT) กับสลิปจริงเอง จึงไม่ต้องกรอกยอดโอน/ธนาคาร/วันเวลา
// flow: เลือกออเดอร์ -> ระบบดึงข้อมูลบริษัท/ประเภทลูกค้า/รายการสินค้าทั้งหมดของออเดอร์นั้นมาให้อัตโนมัติ -> กรอกประเภทการชำระ/PO/สลิป
// onSave(fields, items, slipFile) — App เป็นคนอัปโหลดสลิป + เขียน DB
export default function PaymentRequestModal({ initial, companies, isAdmin, onClose, onSave }) {
  const { toast } = useUi()
  const [f, setF] = useState(() => {
    const base = {
      request_date: todayStr(), order_id: '', company_id: '', quotation_id: '', po_reference: '',
      payment_type: 'ชำระเต็มจำนวน', credit_type: '', slip_file_url: '', remark: ''
    }
    if (!initial) return base
    const { company: _c, items: _i, order: _o, ...rest } = initial
    return { ...base, ...rest, request_date: (rest.request_date || base.request_date).slice(0, 10) }
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const [orders, setOrders] = useState(null)
  const [products, setProducts] = useState(null)
  const [items, setItems] = useState(() => initial?.items?.length
    ? initial.items.map(it => ({ product_id: it.product_id || '', sku: it.sku || '', product_name: it.product_name || '', quantity: it.quantity, unit_price: it.unit_price, discount: it.discount || 0, remark: it.remark || '' }))
    : [{ ...EMPTY_ITEM }])
  const [slipFile, setSlipFile] = useState(null)

  useEffect(() => {
    listProducts().then(setProducts).catch(() => setProducts([]))
    // ตัวเลือกออเดอร์ = ออเดอร์ที่ยังใช้งานอยู่ (Active) — กรณีแก้ไขคำขอเดิม เติมออเดอร์ที่ผูกไว้เข้าไปด้วยเผื่อถูกยกเลิกภายหลัง
    fetchOrders({ status: ORDER_STATUS.ACTIVE }).then(rows => {
      if (initial?.order_id && !rows.some(o => o.id === initial.order_id) && initial.order) rows = [initial.order, ...rows]
      setOrders(rows)
    }).catch(() => setOrders([]))
  }, [])

  // โหลดรายการสินค้าเดิมของคำขอที่กำลังแก้ไข
  useEffect(() => {
    if (!initial?.id) return
    listPaymentItems(initial.id).then(rows => {
      if (rows.length) setItems(rows.map(r => ({ product_id: r.product_id || '', sku: r.sku || '', product_name: r.product_name || '', quantity: r.quantity, unit_price: r.unit_price, discount: r.discount || 0, remark: r.remark || '' })))
    }).catch(() => {})
  }, [initial?.id])

  const companyById = new Map(companies.map(c => [c.id, c]))

  // เลือกออเดอร์ -> ดึงบริษัท/ประเภทลูกค้า/รายการสินค้าทั้งหมดของออเดอร์นั้นมาให้อัตโนมัติ ไม่ต้องกรอกซ้ำ
  const onOrderChange = async (orderId) => {
    if (!orderId) { setF(s => ({ ...s, order_id: '', company_id: '', quotation_id: '', credit_type: '' })); return }
    const order = (orders || []).find(o => o.id === orderId)
    const company = companyById.get(order?.company_id)
    setF(s => ({
      ...s, order_id: orderId, company_id: order?.company_id || '',
      quotation_id: order?.quotation_id || '', credit_type: creditLabel(company?.credit_term)
    }))
    try {
      const rows = await listOrderItems(orderId)
      if (rows.length) setItems(mapCopiedItems(rows))
      toast('ดึงข้อมูลจากออเดอร์แล้ว', 'success')
    } catch (e) { toast('ดึงข้อมูลจากออเดอร์ไม่สำเร็จ: ' + e.message, 'error') }
  }

  const updateItem = (i, patch) => setItems(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addItem = () => setItems(rows => [...rows, { ...EMPTY_ITEM }])
  const removeItem = (i) => setItems(rows => rows.filter((_, idx) => idx !== i))
  const onProductChange = (i, productId) => {
    const p = (products || []).find(x => x.id === productId)
    updateItem(i, { product_id: productId, sku: p ? p.code : items[i].sku, product_name: p ? p.name : items[i].product_name })
  }

  const lineTotal = (it) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0)
  // ยอดจากรายการถือว่ารวม VAT แล้ว (เหมือนดีล/ใบเสนอราคา) — แยกยอดไม่รวม VAT / VAT 7% ให้บัญชีดู
  const totals = computeDealTotals(items.map(it => ({ quantity: it.quantity, unit_price: lineTotal(it) / (Number(it.quantity) || 1) })))
  const itemsTotal = items.reduce((s, it) => s + lineTotal(it), 0)

  const orderById = new Map((orders || []).map(o => [o.id, o]))

  const submit = () => {
    if (!f.order_id) { toast('กรุณาเลือกออเดอร์', 'error'); return }
    if (!f.company_id) { toast('ไม่พบข้อมูลบริษัทจากออเดอร์นี้', 'error'); return }
    const company = companies.find(c => c.id === f.company_id)
    const order = orderById.get(f.order_id)
    const cleanItems = items.filter(it => it.product_name?.trim() || it.sku?.trim())
    const fields = {
      request_date: f.request_date || todayStr(),
      order_id: f.order_id,
      company_id: f.company_id || null,
      customer_name: order?.customer_name || company?.name || '',
      credit_type: f.credit_type || creditLabel(company?.credit_term),
      quotation_id: f.quotation_id || order?.quotation_id || null,
      po_reference: f.po_reference || null,
      payment_type: f.payment_type || null,
      total_amount: itemsTotal,
      slip_file_url: f.slip_file_url || null,
      remark: f.remark || null,
    }
    if (initial?.id) fields.id = initial.id
    onSave(fields, cleanItems, slipFile)
  }

  const orderLabel = (o) => `${o.order_no} - ${o.customer_name || companyById.get(o.company_id)?.name || '-'}${o.quot_no ? ` (${o.quot_no})` : ''}`

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div className="modal-title">{initial?.id ? 'แก้ไขคำขอตรวจยอด' : 'สร้างคำขอตรวจยอด'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">เลขที่ออเดอร์</label>
              <SearchableSelect options={orders || []} value={f.order_id} onChange={onOrderChange} placeholder={orders === null ? 'กำลังโหลด...' : '-- พิมพ์เพื่อค้นหาเลขที่ออเดอร์ --'} getOptionLabel={orderLabel} disabled={orders === null} />
            </div>
            <div className="form-group">
              <label className="form-label">วันที่คำขอ</label>
              <input className="form-control" type="date" value={f.request_date || ''} onChange={set('request_date')} />
            </div>
          </div>
          {f.company_id && (
            <div style={{ marginBottom: 12, fontSize: 13, display: 'flex', gap: 16, alignItems: 'center' }}>
              <span>บริษัท: <b>{companyById.get(f.company_id)?.name || '-'}</b></span>
              {f.credit_type && <span className={`badge ${f.credit_type.startsWith('ลูกค้าเครดิต') ? 'badge-orange' : 'badge-green'}`}>{f.credit_type}</span>}
            </div>
          )}

          <label className="form-label" style={{ marginTop: 4 }}>รายการสินค้า</label>
          <div className="table-wrap" style={{ marginBottom: 4 }}>
            <table>
              <thead>
                <tr>
                  <th>สินค้า / รายการ</th>
                  <th style={{ width: 70 }}>จำนวน</th>
                  <th style={{ width: 110 }}>ราคา/หน่วย</th>
                  <th style={{ width: 90 }}>ส่วนลด</th>
                  <th style={{ width: 100 }}>รวม</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>
                      <SearchableSelect options={products || []} value={it.product_id} onChange={v => onProductChange(i, v)} freeText={it.product_name} onFreeTextChange={v => updateItem(i, { product_name: v })} placeholder={products ? '-- พิมพ์ชื่อสินค้า หรือพิมพ์เอง --' : 'กำลังโหลด...'} getOptionLabel={p => `${p.code} - ${p.name}`} disabled={!products} />
                    </td>
                    <td><input className="form-control" type="number" min="0" value={it.quantity} onChange={e => updateItem(i, { quantity: e.target.value })} /></td>
                    <td><input className="form-control" type="number" min="0" value={it.unit_price} onChange={e => updateItem(i, { unit_price: e.target.value })} /></td>
                    <td><input className="form-control" type="number" min="0" value={it.discount} onChange={e => updateItem(i, { discount: e.target.value })} /></td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{lineTotal(it).toLocaleString('th-TH')}</td>
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
              <div>รวมทั้งสิ้น: <b style={{ color: 'var(--navy)' }}>{fmtCurrency(itemsTotal)}</b></div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ประเภทการชำระ</label>
              <EditableSelect listKey="payment_types" value={f.payment_type} onChange={v => setF(s => ({ ...s, payment_type: v }))} isAdmin={isAdmin} />
            </div>
            <div className="form-group">
              <label className="form-label">เลขที่ PO</label>
              <input className="form-control" value={f.po_reference || ''} onChange={set('po_reference')} placeholder="ไม่บังคับ" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">สลิปการโอน</label>
            <input className="form-control" type="file" accept="image/*,.pdf" onChange={e => setSlipFile(e.target.files?.[0] || null)} />
            {!slipFile && f.slip_file_url && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>มีสลิปแนบอยู่แล้ว (เลือกไฟล์ใหม่เพื่อแทนที่)</div>}
          </div>
          <div className="form-group">
            <label className="form-label">หมายเหตุ</label>
            <textarea className="form-control" rows={2} value={f.remark || ''} onChange={set('remark')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit}>บันทึก</button>
        </div>
      </div>
    </div>
  )
}
