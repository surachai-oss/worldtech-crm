import { useEffect, useState } from 'react'
import { listProducts, listPaymentItems, listDealItems, listQuotationItems, computeDealTotals } from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import EditableSelect from './EditableSelect'
import SearchableSelect from './SearchableSelect'

const EMPTY_ITEM = { product_id: '', sku: '', product_name: '', quantity: 1, unit_price: '', discount: 0, remark: '' }

const todayStr = () => new Date().toISOString().slice(0, 10)

// ป้ายประเภทลูกค้า (เครดิต/เงินสด) จากค่า credit_term ของบริษัทหรือใบเสนอราคา
function creditLabel(term) {
  if (term === null || term === undefined || term === '' || Number(term) === 0) return 'ลูกค้าเงินสด'
  const days = Number(term)
  return Number.isFinite(days) && days > 0 ? `ลูกค้าเครดิต (เครดิต ${days} วัน)` : 'ลูกค้าเครดิต'
}

// map แถวรายการสินค้าจากดีล/ใบเสนอราคา -> รูปแบบรายการของคำขอตรวจยอด
function mapCopiedItems(rows) {
  return rows.map(r => ({
    product_id: r.product_id || '',
    sku: r.product?.code || '',
    product_name: r.description || r.product?.name || '',
    quantity: r.quantity, unit_price: r.unit_price, discount: 0, remark: ''
  }))
}

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

// ฟอร์มสร้าง/แก้ไขคำขอตรวจยอดโอน — บัญชีเทียบยอดจากรายการสินค้า (รวม VAT) กับสลิปจริงเอง จึงไม่ต้องกรอกยอดโอน/ธนาคาร/วันเวลา
// onSave(fields, items, slipFile) — App เป็นคนอัปโหลดสลิป + เขียน DB
export default function PaymentRequestModal({ initial, companies, deals, quotations, isAdmin, onClose, onSave }) {
  const { toast } = useUi()
  const [f, setF] = useState(() => {
    const base = {
      request_date: todayStr(), company_id: '', deal_id: '', quotation_id: '', po_reference: '',
      payment_type: 'ชำระเต็มจำนวน', credit_type: '', slip_file_url: '', remark: ''
    }
    if (!initial) return base
    const { company: _c, items: _i, ...rest } = initial
    return { ...base, ...rest, request_date: (rest.request_date || base.request_date).slice(0, 10) }
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

  // เปลี่ยนลูกค้า -> ตั้งประเภทลูกค้า (เครดิต/เงินสด) จากข้อมูลบริษัทให้อัตโนมัติ + ล้างดีล/ใบเสนอราคาเดิม
  const onCompanyChange = (v) => {
    const c = companies.find(x => x.id === v)
    setF(s => ({ ...s, company_id: v, deal_id: '', quotation_id: '', credit_type: creditLabel(c?.credit_term) }))
  }

  // ปุ่มคัดลอกข้อมูลจากดีล — ดึงรายการสินค้ามาตั้งต้น ไม่ต้องกรอกซ้ำ
  const copyFromDeal = async () => {
    if (!f.deal_id) { toast('เลือกดีลก่อน', 'error'); return }
    try {
      const rows = await listDealItems(f.deal_id)
      if (!rows.length) { toast('ดีลนี้ไม่มีรายการสินค้า', 'info'); return }
      setItems(mapCopiedItems(rows))
      toast('คัดลอกรายการจากดีลแล้ว', 'success')
    } catch (e) { toast('ดึงข้อมูลจากดีลไม่สำเร็จ: ' + e.message, 'error') }
  }
  // ปุ่มคัดลอกข้อมูลจากใบเสนอราคา — ดึงรายการสินค้า + ประเภทลูกค้า (เครดิต/เงินสด) ตามใบเสนอราคานั้น
  const copyFromQuotation = async () => {
    if (!f.quotation_id) { toast('เลือกใบเสนอราคาก่อน', 'error'); return }
    try {
      const rows = await listQuotationItems(f.quotation_id)
      const quot = quotations.find(q => q.id === f.quotation_id)
      if (rows.length) setItems(mapCopiedItems(rows))
      setF(s => ({ ...s, credit_type: creditLabel(quot?.credit_term) }))
      toast(rows.length ? 'คัดลอกรายการจากใบเสนอราคาแล้ว' : 'ใบเสนอราคานี้ไม่มีรายการสินค้า', rows.length ? 'success' : 'info')
    } catch (e) { toast('ดึงข้อมูลจากใบเสนอราคาไม่สำเร็จ: ' + e.message, 'error') }
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

  const submit = () => {
    if (!f.company_id) { toast('กรุณาเลือกลูกค้า', 'error'); return }
    const company = companies.find(c => c.id === f.company_id)
    const cleanItems = items.filter(it => it.product_name?.trim() || it.sku?.trim())
    const fields = {
      request_date: f.request_date || todayStr(),
      company_id: f.company_id || null,
      customer_name: company ? company.name : '',
      credit_type: f.credit_type || creditLabel(company?.credit_term),
      deal_id: f.deal_id || null,
      quotation_id: f.quotation_id || null,
      po_reference: f.po_reference || null,
      payment_type: f.payment_type || null,
      total_amount: itemsTotal,
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
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">ลูกค้า</label>
              <SearchableSelect options={companies} value={f.company_id} onChange={onCompanyChange} placeholder="-- เลือกลูกค้า (พิมพ์เพื่อค้นหา) --" getOptionLabel={c => c.name} />
            </div>
            <div className="form-group">
              <label className="form-label">วันที่คำขอ</label>
              <input className="form-control" type="date" value={f.request_date || ''} onChange={set('request_date')} />
            </div>
          </div>
          {f.credit_type && (
            <div style={{ marginBottom: 12, fontSize: 13 }}>
              ประเภทลูกค้า: <span className={`badge ${f.credit_type.startsWith('ลูกค้าเครดิต') ? 'badge-orange' : 'badge-green'}`}>{f.credit_type}</span>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">ดีล (ถ้ามี)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <SearchableSelect options={companyDeals} value={f.deal_id} onChange={v => setF(s => ({ ...s, deal_id: v }))} placeholder={f.company_id ? '-- ไม่ระบุ --' : 'เลือกลูกค้าก่อน'} getOptionLabel={d => d.name} disabled={!f.company_id} />
                <button type="button" className="btn btn-outline btn-sm" onClick={copyFromDeal} disabled={!f.deal_id} title="ดึงรายการสินค้าจากดีลนี้" style={{ whiteSpace: 'nowrap' }}>คัดลอก</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">ใบเสนอราคา (ถ้ามี)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <SearchableSelect options={companyQuots} value={f.quotation_id} onChange={v => setF(s => ({ ...s, quotation_id: v }))} placeholder={f.company_id ? '-- ไม่ระบุ --' : 'เลือกลูกค้าก่อน'} getOptionLabel={q => `${q.quot_no} - ${q.subject}`} disabled={!f.company_id} />
                <button type="button" className="btn btn-outline btn-sm" onClick={copyFromQuotation} disabled={!f.quotation_id} title="ดึงรายการสินค้า + ประเภทลูกค้าจากใบเสนอราคานี้" style={{ whiteSpace: 'nowrap' }}>คัดลอก</button>
              </div>
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

          <label className="form-label" style={{ marginTop: 4 }}>รายการสินค้า (ราคาต่อหน่วยกรอกแบบรวม VAT แล้ว)</label>
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
