import { useEffect, useState } from 'react'
import { listProducts, listPaymentItems } from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import EditableSelect from './EditableSelect'
import SearchableSelect from './SearchableSelect'

const EMPTY_ITEM = { product_id: '', sku: '', product_name: '', quantity: 1, unit_price: '', discount: 0, remark: '' }

// ป็อปอัปเล็กๆ ให้ Sale กรอกเลขออเดอร์หลังบัญชีอนุมัติแล้ว
export function PaymentOrderModal({ pr, onClose, onSave }) {
  const { toast } = useUi()
  const [orderNo, setOrderNo] = useState('')
  const [remark, setRemark] = useState('')
  const submit = () => {
    if (!orderNo.trim()) { toast('กรุณากรอกเลขออเดอร์', 'error'); return }
    onSave(pr, orderNo.trim(), remark.trim())
  }
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">เปิดออเดอร์ · {pr.pr_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label required">เลขที่ออเดอร์</label>
            <input className="form-control" value={orderNo} onChange={e => setOrderNo(e.target.value)} autoFocus placeholder="เช่น SO-2569-00123" />
          </div>
          <div className="form-group">
            <label className="form-label">หมายเหตุ</label>
            <textarea className="form-control" rows={2} value={remark} onChange={e => setRemark(e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={submit}>บันทึกการเปิดออเดอร์</button>
        </div>
      </div>
    </div>
  )
}

// ฟอร์มสร้าง/แก้ไขคำขอตรวจยอดโอน — ฟิลด์ตาม requirement (ลูกค้า/ยอด/สลิป/รายการสินค้า)
// onSave(fields, items, slipFile) — App เป็นคนอัปโหลดสลิป + เขียน DB
export default function PaymentRequestModal({ initial, companies, deals, quotations, isAdmin, onClose, onSave }) {
  const { toast } = useUi()
  const [f, setF] = useState(() => {
    const base = {
      company_id: '', deal_id: '', quotation_id: '', po_reference: '', payment_type: 'ชำระเต็มจำนวน',
      expected_amount: '', paid_amount: '', difference_reason: '', bank_account: '', transfer_date: '', transfer_time: '',
      slip_file_url: '', remark: ''
    }
    if (!initial) return base
    const { company: _c, items: _i, ...rest } = initial
    return { ...base, ...rest }
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const [products, setProducts] = useState(null)
  const [items, setItems] = useState(() => initial?.items?.length
    ? initial.items.map(it => ({ product_id: it.product_id || '', sku: it.sku || '', product_name: it.product_name || '', quantity: it.quantity, unit_price: it.unit_price, discount: it.discount || 0, remark: it.remark || '' }))
    : [{ ...EMPTY_ITEM }])
  const [slipFile, setSlipFile] = useState(null)

  useEffect(() => { listProducts().then(setProducts).catch(() => setProducts([])) }, [])

  // โหลดรายการสินค้าเดิมของคำขอที่กำลังแก้ไข
  useEffect(() => {
    if (!initial?.id) return
    listPaymentItems(initial.id).then(rows => {
      if (rows.length) setItems(rows.map(r => ({ product_id: r.product_id || '', sku: r.sku || '', product_name: r.product_name || '', quantity: r.quantity, unit_price: r.unit_price, discount: r.discount || 0, remark: r.remark || '' })))
    }).catch(() => {})
  }, [initial?.id])

  const companyDeals = f.company_id ? deals.filter(d => d.company_id === f.company_id) : []
  const companyQuots = f.company_id ? quotations.filter(q => q.company_id === f.company_id) : []

  const updateItem = (i, patch) => setItems(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addItem = () => setItems(rows => [...rows, { ...EMPTY_ITEM }])
  const removeItem = (i) => setItems(rows => rows.filter((_, idx) => idx !== i))
  const onProductChange = (i, productId) => {
    const p = (products || []).find(x => x.id === productId)
    updateItem(i, { product_id: productId, sku: p ? p.code : items[i].sku, product_name: p ? p.name : items[i].product_name })
  }

  const lineTotal = (it) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0)
  const itemsTotal = items.reduce((s, it) => s + lineTotal(it), 0)
  const expected = Number(f.expected_amount) || 0
  const paid = Number(f.paid_amount) || 0
  const diff = paid - expected

  const submit = () => {
    if (!f.company_id) { toast('กรุณาเลือกลูกค้า', 'error'); return }
    if (diff !== 0 && !f.difference_reason?.trim()) { toast('ยอดโอนไม่ตรงกับยอดที่ต้องชำระ กรุณาระบุเหตุผล', 'error'); return }
    const company = companies.find(c => c.id === f.company_id)
    const cleanItems = items.filter(it => it.product_name?.trim() || it.sku?.trim())
    const fields = {
      company_id: f.company_id || null,
      customer_name: company ? company.name : '',
      deal_id: f.deal_id || null,
      quotation_id: f.quotation_id || null,
      po_reference: f.po_reference || null,
      payment_type: f.payment_type || null,
      expected_amount: expected,
      paid_amount: paid,
      difference_amount: diff,
      difference_reason: f.difference_reason || null,
      bank_account: f.bank_account || null,
      transfer_date: f.transfer_date || null,
      transfer_time: f.transfer_time || null,
      slip_file_url: f.slip_file_url || null,
      remark: f.remark || null,
    }
    if (initial?.id) fields.id = initial.id
    onSave(fields, cleanItems, slipFile)
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div className="modal-title">{initial?.id ? 'แก้ไขคำขอตรวจยอด' : 'สร้างคำขอตรวจยอด'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label required">ลูกค้า</label>
            <SearchableSelect options={companies} value={f.company_id} onChange={v => setF(s => ({ ...s, company_id: v, deal_id: '', quotation_id: '' }))} placeholder="-- เลือกลูกค้า (พิมพ์เพื่อค้นหา) --" getOptionLabel={c => c.name} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ดีล (ถ้ามี)</label>
              <SearchableSelect options={companyDeals} value={f.deal_id} onChange={v => setF(s => ({ ...s, deal_id: v }))} placeholder={f.company_id ? '-- ไม่ระบุ --' : 'เลือกลูกค้าก่อน'} getOptionLabel={d => d.name} disabled={!f.company_id} />
            </div>
            <div className="form-group">
              <label className="form-label">ใบเสนอราคา (ถ้ามี)</label>
              <SearchableSelect options={companyQuots} value={f.quotation_id} onChange={v => setF(s => ({ ...s, quotation_id: v }))} placeholder={f.company_id ? '-- ไม่ระบุ --' : 'เลือกลูกค้าก่อน'} getOptionLabel={q => `${q.quot_no} - ${q.subject}`} disabled={!f.company_id} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">เลขที่ PO</label>
              <input className="form-control" value={f.po_reference || ''} onChange={set('po_reference')} placeholder="ไม่บังคับ" />
            </div>
            <div className="form-group">
              <label className="form-label">ประเภทการชำระ</label>
              <EditableSelect listKey="payment_types" value={f.payment_type} onChange={v => setF(s => ({ ...s, payment_type: v }))} isAdmin={isAdmin} />
            </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>+ เพิ่มรายการ</button>
            <div style={{ fontSize: 13 }}>รวมรายการสินค้า: <b style={{ color: 'var(--navy)' }}>{fmtCurrency(itemsTotal)}</b></div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ยอดที่ต้องชำระ</label>
              <input className="form-control" type="number" min="0" value={f.expected_amount} onChange={set('expected_amount')} placeholder="0.00" />
            </div>
            <div className="form-group">
              <label className="form-label">ยอดที่ลูกค้าโอนจริง</label>
              <input className="form-control" type="number" min="0" value={f.paid_amount} onChange={set('paid_amount')} placeholder="0.00" />
            </div>
          </div>
          <div style={{ fontSize: 13, marginBottom: 10, color: diff === 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            ผลต่าง: {fmtCurrency(diff)} {diff === 0 ? '(ยอดตรง)' : diff > 0 ? '(โอนเกิน)' : '(โอนขาด)'}
          </div>
          {diff !== 0 && (
            <div className="form-group">
              <label className="form-label required">เหตุผลที่ยอดไม่ตรง</label>
              <input className="form-control" value={f.difference_reason || ''} onChange={set('difference_reason')} placeholder="เช่น หักค่าธรรมเนียมโอน, มัดจำบางส่วน" />
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ธนาคารที่รับโอน</label>
              <input className="form-control" value={f.bank_account || ''} onChange={set('bank_account')} placeholder="เช่น KBANK xxx-x-xxxxx-x" />
            </div>
            <div className="form-group">
              <label className="form-label">วันที่โอน</label>
              <input className="form-control" type="date" value={f.transfer_date || ''} onChange={set('transfer_date')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">เวลาที่โอน</label>
              <input className="form-control" type="time" value={f.transfer_time || ''} onChange={set('transfer_time')} />
            </div>
            <div className="form-group">
              <label className="form-label">สลิปการโอน</label>
              <input className="form-control" type="file" accept="image/*,.pdf" onChange={e => setSlipFile(e.target.files?.[0] || null)} />
              {!slipFile && f.slip_file_url && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>มีสลิปแนบอยู่แล้ว (เลือกไฟล์ใหม่เพื่อแทนที่)</div>}
            </div>
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
