import { useEffect, useState } from 'react'
import { listQuotationItems, computeDealTotals, fetchActiveOrderQuotationIds, listProducts, genOrderNo, peekOrderNo } from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import SearchableSelect from './SearchableSelect'
import DiscountField from './DiscountField'

const EMPTY_ITEM = { product_id: '', description: '', quantity: 1, unit_price: '' }

// map แถวรายการสินค้าจากใบเสนอราคา -> รูปแบบรายการของออเดอร์ (ไม่มีส่วนลด/หมายเหตุเหมือน quotation_items/deal_items)
function mapCopiedItems(rows) {
  return rows.map(r => ({
    product_id: r.product_id || '', description: r.description || r.product?.name || '',
    quantity: r.quantity, unit_price: r.unit_price,
  }))
}

// ฟอร์มสร้างออเดอร์ใหม่ — เลือกใบเสนอราคา -> คัดลอกบริษัท (ชื่อ/เลขผู้เสียภาษี/ที่อยู่/เบอร์/อีเมล) + รายการสินค้าทั้งหมดมาให้อัตโนมัติ -> กรอกที่อยู่จัดส่งเพิ่ม
// เลขออเดอร์ (WTE{ปี}WT{เลขรัน}) ที่โชว์ตอนเปิดฟอร์ม/สลับประเภท เป็นแค่ "พรีวิว" (peekOrderNo — อ่านอย่างเดียว ไม่เพิ่ม counter)
// เลขจริงจะถูกจอง (เพิ่ม counter จริงผ่าน genOrderNo) ตอนกดบันทึกออเดอร์เท่านั้น กันเลขถูกใช้ไปเปล่าๆ จากการเปิดฟอร์มดูหรือสลับประเภทไปมาโดยไม่ได้บันทึก
// onSave(fields, items) — บันทึกแล้วแก้ไขไม่ได้อีก (ยกเลิกได้อย่างเดียว) จึงไม่มีโหมดแก้ไขในคอมโพเนนต์นี้
export default function OrderModal({ companies, quotations, currentUser, onClose, onSave }) {
  const { toast, confirm } = useUi()
  const { t, lang } = useLanguage()
  const [orderType, setOrderType] = useState('ปกติ')
  const [orderNo, setOrderNo] = useState(null)
  const [saving, setSaving] = useState(false)
  const [quotationId, setQuotationId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [companyInfo, setCompanyInfo] = useState({ tax_id: '', address: '', phone: '', email: '' })
  const [quotNo, setQuotNo] = useState('')
  const [items, setItems] = useState([{ ...EMPTY_ITEM }])
  const [shippingAddress, setShippingAddress] = useState('')
  const [shippingContactName, setShippingContactName] = useState('')
  const [shippingContactPhone, setShippingContactPhone] = useState('')
  const [remark, setRemark] = useState('')
  const [discountType, setDiscountType] = useState('')
  const [discountValue, setDiscountValue] = useState(0)
  const [usedQuotationIds, setUsedQuotationIds] = useState(null)
  const [products, setProducts] = useState(null)

  // แค่ดูตัวอย่างเลขถัดไป (ไม่เพิ่ม counter จริง) ทุกครั้งที่เปลี่ยนประเภท เพราะ WT (ปกติ) กับ GB (Grade B) เป็นคนละชุดเลข
  const previewOrderNo = (type) => { setOrderNo(null); peekOrderNo(type).then(setOrderNo).catch(e => toast('ดูเลขออเดอร์ไม่สำเร็จ: ' + e.message, 'error')) }

  useEffect(() => {
    fetchActiveOrderQuotationIds().then(setUsedQuotationIds).catch(() => setUsedQuotationIds(new Set()))
    listProducts().then(setProducts).catch(() => setProducts([]))
    previewOrderNo(orderType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const companyById = new Map(companies.map(c => [c.id, c]))
  // ตัดใบเสนอราคาที่ผูกออเดอร์ Active อยู่แล้วออกจากตัวเลือก (เลือกซ้ำไม่ได้จนกว่าออเดอร์เดิมจะถูกยกเลิก)
  const availableQuots = usedQuotationIds ? quotations.filter(q => !usedQuotationIds.has(q.id)) : []

  const onQuotationChange = async (quotId) => {
    setQuotationId(quotId)
    if (!quotId) {
      setCompanyId(''); setCustomerName(''); setQuotNo('')
      setCompanyInfo({ tax_id: '', address: '', phone: '', email: '' })
      setDiscountType(''); setDiscountValue(0)
      return
    }
    const quot = quotations.find(q => q.id === quotId)
    const company = companyById.get(quot?.company_id)
    setCompanyId(quot?.company_id || '')
    setCustomerName(company?.name || '')
    setQuotNo(quot?.quot_no || '')
    setCompanyInfo({ tax_id: company?.tax_id || '', address: company?.address || '', phone: company?.phone || '', email: company?.email || '' })
    // คัดลอกส่วนลดท้ายบิลจากใบเสนอราคามาให้ด้วย (แก้ไขต่อได้ก่อนบันทึก) เพราะใบเสนอราคา/ออเดอร์เชื่อมกัน
    setDiscountType(quot?.discount_type || ''); setDiscountValue(quot?.discount_value || 0)
    try {
      const rows = await listQuotationItems(quotId)
      if (rows.length) setItems(mapCopiedItems(rows))
    } catch (e) { toast('ดึงข้อมูลจากใบเสนอราคาไม่สำเร็จ: ' + e.message, 'error') }
  }

  const updateItem = (i, patch) => setItems(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addItem = () => setItems(rows => [...rows, { ...EMPTY_ITEM }])
  const removeItem = (i) => setItems(rows => rows.filter((_, idx) => idx !== i))
  const onProductChange = (i, productId) => {
    const p = (products || []).find(x => x.id === productId)
    updateItem(i, { product_id: productId, description: p ? p.name : items[i].description })
  }

  const totals = computeDealTotals(items, { type: discountType, value: discountValue })
  const cleanItems = items.filter(it => it.description?.trim())

  const submit = async () => {
    if (!orderNo) { toast('กำลังรันเลขออเดอร์ กรุณารอสักครู่', 'error'); return }
    if (!quotationId) { toast('กรุณาเลือกใบเสนอราคา', 'error'); return }
    if (!cleanItems.length) { toast('กรุณาใส่รายการสินค้าอย่างน้อย 1 รายการ', 'error'); return }
    if (!shippingAddress.trim()) { toast('กรุณากรอกที่อยู่จัดส่ง', 'error'); return }
    const confirmMsg = lang === 'en'
      ? `Confirm saving order ${orderNo}?\n\nOnce saved, this order cannot be edited — you can only cancel it and open a new one if there's a mistake.`
      : `ยืนยันบันทึกออเดอร์เลขที่ ${orderNo}?\n\nหลังบันทึกแล้วจะแก้ไขข้อมูลไม่ได้อีก หากลงข้อมูลผิดต้องยกเลิกออเดอร์นี้แล้วเปิดออเดอร์ใหม่เท่านั้น`
    if (!(await confirm(confirmMsg))) return
    setSaving(true)
    // จองเลขออเดอร์จริงตรงนี้เท่านั้น (เพิ่ม counter จริง) — ก่อนหน้านี้ที่โชว์อยู่เป็นแค่พรีวิว เผื่อมีคนอื่นบันทึกออเดอร์ประเภทเดียวกันแทรกไปก่อน เลขจริงอาจไม่ตรงกับที่ยืนยันแบบเป๊ะๆ แต่ไม่มีทางซ้ำกันแน่นอน
    let realOrderNo
    try { realOrderNo = await genOrderNo(orderType) }
    catch (e) { toast('รันเลขออเดอร์ไม่สำเร็จ: ' + e.message, 'error'); setSaving(false); return }
    onSave({
      order_no: realOrderNo, order_type: orderType, quotation_id: quotationId, quot_no: quotNo, company_id: companyId || null, customer_name: customerName,
      company_tax_id: companyInfo.tax_id || null, company_address: companyInfo.address || null,
      company_phone: companyInfo.phone || null, company_email: companyInfo.email || null,
      shipping_address: shippingAddress.trim(), shipping_contact_name: shippingContactName.trim() || null,
      shipping_contact_phone: shippingContactPhone.trim() || null, remark: remark.trim() || null,
      sales_id: currentUser.id, sales_name: currentUser.name,
      discount_type: discountType || null, discount_value: discountValue || 0,
    }, cleanItems)
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div className="modal-title">{t('สร้างออเดอร์')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">{t('ประเภทออเดอร์')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={`btn btn-sm ${orderType === 'ปกติ' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setOrderType('ปกติ'); previewOrderNo('ปกติ') }}>{t('สินค้าปกติ (WT)')}</button>
              <button type="button" className={`btn btn-sm ${orderType === 'Grade B' ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setOrderType('Grade B'); previewOrderNo('Grade B') }}>{t('สินค้า Grade B (GB)')}</button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-light)' }}>{t('เลขที่ออเดอร์ (โดยประมาณ)')}</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--navy)' }}>{orderNo || t('กำลังโหลด...')}</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: -10, marginBottom: 16 }}>{lang === 'en' ? "This number isn't reserved until you actually save the order" : 'เลขนี้จะยังไม่ถูกใช้จนกว่าจะกดบันทึกออเดอร์จริง'}</div>

          <div className="form-group">
            <label className="form-label required">{t('เลขที่ใบเสนอราคา')}</label>
            <SearchableSelect
              options={availableQuots} value={quotationId} onChange={onQuotationChange}
              placeholder={usedQuotationIds === null ? t('กำลังโหลด...') : (lang === 'en' ? '-- Type to search quotation no. --' : '-- พิมพ์เพื่อค้นหาเลขที่ใบเสนอราคา --')}
              getOptionLabel={q => `${q.quot_no} - ${q.subject} (${companyById.get(q.company_id)?.name || '-'})`}
              disabled={usedQuotationIds === null}
            />
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('แสดงเฉพาะใบเสนอราคาที่ยังไม่ถูกใช้เปิดออเดอร์อื่น')}</div>
          </div>

          {companyId && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
                <div><b>{customerName}</b></div>
                {companyInfo.tax_id && <div>{t('เลขประจำตัวผู้เสียภาษี')}: {companyInfo.tax_id}</div>}
                {companyInfo.address && <div>{t('ที่อยู่')}: {companyInfo.address}</div>}
                {companyInfo.phone && <div>{t('โทร')}: {companyInfo.phone}</div>}
                {companyInfo.email && <div>{t('อีเมล')}: {companyInfo.email}</div>}
              </div>
            </div>
          )}

          <label className="form-label" style={{ marginTop: 4 }}>{t('รายการสินค้า')}</label>
          <div className="table-wrap" style={{ marginBottom: 4 }}>
            <table>
              <thead>
                <tr>
                  <th>{t('สินค้า / รายการ')}</th>
                  <th style={{ width: 70 }}>{t('จำนวน')}</th>
                  <th style={{ width: 120 }}>{t('ราคา/หน่วย')}</th>
                  <th style={{ width: 110 }}>{t('รวม')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i}>
                    <td>
                      <SearchableSelect options={products || []} value={it.product_id} onChange={v => onProductChange(i, v)} freeText={it.description} onFreeTextChange={v => updateItem(i, { description: v })} placeholder={products ? (lang === 'en' ? '-- Type a product name, or type your own --' : '-- พิมพ์ชื่อสินค้า หรือพิมพ์เอง --') : t('กำลังโหลด...')} getOptionLabel={p => `${p.code} - ${p.name}`} disabled={!products} />
                    </td>
                    <td><input className="form-control" type="number" min="0" value={it.quantity} onChange={e => updateItem(i, { quantity: e.target.value })} /></td>
                    <td><input className="form-control" type="number" min="0" value={it.unit_price} onChange={e => updateItem(i, { unit_price: e.target.value })} /></td>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toLocaleString('th-TH')}</td>
                    <td><button type="button" className="btn btn-danger btn-xs" onClick={() => removeItem(i)}>{t('ลบ')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={addItem}>{t('+ เพิ่มรายการ')}</button>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">{t('ส่วนลดท้ายบิล')}</label>
            <DiscountField type={discountType} value={discountValue} onChangeType={setDiscountType} onChangeValue={setDiscountValue} />
          </div>

          <div className="card" style={{ marginTop: 8, marginBottom: 14 }}>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, fontSize: 13 }}>
              <div>{t('ไม่รวม VAT')}: <b>{totals.exVat.toLocaleString('th-TH')}</b></div>
              <div>VAT 7%: <b>{totals.vatAmount.toLocaleString('th-TH')}</b></div>
              {totals.discountAmount > 0 && <div>{t('ส่วนลด')}: <b style={{ color: 'var(--danger)' }}>-{totals.discountAmount.toLocaleString('th-TH')}</b></div>}
              <div>{t('รวมทั้งสิ้น')}: <b style={{ color: 'var(--navy)' }}>{fmtCurrency(totals.grandTotal)}</b></div>
            </div>
          </div>

          <label className="form-label" style={{ marginTop: 4 }}>{t('ที่อยู่จัดส่ง')}</label>
          <div className="form-group">
            <label className="form-label required">{t('ที่อยู่สำหรับจัดส่งสินค้า')}</label>
            <textarea className="form-control" rows={2} value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('ชื่อผู้รับ (ถ้ามี)')}</label>
              <input className="form-control" value={shippingContactName} onChange={e => setShippingContactName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('เบอร์โทรผู้รับ (ถ้ามี)')}</label>
              <input className="form-control" value={shippingContactPhone} onChange={e => setShippingContactPhone(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('หมายเหตุ')}</label>
            <textarea className="form-control" rows={2} value={remark} onChange={e => setRemark(e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">{t('เซลล์ผู้เปิดออเดอร์')}</label>
            <input className="form-control" value={currentUser.name} disabled />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>{t('ยกเลิก')}</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? t('กำลังบันทึก...') : t('บันทึกออเดอร์')}</button>
        </div>
      </div>
    </div>
  )
}

// ป็อปอัปดูรายละเอียดออเดอร์ (อ่านอย่างเดียว) + ปุ่มยกเลิก — ไม่มีโหมดแก้ไขเพราะออเดอร์ที่บันทึกแล้วแก้ไม่ได้
export function OrderDetailModal({ order, items, onClose, onCancel }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [reason, setReason] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [busy, setBusy] = useState(false)

  // onCancel (App.jsx action) จัดการ toast/error เองผ่าน run() อยู่แล้ว ไม่โยน error กลับมา — ปิดมอดัลได้ทันทีหลัง await
  const doCancel = async () => {
    if (!reason.trim()) { toast(t('กรุณาระบุเหตุผลที่ยกเลิก'), 'error'); return }
    setBusy(true)
    await onCancel(order, reason.trim())
    onClose()
  }

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-light)' }}>{label}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
  const itemsSubtotal = (items || []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0)

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <div className="modal-title">{lang === 'en' ? 'Order' : 'ออเดอร์'} · {order.order_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {order.order_type === 'Grade B' && <Row label={t('ประเภทออเดอร์')} value={<span className="badge badge-orange">Grade B</span>} />}
          <Row label={t('เลขที่ใบเสนอราคา')} value={order.quot_no || '-'} />
          <Row label={t('บริษัท')} value={order.customer_name || order.company?.name || '-'} />
          {order.company_tax_id && <Row label={t('เลขประจำตัวผู้เสียภาษี')} value={order.company_tax_id} />}
          {order.company_address && <Row label={t('ที่อยู่บริษัท')} value={order.company_address} />}
          {order.company_phone && <Row label={t('โทรศัพท์บริษัท')} value={order.company_phone} />}
          {order.company_email && <Row label={t('อีเมลบริษัท')} value={order.company_email} />}
          <Row label={t('ที่อยู่จัดส่ง')} value={order.shipping_address} />
          {order.shipping_contact_name && <Row label={t('ผู้รับ')} value={`${order.shipping_contact_name}${order.shipping_contact_phone ? ` (${order.shipping_contact_phone})` : ''}`} />}
          {order.remark && <Row label={t('หมายเหตุ')} value={order.remark} />}
          <Row label={t('เซลล์ผู้เปิดออเดอร์')} value={order.sales_name || '-'} />
          <Row label={t('สถานะ')} value={<span className={`badge ${order.status === 'Active' ? 'badge-green' : 'badge-gray'}`}>{order.status === 'Active' ? t('ใช้งานอยู่') : t('ยกเลิกแล้ว')}</span>} />
          {order.status === 'Cancelled' && order.cancel_reason && <Row label={t('เหตุผลที่ยกเลิก')} value={order.cancel_reason} />}

          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>{lang === 'en' ? 'Product/Item' : 'สินค้า/รายการ'}</th><th style={{ textAlign: 'center' }}>{t('จำนวน')}</th><th style={{ textAlign: 'right' }}>{t('ราคา/หน่วย')}</th><th style={{ textAlign: 'right' }}>{t('รวม')}</th></tr></thead>
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
          {Number(order.discount_value) > 0 && (
            <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13, color: 'var(--danger)' }}>
              {t('ส่วนลด')} ({order.discount_type === 'เปอร์เซ็นต์' ? `${order.discount_value}%` : fmtCurrency(order.discount_value)}):
              {' '}-{fmtCurrency(itemsSubtotal - Number(order.value))}
            </div>
          )}
          <div style={{ textAlign: 'right', marginTop: 4, fontSize: 13 }}>{t('ยอดรวม')}: <b style={{ color: 'var(--navy)' }}>{fmtCurrency(order.value)}</b></div>

          {order.status === 'Active' && (
            showCancelForm ? (
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label required">{t('เหตุผลที่ยกเลิกออเดอร์')}</label>
                <textarea className="form-control" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder={lang === 'en' ? 'e.g. wrong data entered, wrong quantity/price' : 'เช่น ลงข้อมูลผิด กรอกจำนวน/ราคาผิด'} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowCancelForm(false)} disabled={busy}>{t('ไม่ยกเลิก')}</button>
                  <button className="btn btn-danger btn-sm" onClick={doCancel} disabled={busy}>{busy ? t('กำลังยกเลิก...') : t('ยืนยันยกเลิกออเดอร์')}</button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-danger btn-sm" onClick={() => setShowCancelForm(true)}>{t('ยกเลิกออเดอร์')}</button>
              </div>
            )
          )}
        </div>
        <div className="modal-footer"><button className="btn btn-outline" onClick={onClose}>{t('ปิด')}</button></div>
      </div>
    </div>
  )
}
