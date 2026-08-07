import { useEffect, useMemo, useState } from 'react'
import {
  fetchProductCosts, upsertProductCost, updateProductMeta,
  fetchMarginSettings, updateMarginSetting, PRODUCT_COST_STATUS_OPTIONS
} from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// หน้านี้เห็นได้เฉพาะบัญชี/แอดมิน (บังคับจริงด้วย RLS ของ product_costs — เซลล์ยิง API ตรงก็อ่านไม่ได้)
// เป็นแหล่งข้อมูลเดียวที่หน้า "เช็คราคา/มาร์จิ้น" ใช้คำนวณ

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const pct = (n) => (n === null || n === undefined || n === '' ? '-' : `${Number(n).toFixed(2)}%`)

const EMPTY = {
  cost_price: '', normal_selling_price: '', target_margin_percent: '', minimum_margin_percent: '',
  floor_price: '', shipping_buffer_percent: '', provision_buffer_percent: '',
  default_shipping_cost: '', packaging_cost: '', status: 'Active', finance_remark: '',
  category: '', brand: ''
}

function CostModal({ product, onClose, onSave }) {
  const { t } = useLanguage()
  const c = product.cost || {}
  const [f, setF] = useState(() => ({
    ...EMPTY,
    cost_price: c.cost_price ?? '',
    normal_selling_price: c.normal_selling_price ?? '',
    target_margin_percent: c.target_margin_percent ?? '',
    minimum_margin_percent: c.minimum_margin_percent ?? '',
    floor_price: c.floor_price ?? '',
    shipping_buffer_percent: c.shipping_buffer_percent ?? '',
    provision_buffer_percent: c.provision_buffer_percent ?? '',
    default_shipping_cost: c.default_shipping_cost ?? '',
    packaging_cost: c.packaging_cost ?? '',
    status: c.status || 'Active',
    finance_remark: c.finance_remark || '',
    category: product.category || '',
    brand: product.brand || ''
  }))
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  // เตือนล่วงหน้าตามข้อควรระวังใน requirement — ไม่บล็อกการบันทึก แค่ให้บัญชีเห็นก่อน
  const warnings = []
  if (!(Number(f.cost_price) > 0)) warnings.push(t('ต้นทุนต้องมากกว่า 0 ไม่งั้นสินค้านี้จะยังคำนวณราคาไม่ได้'))
  if (f.floor_price !== '' && Number(f.floor_price) < Number(f.cost_price || 0) + Number(f.packaging_cost || 0)) {
    warnings.push(t('Floor Price ต่ำกว่าต้นทุน + ค่าแพ็กกิ้ง'))
  }
  if (f.minimum_margin_percent !== '' && f.target_margin_percent !== '' &&
      Number(f.minimum_margin_percent) > Number(f.target_margin_percent)) {
    warnings.push(t('Margin ขั้นต่ำสูงกว่า Margin เป้าหมาย'))
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{t('ต้นทุนสินค้า')} — {product.code} {product.name}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">{t('ต้นทุน/ชิ้น')}</label>
              <input className="form-control" type="number" step="0.01" min="0" value={f.cost_price} onChange={set('cost_price')} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">{t('ราคาขายปกติ')}</label>
              <input className="form-control" type="number" step="0.01" min="0" value={f.normal_selling_price} onChange={set('normal_selling_price')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('Margin เป้าหมาย (%)')}</label>
              <input className="form-control" type="number" step="0.01" value={f.target_margin_percent} onChange={set('target_margin_percent')} placeholder="20" />
            </div>
            <div className="form-group">
              <label className="form-label">{t('Margin ขั้นต่ำ (%)')}</label>
              <input className="form-control" type="number" step="0.01" value={f.minimum_margin_percent} onChange={set('minimum_margin_percent')} placeholder="12" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Floor Price</label>
              <input className="form-control" type="number" step="0.01" min="0" value={f.floor_price} onChange={set('floor_price')} />
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('ราคาต่ำสุดต่อชิ้นที่ไม่ควรต่ำกว่า — ต่ำกว่านี้ระบบขึ้น "ไม่ควรขาย"')}</div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('ค่าแพ็กกิ้ง/ชิ้น')}</label>
              <input className="form-control" type="number" step="0.01" min="0" value={f.packaging_cost} onChange={set('packaging_cost')} placeholder={t('ว่าง = ใช้ค่ากลาง')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Shipping Buffer (%)</label>
              <input className="form-control" type="number" step="0.01" value={f.shipping_buffer_percent} onChange={set('shipping_buffer_percent')} placeholder={t('ว่าง = ใช้ค่ากลาง')} />
            </div>
            <div className="form-group">
              <label className="form-label">Provision Buffer (%)</label>
              <input className="form-control" type="number" step="0.01" value={f.provision_buffer_percent} onChange={set('provision_buffer_percent')} placeholder={t('ว่าง = ใช้ค่ากลาง')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('ค่าขนส่งมาตรฐาน')}</label>
              <input className="form-control" type="number" step="0.01" min="0" value={f.default_shipping_cost} onChange={set('default_shipping_cost')} placeholder={t('ว่าง = ใช้ค่ากลาง')} />
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('ใช้เมื่อเซลล์ไม่กรอกค่าขนส่งจริง')}</div>
            </div>
            <div className="form-group">
              <label className="form-label">{t('สถานะ')}</label>
              <select className="form-control" value={f.status} onChange={set('status')}>
                {PRODUCT_COST_STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('เซลล์เลือกได้เฉพาะสินค้าที่เป็น Active')}</div>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('หมวดหมู่')}</label>
              <input className="form-control" value={f.category} onChange={set('category')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('แบรนด์')}</label>
              <input className="form-control" value={f.brand} onChange={set('brand')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('หมายเหตุจากบัญชี')}</label>
            <textarea className="form-control" rows={2} value={f.finance_remark} onChange={set('finance_remark')}
              placeholder={t('เช่น ต้นทุนนี้รวมค่านำเข้าแล้ว / อัปเดตล่าสุดเมื่อไหร่')} />
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('ข้อความนี้เซลล์เห็นได้ในหน้าเช็คราคา — อย่าใส่ตัวเลขต้นทุนลงไป')}</div>
          </div>
          {warnings.length > 0 && (
            <div style={{ padding: '8px 10px', borderRadius: 6, background: '#fff5f5', color: '#c53030', fontSize: 12 }}>
              {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('ยกเลิก')}</button>
          <button className="btn btn-primary" onClick={() => onSave(f)}>{t('บันทึก')}</button>
        </div>
      </div>
    </div>
  )
}

