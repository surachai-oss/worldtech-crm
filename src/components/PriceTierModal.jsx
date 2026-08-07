import { useEffect, useState } from 'react'
import { fetchPriceTiers, upsertPriceTier, deletePriceTier, applyStandardPriceTiers, STANDARD_PRICE_TIERS, STANDARD_SPECIAL_DISCOUNT } from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// ขั้นบันไดราคาตามจำนวน — บัญชีตั้งว่า "ซื้อตั้งแต่กี่ชิ้น ลดได้ลึกแค่ไหน"
// ระบบเอา % ส่วนลดไปคิด Floor Price ให้ตามจำนวนที่เซลล์กรอก แล้วดึงกลับเองถ้าลดลึกจนต่ำกว่า Margin ขั้นต่ำ

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const blankRow = () => ({ min_qty: '', max_discount_percent: '', minimum_margin_percent: '', target_margin_percent: '', note: '' })

export default function PriceTierModal({ product, currentUserName, onClose, onChanged }) {
  const { toast, confirm } = useUi()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState(blankRow())
  const [saving, setSaving] = useState(false)

  const normal = Number(product.cost?.normal_selling_price) || 0
  const special = product.cost?.special_discount_percent ?? STANDARD_SPECIAL_DISCOUNT

  const load = async () => {
    setLoading(true)
    try { setRows(await fetchPriceTiers(product.id)) }
    catch (e) { toast('โหลดขั้นบันไดไม่สำเร็จ: ' + e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ราคาที่ได้จากเพดานส่วนลด — ราคาจริงที่ระบบใช้อาจสูงกว่านี้ถ้าต้นทุนไม่ให้ลดลึกขนาดนั้น
  const priceFromDiscount = (disc) => (normal > 0 && disc !== null && disc !== '' ? normal * (1 - Number(disc) / 100) : null)

  const save = async (row) => {
    if (!(Number(row.min_qty) >= 1)) { toast('จำนวนตั้งแต่ ต้องเป็นตัวเลขตั้งแต่ 1 ขึ้นไป', 'error'); return }
    const disc = num(row.max_discount_percent)
    if (disc !== null && (disc < 0 || disc >= 100)) { toast('ส่วนลดต้องอยู่ระหว่าง 0–99.99%', 'error'); return }
    setSaving(true)
    try {
      await upsertPriceTier({
        ...(row.id ? { id: row.id } : {}),
        product_id: product.id,
        min_qty: Number(row.min_qty),
        max_discount_percent: disc,
        minimum_margin_percent: num(row.minimum_margin_percent),
        target_margin_percent: num(row.target_margin_percent),
        note: row.note || null
      }, currentUserName)
      toast('บันทึกขั้นบันไดแล้ว', 'success')
      setDraft(blankRow())
      await load()
      onChanged?.()
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const applyStandard = async () => {
    if (!(await confirm(`ใส่เกณฑ์มาตรฐาน ${STANDARD_PRICE_TIERS.length} ขั้นให้สินค้านี้? ขั้นที่จำนวนตรงกันจะถูกเขียนทับ`))) return
    setSaving(true)
    try {
      await applyStandardPriceTiers([product.id], currentUserName)
      toast('ใส่เกณฑ์มาตรฐานแล้ว', 'success')
      await load()
      onChanged?.()
    } catch (e) { toast('ทำไม่สำเร็จ: ' + e.message, 'error') }
    finally { setSaving(false) }
  }

  const remove = async (row) => {
    if (!(await confirm(`ลบขั้น "${row.min_qty} ชิ้นขึ้นไป"?`))) return
    try { await deletePriceTier(row.id); toast('ลบสำเร็จ', 'success'); await load(); onChanged?.() }
    catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error') }
  }

  const setRow = (i, k) => (e) => {
    const v = e.target.value
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  }
  const setDraftField = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }))

  const cell = { padding: '4px 6px' }
  const inputSm = { padding: '5px 8px', fontSize: 12 }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <div className="modal-title">{t('ขั้นบันไดราคาตามจำนวน')} — {product.code} {product.name}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12, color: 'var(--text-light)', lineHeight: 1.6, marginBottom: 12 }}>
            <div>{t('ตั้งว่าซื้อตั้งแต่กี่ชิ้น ลดจากราคาขายปกติได้ลึกแค่ไหน — ระบบจะหยิบขั้นที่ตรงกับจำนวนที่เซลล์กรอกมาใช้')}</div>
            <div>{t('ถ้าต้นทุนขึ้นจนส่วนลดนั้นทำให้ต่ำกว่า Margin ขั้นต่ำ ระบบจะดึงราคาต่ำสุดกลับขึ้นมาเอง ไม่ปล่อยให้ขาดทุน')}</div>
            <div>{t('ช่อง Margin เว้นว่างได้ = ใช้ค่าของสินค้า')}</div>
            {normal > 0
              ? <div style={{ marginTop: 4 }}>{t('ราคาขายปกติของสินค้านี้')}: <b>{fmtCurrency(normal)}</b> {t('บาท/ชิ้น')}</div>
              : <div style={{ marginTop: 4, color: 'var(--danger)' }}>{t('สินค้านี้ยังไม่ได้กรอกราคาขายปกติ — ส่วนลดจะคำนวณเป็นราคาไม่ได้ ต้องกรอกก่อน')}</div>}
            <div style={{ marginTop: 4 }}>
              {t('เพดานส่วนลดพิเศษ')}: <b>{special}%</b> — {t('ขอเกินส่วนลดของขั้นแต่ไม่เกินเพดานนี้ = เช็คกับหัวหน้า / เกินเพดาน = ต้องคุยหัวหน้า')}
            </div>
          </div>

          <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} disabled={saving} onClick={applyStandard}>
            {t('ใส่เกณฑ์มาตรฐาน')} ({STANDARD_PRICE_TIERS.map(x => `${x.max_discount_percent}%`).join(' / ')})
          </button>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>{t('จำนวนตั้งแต่')}</th>
                  <th style={{ width: 110 }}>{t('ลดได้ไม่เกิน (%)')}</th>
                  <th style={{ width: 120 }}>{t('= ราคา/ชิ้น')}</th>
                  <th style={{ width: 110 }}>{t('Margin ขั้นต่ำ (%)')}</th>
                  <th style={{ width: 110 }}>{t('Margin เป้าหมาย (%)')}</th>
                  <th>{t('หมายเหตุ')}</th>
                  <th style={{ width: 110 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const p = priceFromDiscount(r.max_discount_percent)
                  return (
                    <tr key={r.id}>
                      <td style={cell}><input className="form-control" style={inputSm} type="number" min="1" value={r.min_qty} onChange={setRow(i, 'min_qty')} /></td>
                      <td style={cell}><input className="form-control" style={inputSm} type="number" step="0.01" value={r.max_discount_percent ?? ''} onChange={setRow(i, 'max_discount_percent')} /></td>
                      <td style={{ ...cell, fontWeight: 600, color: 'var(--navy)' }}>{p !== null ? fmtCurrency(p) : '-'}</td>
                      <td style={cell}><input className="form-control" style={inputSm} type="number" step="0.01" value={r.minimum_margin_percent ?? ''} onChange={setRow(i, 'minimum_margin_percent')} /></td>
                      <td style={cell}><input className="form-control" style={inputSm} type="number" step="0.01" value={r.target_margin_percent ?? ''} onChange={setRow(i, 'target_margin_percent')} /></td>
                      <td style={cell}><input className="form-control" style={inputSm} value={r.note ?? ''} onChange={setRow(i, 'note')} /></td>
                      <td className="td-actions" style={cell}>
                        <button className="btn btn-primary btn-xs" disabled={saving} onClick={() => save(r)}>{t('บันทึก')}</button>
                        <button className="btn btn-danger btn-xs" onClick={() => remove(r)}>{t('ลบ')}</button>
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ background: 'var(--gray-bg)' }}>
                  <td style={cell}><input className="form-control" style={inputSm} type="number" min="1" placeholder="1" value={draft.min_qty} onChange={setDraftField('min_qty')} /></td>
                  <td style={cell}><input className="form-control" style={inputSm} type="number" step="0.01" placeholder="13" value={draft.max_discount_percent} onChange={setDraftField('max_discount_percent')} /></td>
                  <td style={{ ...cell, fontWeight: 600, color: 'var(--navy)' }}>
                    {priceFromDiscount(draft.max_discount_percent) !== null ? fmtCurrency(priceFromDiscount(draft.max_discount_percent)) : '-'}
                  </td>
                  <td style={cell}><input className="form-control" style={inputSm} type="number" step="0.01" placeholder={t('ตามสินค้า')} value={draft.minimum_margin_percent} onChange={setDraftField('minimum_margin_percent')} /></td>
                  <td style={cell}><input className="form-control" style={inputSm} type="number" step="0.01" placeholder={t('ตามสินค้า')} value={draft.target_margin_percent} onChange={setDraftField('target_margin_percent')} /></td>
                  <td style={cell}><input className="form-control" style={inputSm} value={draft.note} onChange={setDraftField('note')} /></td>
                  <td className="td-actions" style={cell}>
                    <button className="btn btn-secondary btn-xs" disabled={saving} onClick={() => save(draft)}>{t('เพิ่มขั้น')}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {!loading && !rows.length && (
            <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 10 }}>
              {t('ยังไม่ได้ตั้งขั้นบันได — ตอนนี้สินค้านี้ใช้ Floor Price ตัวเดียวกับทุกจำนวน')}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('ปิด')}</button>
        </div>
      </div>
    </div>
  )
}
