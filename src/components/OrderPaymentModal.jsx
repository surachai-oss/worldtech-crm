import { useEffect, useState } from 'react'
import {
  PAYMENT_STATUS, fetchPaymentRequestsByOrder, listPaymentItems, listOrderItems, listProducts, computeDealTotals,
  addPaymentRequestWithItems, updatePaymentRequestWithItems, submitPaymentRequest, uploadPaymentSlip, getPaymentSlipUrl,
  markPaymentOrderCreated, deletePaymentRequest, notifyFinancePaymentSubmitted,
} from '../lib/api'
import { fmtCurrency, paymentStatusLabel, paymentBadgeClass } from '../lib/format'
import { printPaymentApproval } from '../lib/printPaymentApproval'
import { useUi } from './UiContext'
import EditableSelect from './EditableSelect'
import SearchableSelect from './SearchableSelect'

const EMPTY_ITEM = { product_id: '', sku: '', product_name: '', quantity: 1, unit_price: '', discount: 0, remark: '' }
const todayStr = () => new Date().toISOString().slice(0, 10)
const EDITABLE_STATUSES = [PAYMENT_STATUS.DRAFT, PAYMENT_STATUS.NEED_INFO, PAYMENT_STATUS.MISMATCH]
const APPROVED_STATES = [PAYMENT_STATUS.APPROVED, PAYMENT_STATUS.ORDER_CREATED]

// ป้ายประเภทลูกค้า (เครดิต/เงินสด) จากค่า credit_term ของบริษัท
function creditLabel(term) {
  if (term === null || term === undefined || term === '' || Number(term) === 0) return 'ลูกค้าเงินสด'
  const days = Number(term)
  return Number.isFinite(days) && days > 0 ? `ลูกค้าเครดิต (เครดิต ${days} วัน)` : 'ลูกค้าเครดิต'
}

// map แถวรายการสินค้าจากออเดอร์ -> รูปแบบรายการของคำขอตรวจยอด
function mapCopiedItems(rows) {
  return rows.map(r => ({
    product_id: r.product_id || '', sku: r.product?.code || '', product_name: r.description || r.product?.name || '',
    quantity: r.quantity, unit_price: r.unit_price, discount: 0, remark: '',
  }))
}