function MarginSettingsCard({ rows, onSave }) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState({})
  const [savingKey, setSavingKey] = useState('')

  const save = async (key) => {
    setSavingKey(key)
    try { await onSave(key, draft[key]) } finally { setSavingKey('') }
    setDraft(d => { const n = { ...d }; delete n[key]; return n })
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-header">
        <div className="card-title">{t('ค่ากลางที่ใช้คำนวณ')}</div>
        <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
          {t('ถ้าสินค้าตัวไหนกรอกค่าเฉพาะของตัวเองไว้ ระบบจะใช้ค่าของสินค้านั้นก่อน')}
        </span>
      </div>
      <div className="card-body">
        <table>
          <thead><tr><th>{t('ค่า')}</th><th style={{ width: 140 }}>{t('ค่าปัจจุบัน')}</th><th>{t('คำอธิบาย')}</th><th style={{ width: 90 }}></th></tr></thead>
          <tbody>
            {rows.map(r => {
              const value = draft[r.key] !== undefined ? draft[r.key] : (r.value ?? '')
              const dirty = draft[r.key] !== undefined && String(draft[r.key]) !== String(r.value ?? '')
              return (
                <tr key={r.key}>
                  <td style={{ fontWeight: 500 }}>{r.key}</td>
                  <td>
                    <input className="form-control" type="number" step="0.01" value={value}
                      onChange={e => setDraft(d => ({ ...d, [r.key]: e.target.value }))} />
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-light)' }}>{r.description}</td>
                  <td>
                    <button className="btn btn-primary btn-xs" disabled={!dirty || savingKey === r.key} onClick={() => save(r.key)}>
                      {savingKey === r.key ? t('กำลังบันทึก...') : t('บันทึก')}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function CostMaster({ currentUserName }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [rows, setRows] = useState([])
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [modal, setModal] = useState(null)

  const load = async () => {
    setLoading(true)
    try {
      const [products, ms] = await Promise.all([fetchProductCosts(), fetchMarginSettings()])
      setRows(products)
      setSettings(ms)
    } catch (e) {
      toast('โหลดข้อมูลต้นทุนไม่สำเร็จ: ' + e.message, 'error')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter(r => {
      if (onlyMissing && r.cost && Number(r.cost.cost_price) > 0) return false
      if (!needle) return true
      return `${r.code} ${r.name} ${r.category || ''} ${r.brand || ''}`.toLowerCase().includes(needle)
    })
  }, [rows, q, onlyMissing])

  const missingCount = rows.filter(r => !r.cost || !(Number(r.cost.cost_price) > 0)).length

  const onSave = async (f) => {
    const product = modal
    setModal(null)
    try {
      await upsertProductCost(product.id, {
        cost_price: num(f.cost_price) ?? 0,
        normal_selling_price: num(f.normal_selling_price),
        target_margin_percent: num(f.target_margin_percent),
        minimum_margin_percent: num(f.minimum_margin_percent),
        floor_price: num(f.floor_price),
        shipping_buffer_percent: num(f.shipping_buffer_percent),
        provision_buffer_percent: num(f.provision_buffer_percent),
        default_shipping_cost: num(f.default_shipping_cost),
        packaging_cost: num(f.packaging_cost),
        status: f.status,
        finance_remark: f.finance_remark || null
      }, currentUserName)
      if ((f.category || '') !== (product.category || '') || (f.brand || '') !== (product.brand || '')) {
        await updateProductMeta(product.id, { category: f.category || null, brand: f.brand || null })
      }
      toast('บันทึกต้นทุนสำเร็จ', 'success')
      await load()
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error') }
  }

  const onSaveSetting = async (key, value) => {
    try {
      await updateMarginSetting(key, value, currentUserName)
      toast('บันทึกค่ากลางแล้ว', 'success')
      setSettings(await fetchMarginSettings())
    } catch (e) { toast('บันทึกไม่สำเร็จ: ' + e.message, 'error') }
  }

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">
          {t('ต้นทุนสินค้า')} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} {t('รายการ')})</span>
        </div>
        {missingCount > 0 && (
          <span className="badge badge-orange">{t('ยังไม่ได้กรอกต้นทุน')} {missingCount} {t('รายการ')}</span>
        )}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 12 }}>
        {t('ข้อมูลในหน้านี้เห็นได้เฉพาะบัญชีและแอดมิน — เซลล์เห็นแค่ผลลัพธ์การคำนวณในหน้า "เช็คราคา/มาร์จิ้น" ไม่เห็นตัวเลขต้นทุน')}
      </div>

      {settings.length > 0 && <MarginSettingsCard rows={settings} onSave={onSaveSetting} />}

      {modal && <CostModal product={modal} onClose={() => setModal(null)} onSave={onSave} />}

      <div className="filter-bar">
        <input className="filter-input" placeholder={lang === 'en' ? 'Search product...' : 'ค้นหาสินค้า...'}
          value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
          {t('เฉพาะที่ยังไม่ได้กรอกต้นทุน')}
        </label>
      </div>

      <div className="card list-card">
        <div className="table-wrap">
          {filtered.length ? (
            <table>
              <thead>
                <tr>
                  <th>{t('รหัสสินค้า')}</th><th>{t('ชื่อสินค้า')}</th><th>{t('ต้นทุน/ชิ้น')}</th>
                  <th>{t('ราคาขายปกติ')}</th><th>Floor Price</th><th>{t('เป้าหมาย/ขั้นต่ำ')}</th>
                  <th>Buffer</th><th>{t('สถานะ')}</th><th>{t('อัปเดตโดย')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const c = r.cost
                  const hasCost = c && Number(c.cost_price) > 0
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{r.code}</td>
                      <td>{r.name}{r.category && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{r.category}{r.brand ? ` · ${r.brand}` : ''}</div>}</td>
                      <td style={{ fontWeight: 600 }}>
                        {hasCost ? fmtCurrency(c.cost_price) : <span className="badge badge-orange">{t('ยังไม่ได้กรอก')}</span>}
                      </td>
                      <td>{c?.normal_selling_price ? fmtCurrency(c.normal_selling_price) : '-'}</td>
                      <td>{c?.floor_price ? fmtCurrency(c.floor_price) : '-'}</td>
                      <td style={{ fontSize: 12 }}>{pct(c?.target_margin_percent)} / {pct(c?.minimum_margin_percent)}</td>
                      <td style={{ fontSize: 12 }}>
                        {c?.shipping_buffer_percent != null || c?.provision_buffer_percent != null
                          ? `${pct(c?.shipping_buffer_percent)} / ${pct(c?.provision_buffer_percent)}`
                          : <span style={{ color: 'var(--text-light)' }}>{t('ค่ากลาง')}</span>}
                      </td>
                      <td>
                        <span className={`badge ${c?.status === 'Active' || !c ? 'badge-green' : 'badge-gray'}`}>{c?.status || 'Active'}</span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-light)' }}>{c?.updated_by || '-'}</td>
                      <td className="td-actions">
                        <button className="btn btn-outline btn-xs" onClick={() => setModal(r)}>{hasCost ? t('แก้ไข') : t('กรอกต้นทุน')}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? t('กำลังโหลด...') : t('ไม่พบสินค้า')}</div></div>}
        </div>
      </div>
    </div>
  )
}
