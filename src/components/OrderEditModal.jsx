import { useEffect, useState } from 'react'
import { listOrderItems, updateOrderWithItems, computeDealTotals, listProducts } from '../lib/api'
import { fmtCurrency, composeShippingAddress } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import SearchableSelect from './SearchableSelect'

// แก้ไขออเดอร์ที่บันทึกแล้ว — แอดมินเท่านั้น
// มีไว้สำหรับกรณีเซลล์กรอกจำนวน/ราคาผิด แต่เอกสารอื่นออกไปถูกต้องหมดแล้ว ยกเลิกทิ้งจะต้องรื้อทั้งชุด
// แก้ได้เฉพาะรายการสินค้า/ส่วนลด/ที่อยู่จัดส่ง/หมายเหตุ — เลขออเดอร์ ลูกค้า ใบเสนอราคา เซลล์ ยังล็อกไว้เหมือนเดิม

export default function OrderEditModal({ order, currentUserName, onClose, onSaved }) {
  const { toast, confirm } = useUi()
  const { t } = useLanguage()
  const [items, setItems] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reason, setReason] = useState('')
  // ออเดอร์เก่ามีแต่ข้อความก้อนเดียว ยังไม่มีช่องแยก — เอามาใส่บรรทัดแรกไว้ก่อน ให้แอดมินแยกเองตอนแก้
  const legacyAddress = !order.shipping_province && !order.shipping_line1 ? (order.shipping_address || '') : ''
  const [f, setF] = useState({
    shipping_line1: order.shipping_line1 || legacyAddress,
    shipping_subdistrict: order.shipping_subdistrict || '',
    shipping_district: order.shipping_district || '',
    shipping_province: order.shipping_province || '',
    shipping_postcode: order.shipping_postcode || '',
    shipping_contact_name: order.shipping_contact_name || '',
    shipping_contact_phone: order.shipping_contact_phone || '',
    remark: order.remark || '',
    discount_type: order.discount_type || '',
    discount_value: order.discount_value ?? '',
  })
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  useEffect(() => {
    Promise.all([listOrderItems(order.id), listProducts()])
      .then(([its, ps]) => {
        setItems(its.map(it => ({
          id: it.id, product_id: it.product_id || '', description: it.description || it.product?.name || '',
          quantity: it.quantity, unit_price: it.unit_price
        })))
        setProducts(ps)
      })
      .catch(e => toast('โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error'))
      .finally(() => setLoading(false))
  }, [order.id, toast])

  const setItem = (i, k) => (e) => {
    const v = e.target.value
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)))
  }
  const pickProduct = (i) => (productId) => {
    const p = products.find(x => x.id === productId)
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, product_id: productId, description: p ? p.name : it.description } : it)))
  }
  const addRow = () => setItems(prev => [...prev, { product_id: '', description: '', quantity: 1, unit_price: 0 }])
  const removeRow = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const totals = computeDealTotals(items, { type: f.discount_type, value: f.discount_value })
  const changedTotal = Math.abs(totals.grandTotal - (Number(order.value) || 0)) > 0.005

  const submit = async () => {
    if (!reason.trim()) { toast('กรุณาระบุเหตุผลที่แก้ไข', 'error'); return }
    if (!items.length) { toast('ต้องมีรายการสินค้าอย่างน้อย 1 รายการ', 'error'); return }
    for (const [i, it] of items.entries()) {
      if (!it.description?.trim()) { toast(`รายการที่ ${i + 1}: กรุณากรอกชื่อรายการ`, 'error'); return }
      if (!(Number(it.quantity) > 0)) { toast(`รายการที่ ${i + 1}: จำนวนต้องมากกว่า 0`, 'error'); return }
      if (Number(it.unit_price) < 0) { toast(`รายการที่ ${i + 1}: ราคาต้องไม่ติดลบ`, 'error'); return }
    }
    if (!f.shipping_line1.trim()) { toast('กรุณากรอกบ้านเลขที่/ที่อยู่', 'error'); return }

    const msg = changedTotal
      ? `ยอดรวมจะเปลี่ยนจาก ${fmtCurrency(order.value)} เป็น ${fmtCurrency(totals.grandTotal)} บาท\n\nถ้าออกใบแจ้งหนี้/ใบกำกับภาษีไปแล้ว ต้องแก้เอกสารฝั่งบัญชีให้ตรงกันด้วย ยืนยันแก้ไข?`
      : 'ยืนยันแก้ไขออเดอร์นี้?'
    if (!(await confirm(msg))) return

    setSaving(true)
    try {
      await updateOrderWithItems(order.id, {
        shipping_address: composeShippingAddress({
          line1: f.shipping_line1, subdistrict: f.shipping_subdistrict, district: f.shipping_district,
          province: f.shipping_province, postcode: f.shipping_postcode,
        }),
        shipping_line1: f.shipping_line1.trim() || null,
        shipping_subdistrict: f.shipping_subdistrict.trim() || null,
        shipping_district: f.shipping_district.trim() || null,
        shipping_province: f.shipping_province.trim() || null,
        shipping_postcode: f.shipping_postcode.trim() || null,
        shipping_contact_name: f.shipping_contact_name || null,
        shipping_contact_phone: f.shipping_contact_phone || null,
        remark: f.remark || null,
        discount_type: f.discount_type || null,
        discount_value: Number(f.discount_value) || 0,
      }, items, { actorName: currentUserName, reason: reason.trim() })
      toast('แก้ไขออเดอร์สำเร็จ', 'success')
      onSaved()
      onClose()
    } catch (e) { toast('แก้ไขไม่สำเร็จ: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const cell = { padding: '4px 6px' }
  const inputSm = { padding: '5px 8px', fontSize: 12 }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <div className="modal-title">{t('แก้ไขออเดอร์')} — {order.order_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ padding: '8px 10px', borderRadius: 6, background: '#fffaf0', color: '#c05621', fontSize: 12, marginBottom: 12, lineHeight: 1.6 }}>
            {t('ออเดอร์ถูกออกแบบให้แก้ไม่ได้หลังบันทึก — หน้านี้เป็นข้อยกเว้นสำหรับแอดมิน ใช้เมื่อกรอกผิดแต่เอกสารอื่นถูกต้องแล้ว')}
            <div>{t('ทุกการแก้ไขถูกบันทึกไว้ว่าใครแก้ แก้อะไร และเพราะอะไร')}</div>
            <div>{t('ถ้ายอดรวมเปลี่ยน ต้องไปแก้ใบแจ้งหนี้/ใบกำกับภาษีและคำขอตรวจยอดที่ออกไปแล้วให้ตรงกันเองด้วย ระบบไม่ได้แก้ให้')}</div>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 10 }}>
            {t('ลูกค้า')}: <b>{order.customer_name || '-'}</b>
            {'  ·  '}{t('เลขที่ใบเสนอราคา')}: <b>{order.quot_no || '-'}</b>
            {'  ·  '}{t('เซลล์')}: <b>{order.sales_name || '-'}</b>
            <div>{t('ช่องเหล่านี้แก้ไม่ได้ ถ้าผิดต้องยกเลิกแล้วเปิดใหม่')}</div>
          </div>

          <div className="form-group">
            <label className="form-label required">{t('เหตุผลที่แก้ไข')}</label>
            <input className="form-control" value={reason} onChange={e => setReason(e.target.value)}
              placeholder={t('เช่น เซลล์คีย์จำนวนผิดจาก 10 เป็น 100 / ราคาต่อชิ้นผิด')} autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">{t('รายการสินค้า')}</label>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 200 }}>{t('สินค้า')}</th>
                    <th>{t('ชื่อรายการ')}</th>
                    <th style={{ width: 90 }}>{t('จำนวน')}</th>
                    <th style={{ width: 120 }}>{t('ราคา/หน่วย')}</th>
                    <th style={{ width: 110 }}>{t('รวม')}</th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={it.id || `new-${i}`}>
                      <td style={cell}>
                        <SearchableSelect options={products} value={it.product_id} onChange={pickProduct(i)}
                          getOptionLabel={(o) => `${o.code} - ${o.name}`} placeholder={t('-- ไม่ระบุ --')} />
                      </td>
                      <td style={cell}><input className="form-control" style={inputSm} value={it.description} onChange={setItem(i, 'description')} /></td>
                      <td style={cell}><input className="form-control" style={inputSm} type="number" min="0" step="1" value={it.quantity} onChange={setItem(i, 'quantity')} /></td>
                      <td style={cell}><input className="form-control" style={inputSm} type="number" min="0" step="0.01" value={it.unit_price} onChange={setItem(i, 'unit_price')} /></td>
                      <td style={{ ...cell, fontWeight: 600 }}>{fmtCurrency((Number(it.quantity) || 0) * (Number(it.unit_price) || 0))}</td>
                      <td style={cell}>
                        <button className="btn btn-danger btn-xs" onClick={() => removeRow(i)}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 8 }} onClick={addRow}>{t('+ เพิ่มรายการ')}</button>
            {loading && <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 6 }}>{t('กำลังโหลด...')}</div>}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('ประเภทส่วนลดท้ายบิล')}</label>
              <select className="form-control" value={f.discount_type} onChange={set('discount_type')}>
                <option value="">{t('-- ไม่มีส่วนลด --')}</option>
                <option value="เปอร์เซ็นต์">{t('เปอร์เซ็นต์')}</option>
                <option value="จำนวนเงิน">{t('จำนวนเงิน')}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">{t('ส่วนลดท้ายบิล')}</label>
              <input className="form-control" type="number" min="0" step="0.01" value={f.discount_value} onChange={set('discount_value')} disabled={!f.discount_type} />
            </div>
          </div>

          <div style={{ padding: '10px 12px', borderRadius: 6, background: 'var(--gray-bg)', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>{t('รวมก่อนส่วนลด')}</span><span>{fmtCurrency(totals.subtotalIncVat)}</span>
            </div>
            {totals.discountAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--danger)' }}>
                <span>{t('ส่วนลด')}</span><span>-{fmtCurrency(totals.discountAmount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: 'var(--navy)', marginTop: 4 }}>
              <span>{t('ยอดรวมใหม่')}</span><span>{fmtCurrency(totals.grandTotal)}</span>
            </div>
            {changedTotal && (
              <div style={{ fontSize: 11, color: '#c05621', marginTop: 4 }}>
                {t('เดิม')} {fmtCurrency(order.value)} → {t('ต่างกัน')} {fmtCurrency(totals.grandTotal - (Number(order.value) || 0))}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label required">{t('บ้านเลขที่ / หมู่ / ถนน')}</label>
            <input className="form-control" value={f.shipping_line1} onChange={set('shipping_line1')} />
            {legacyAddress && (
              <div style={{ fontSize: 11, color: '#c05621', marginTop: 4 }}>
                {t('ออเดอร์นี้เปิดก่อนมีช่องแยก — ที่อยู่เดิมถูกใส่ไว้บรรทัดเดียว แยกลงช่องด้านล่างได้เลย')}
              </div>
            )}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('ตำบล / แขวง')}</label>
              <input className="form-control" value={f.shipping_subdistrict} onChange={set('shipping_subdistrict')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('อำเภอ / เขต')}</label>
              <input className="form-control" value={f.shipping_district} onChange={set('shipping_district')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('จังหวัด')}</label>
              <input className="form-control" value={f.shipping_province} onChange={set('shipping_province')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('รหัสไปรษณีย์')}</label>
              <input className="form-control" inputMode="numeric" maxLength={5} value={f.shipping_postcode} onChange={set('shipping_postcode')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('ชื่อผู้รับ (ถ้ามี)')}</label>
              <input className="form-control" value={f.shipping_contact_name} onChange={set('shipping_contact_name')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('เบอร์โทรติดต่อ')}</label>
              <input className="form-control" value={f.shipping_contact_phone} onChange={set('shipping_contact_phone')} />
            </div>
          </div>
          <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--gray-bg)', fontSize: 12, marginBottom: 10 }}>
            <span style={{ color: 'var(--text-light)' }}>{t('ที่อยู่ที่จะพิมพ์')}: </span>
            {composeShippingAddress({
              line1: f.shipping_line1, subdistrict: f.shipping_subdistrict, district: f.shipping_district,
              province: f.shipping_province, postcode: f.shipping_postcode,
            }) || '-'}
          </div>
          <div className="form-group">
            <label className="form-label">{t('หมายเหตุ')}</label>
            <textarea className="form-control" rows={2} value={f.remark} onChange={set('remark')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('ยกเลิก')}</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || loading}>
            {saving ? t('กำลังบันทึก...') : t('บันทึกการแก้ไข')}
          </button>
        </div>
      </div>
    </div>
  )
}