// ฟอร์มสร้าง/แก้ไขคำขอตรวจยอด — ผูกกับออเดอร์นี้เสมอ (ไม่ต้องเลือกออเดอร์เอง เหมือนเดิม) รายการสินค้าดึงจากออเดอร์ให้อัตโนมัติตอนสร้างใหม่
// onSaved เรียกทั้งกรณีบันทึกร่างและส่งให้บัญชี — parent จะปิดฟอร์ม + โหลดคำขอใหม่
function PaymentRequestForm({ order, companies, existing, currentUser, isAdmin, onClose, onSaved }) {
  const { toast, confirm } = useUi()
  const company = companies.find(c => c.id === order.company_id)
  const [f, setF] = useState(() => ({
    request_date: (existing?.request_date || '').slice(0, 10) || todayStr(),
    po_reference: existing?.po_reference || '',
    payment_type: existing?.payment_type || 'ชำระเต็มจำนวน',
    slip_file_url: existing?.slip_file_url || '',
    remark: existing?.remark || '',
  }))
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))
  const [items, setItems] = useState(() => [{ ...EMPTY_ITEM }])
  const [products, setProducts] = useState(null)
  const [slipFile, setSlipFile] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { listProducts().then(setProducts).catch(() => setProducts([])) }, [])

  // คำขอเดิม: โหลดรายการสินค้าเดิม / คำขอใหม่: คัดลอกรายการสินค้าจากออเดอร์มาให้
  useEffect(() => {
    if (existing?.id) {
      listPaymentItems(existing.id).then(rows => {
        if (rows.length) setItems(rows.map(r => ({ product_id: r.product_id || '', sku: r.sku || '', product_name: r.product_name || '', quantity: r.quantity, unit_price: r.unit_price, discount: r.discount || 0, remark: r.remark || '' })))
      }).catch(() => {})
    } else {
      listOrderItems(order.id).then(rows => { if (rows.length) setItems(mapCopiedItems(rows)) }).catch(() => {})
    }
  }, [existing?.id, order.id])

  const updateItem = (i, patch) => setItems(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addItem = () => setItems(rows => [...rows, { ...EMPTY_ITEM }])
  const removeItem = (i) => setItems(rows => rows.filter((_, idx) => idx !== i))
  const onProductChange = (i, productId) => {
    const p = (products || []).find(x => x.id === productId)
    updateItem(i, { product_id: productId, sku: p ? p.code : items[i].sku, product_name: p ? p.name : items[i].product_name })
  }

  const lineTotal = (it) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0)
  const totals = computeDealTotals(items.map(it => ({ quantity: it.quantity, unit_price: lineTotal(it) / (Number(it.quantity) || 1) })))
  const itemsTotal = items.reduce((s, it) => s + lineTotal(it), 0)
  const cleanItems = () => items.filter(it => it.product_name?.trim() || it.sku?.trim())

  const buildFields = () => ({
    request_date: f.request_date || todayStr(),
    order_id: order.id, company_id: order.company_id || null,
    customer_name: order.customer_name || company?.name || '',
    credit_type: creditLabel(company?.credit_term),
    quotation_id: order.quotation_id || null,
    po_reference: f.po_reference || null,
    payment_type: f.payment_type || null,
    total_amount: itemsTotal,
    slip_file_url: f.slip_file_url || null,
    remark: f.remark || null,
  })

  // สร้าง/แก้ไข ตัวคำขอ+รายการสินค้า — ไม่แตะสถานะ (ใช้ทั้งบันทึกร่างและก่อนส่งบัญชี)
  const persist = async () => {
    let slip_file_url = f.slip_file_url
    if (slipFile) slip_file_url = await uploadPaymentSlip(existing?.id || null, slipFile)
    const fields = { ...buildFields(), slip_file_url }
    if (existing?.id) return updatePaymentRequestWithItems(existing.id, fields, cleanItems())
    return addPaymentRequestWithItems({ ...fields, status: PAYMENT_STATUS.DRAFT, requested_by_name: currentUser.name, requested_by_email: currentUser.email, _actorName: currentUser.name }, cleanItems())
  }

  const saveDraft = async () => {
    setBusy(true)
    try { await persist(); toast('บันทึกฉบับร่างแล้ว', 'success'); onSaved() }
    catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const submit = async () => {
    if (!cleanItems().length) { toast('ต้องมีรายการสินค้าอย่างน้อย 1 รายการ', 'error'); return }
    if (!slipFile && !f.slip_file_url) { toast('กรุณาแนบสลิปการโอน', 'error'); return }
    if (!(await confirm('ส่งคำขอให้บัญชีตรวจ? หลังส่งแล้วจะแก้ไขไม่ได้จนกว่าบัญชีจะตีกลับ'))) return
    setBusy(true)
    try {
      const pr = await persist()
      await submitPaymentRequest(pr.id, currentUser.name)
      notifyFinancePaymentSubmitted(pr.id).then(res => {
        if (res?.inApp || res?.email) toast('แจ้งเตือนฝ่ายบัญชีแล้ว', 'success')
      }).catch(() => {})
      toast(existing?.id ? 'ส่งคำขอที่แก้ไขให้บัญชีแล้ว' : 'ส่งให้บัญชีตรวจแล้ว', 'success')
      onSaved()
    } catch (e) { toast('ส่งไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  // บันทึกร่าง (ไม่ส่งบัญชี) ให้เฉพาะคำขอใหม่/ที่ยังเป็นร่าง — เคยส่งไปแล้ว (Need More Info/ยอดไม่ตรง) ต้องแก้แล้วส่งใหม่เท่านั้น
  const showDraftBtn = !existing || existing.status === PAYMENT_STATUS.DRAFT

  return (
    <div>
      {company && (
        <div style={{ marginBottom: 10, fontSize: 13, display: 'flex', gap: 16, alignItems: 'center' }}>
          <span>บริษัท: <b>{order.customer_name || company.name}</b></span>
          <span className={`badge ${creditLabel(company.credit_term).startsWith('ลูกค้าเครดิต') ? 'badge-orange' : 'badge-green'}`}>{creditLabel(company.credit_term)}</span>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">วันที่คำขอ</label>
        <input className="form-control" type="date" value={f.request_date} onChange={set('request_date')} style={{ maxWidth: 180 }} />
      </div>

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
          <input className="form-control" value={f.po_reference} onChange={set('po_reference')} placeholder="ไม่บังคับ" />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label required">สลิปการโอน</label>
        <input className="form-control" type="file" accept="image/*,.pdf" onChange={e => setSlipFile(e.target.files?.[0] || null)} />
        {!slipFile && f.slip_file_url && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>มีสลิปแนบอยู่แล้ว (เลือกไฟล์ใหม่เพื่อแทนที่)</div>}
      </div>
      <div className="form-group">
        <label className="form-label">หมายเหตุ</label>
        <textarea className="form-control" rows={2} value={f.remark} onChange={set('remark')} />
      </div>

      <div className="modal-footer" style={{ padding: '4px 0 0', flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>ยกเลิก</button>
        {showDraftBtn && <button className="btn btn-secondary" onClick={saveDraft} disabled={busy}>บันทึก (ฉบับร่าง)</button>}
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{existing?.id ? 'ส่งคำขอที่แก้ไข' : 'ส่งให้บัญชี'}</button>
      </div>
    </div>
  )
}

// แสดงคำขอ 1 ใบ พร้อมสถานะปัจจุบันจากฝั่งบัญชี + action ตามสถานะ (แก้ไข/ดูสลิป/ดาวน์โหลด PDF/ยืนยันเปิดออเดอร์/ลบ)
function PaymentRequestCard({ pr, order, settings, perm, currentUser, onEdit, onChanged }) {
  const { toast, confirm } = useUi()
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)

  const viewSlip = async () => {
    if (!pr.slip_file_url) { toast('ยังไม่มีสลิปแนบ', 'info'); return }
    try { window.open(await getPaymentSlipUrl(pr.slip_file_url), '_blank') }
    catch (e) { toast('เปิดสลิปไม่สำเร็จ: ' + e.message, 'error') }
  }

  const owns = perm.isAdmin || perm.isFinance || pr.created_by === perm.userId || pr.created_by == null
  const editable = EDITABLE_STATUSES.includes(pr.status) && owns

  const confirmOrder = async () => {
    if (!(await confirm(`ยืนยันเปิดออเดอร์ ${order.order_no} ในระบบบัญชี?`))) return
    setBusy(true)
    try {
      await markPaymentOrderCreated(pr.id, { orderNo: order.order_no, remark: remark.trim(), actorName: currentUser.name })
      toast('บันทึกการเปิดออเดอร์แล้ว', 'success')
      onChanged()
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const doDelete = async () => {
    if (!(await confirm(`ลบคำขอ ${pr.pr_no}?`))) return
    setBusy(true)
    try { await deletePaymentRequest(pr.id); toast('ลบสำเร็จ', 'success'); onChanged() }
    catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 600 }}>{pr.pr_no}</div>
          <span className={`badge ${paymentBadgeClass(pr.status)}`}>{paymentStatusLabel(pr.status)}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>ยอดรวม: <b style={{ color: 'var(--navy)' }}>{fmtCurrency(pr.total_amount)}</b></div>
        {pr.finance_remark && <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>หมายเหตุจากบัญชี: {pr.finance_remark}</div>}
        {pr.approval_ref_no && <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>เลขที่อนุมัติ: {pr.approval_ref_no}</div>}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {pr.slip_file_url && <button className="btn btn-outline btn-xs" onClick={viewSlip}>ดูสลิป</button>}
          {editable && <button className="btn btn-outline btn-xs" onClick={() => onEdit(pr)}>แก้ไข</button>}
          {APPROVED_STATES.includes(pr.status) && <button className="btn btn-outline btn-xs" onClick={() => printPaymentApproval(pr, settings)}>ดาวน์โหลด PDF</button>}
          {pr.status === PAYMENT_STATUS.DRAFT && owns && <button className="btn btn-danger btn-xs" onClick={doDelete} disabled={busy}>ลบ</button>}
        </div>

        {pr.status === PAYMENT_STATUS.APPROVED && owns && (
          <div style={{ marginTop: 10 }}>
            <label className="form-label">หมายเหตุ (ไม่บังคับ)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="form-control" value={remark} onChange={e => setRemark(e.target.value)} placeholder="หมายเหตุ" />
              <button className="btn btn-success btn-sm" onClick={confirmOrder} disabled={busy} style={{ whiteSpace: 'nowrap' }}>ยืนยันเปิดออเดอร์</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ป็อปอัปหลักเปิดจากหน้า "ออเดอร์" — เซลล์สร้าง/แก้ไขคำขอตรวจยอด + ติดตามสถานะจากฝั่งบัญชีในที่เดียว (แทนที่การไปสร้างแยกที่หน้า "การเงิน")
export default function OrderPaymentModal({ order, companies, perm, currentUser, settings, onClose }) {
  const { toast } = useUi()
  const [requests, setRequests] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = () => {
    if (!order?.id) { setRequests([]); return }
    fetchPaymentRequestsByOrder(order.id).then(setRequests).catch(e => toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error'))
  }
  useEffect(() => { load() }, [order?.id])

  const onSaved = () => { setFormOpen(false); setEditing(null); load() }
  const startEdit = (pr) => { setEditing(pr); setFormOpen(false) }

  // มีคำขอที่ยังไม่ถูกปฏิเสธอยู่แล้ว -> ไม่ให้สร้างใหม่ซ้ำ (ปฏิเสธแล้วถึงจะเปิดคำขอใหม่ได้)
  const hasLiveRequest = (requests || []).some(r => r.status !== PAYMENT_STATUS.REJECTED)

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div className="modal-title">คำขอตรวจยอด · {order.order_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {requests === null ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-light)' }}>กำลังโหลด...</div>
          ) : (
            <>
              {requests.map(pr => (
                editing?.id === pr.id
                  ? <div className="card" key={pr.id} style={{ marginBottom: 10 }}><div className="card-body">
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>แก้ไขคำขอ: {pr.pr_no}</div>
                      <PaymentRequestForm order={order} companies={companies} existing={pr} currentUser={currentUser} isAdmin={perm.isAdmin} onClose={() => setEditing(null)} onSaved={onSaved} />
                    </div></div>
                  : <PaymentRequestCard key={pr.id} pr={pr} order={order} settings={settings} perm={perm} currentUser={currentUser} onEdit={startEdit} onChanged={load} />
              ))}

              {!hasLiveRequest && !editing && (formOpen ? (
                <div className="card"><div className="card-body">
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>สร้างคำขอตรวจยอด</div>
                  <PaymentRequestForm order={order} companies={companies} existing={null} currentUser={currentUser} isAdmin={perm.isAdmin} onClose={() => setFormOpen(false)} onSaved={onSaved} />
                </div></div>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => setFormOpen(true)}>+ สร้างคำขอตรวจยอด</button>
              ))}
            </>
          )}
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={onClose}>ปิด</button></div>
      </div>
    </div>
  )
}
