import { useEffect, useMemo, useState } from 'react'
import {
  fetchProductCosts, upsertProductCost, updateProductMeta,
  fetchMarginSettings, updateMarginSetting, applyStandardPriceTiers,
  STANDARD_PRICE_TIERS, PRODUCT_COST_STATUS_OPTIONS
} from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import ImportProductCostsModal from './ImportProductCostsModal'
import CostHistoryModal from './CostHistoryModal'
import PriceTierModal from './PriceTierModal'

// หน้านี้เห็นได้เฉพาะบัญชี/แอดมิน (บังคับจริงด้วย RLS ของ product_costs — เซลล์ยิง API ตรงก็อ่านไม่ได้)
// เป็นแหล่งข้อมูลเดียวที่หน้า "เช็คราคา" ใช้คำนวณ

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v))
const pct = (n) => (n === null || n === undefined || n === '' ? '-' : `${Number(n).toFixed(2)}%`)

// คำอธิบายรายคอลัมน์ — กดที่หัวตารางแล้วเด้งขึ้นมา
// เขียนจากสูตรจริงใน margin_check_price (supabase/schema.sql) ไม่ใช่จากความจำ
// เจตนา: คนที่เข้ามาใหม่ตั้งค่าเองได้โดยไม่ต้องไปไล่อ่าน SQL และคนเดิมที่ลืมแล้วกลับมาอ่านซ้ำได้
// ถ้าแก้สูตรใน schema.sql ต้องมาแก้ตรงนี้ด้วย ไม่งั้นคำอธิบายจะพาคนเข้าใจผิด
const COLUMN_HELP = {
  cost: {
    title: 'ต้นทุน/ชิ้น',
    kind: 'กรอกเอง',
    body: [
      ['คืออะไร', 'ราคาทุนต่อชิ้นที่บัญชีกรอกไว้ ใช้เป็นฐานของการคำนวณทุกอย่างในหน้าเช็คราคา'],
      ['สำคัญยังไง', 'สินค้าที่ยังไม่กรอกต้นทุน หน้าเช็คราคาจะคำนวณไม่ได้เลย และออเดอร์ที่เปิดไปจะไม่มีต้นทุนบันทึกไว้ ทำให้รายงานกำไรสูงกว่าความจริง'],
      ['เก็บ ณ วันที่เปิดออเดอร์', 'ออเดอร์เก็บสำเนาต้นทุน ณ วันที่เปิดไว้ แก้ต้นทุนวันนี้จึงไม่ย้อนไปเปลี่ยนออเดอร์เก่า'],
    ],
  },
  normal: {
    title: 'ราคาขายปกติ',
    kind: 'กรอกเอง',
    body: [
      ['คืออะไร', 'ราคาป้ายก่อนลด ใช้เป็นฐานคิด % ส่วนลด'],
      ['ใช้ที่ไหน', 'ส่วนลดที่เสนอ = (1 − ราคาที่เสนอ ÷ ราคาขายปกติ) × 100 — ถ้าไม่กรอก ระบบจะเทียบส่วนลดไม่ได้ และขั้นบันไดตามจำนวนจะใช้ไม่ได้'],
    ],
  },
  floor: {
    title: 'Floor Price',
    kind: 'กรอกเอง — ไม่ใช่ค่าที่ระบบคำนวณ',
    body: [
      ['คืออะไร', 'ราคาต่ำสุดต่อชิ้นที่ตั้งใจกำหนดเองว่า "ห้ามขายต่ำกว่านี้" เป็นกฎที่บัญชีตั้ง ไม่ได้มาจากสูตร'],
      ['ใช้เมื่อไหร่', 'ใช้เฉพาะสินค้าที่ยังไม่ได้ตั้งขั้นบันไดตามจำนวน — ถ้าสินค้านั้นมีขั้นบันไดแล้ว ระบบจะไม่ใช้ Floor Price อีก เส้นห้ามขายจะกลายเป็น "ราคาเท่าทุนจริง" แทน'],
      ['ราคาเท่าทุนจริง', 'ต้นทุนคงที่ ÷ (1 − Buffer รวม) ÷ จำนวน\nต้นทุนคงที่ = (ต้นทุน/ชิ้น × จำนวน) + ค่าขนส่ง'],
      ['มีผลยังไง', 'เสนอต่ำกว่า Floor Price → ขึ้น "ไม่ควรขาย" และราคาที่ระบบแนะนำจะไม่ต่ำกว่า Floor Price เสมอ'],
      ['ตั้งเท่าไหร่ดี', 'ต้องสูงกว่าต้นทุน/ชิ้น ถ้าตั้งต่ำกว่าต้นทุน ระบบจะเตือนตอนบันทึก'],
    ],
  },
  margins: {
    title: 'เป้าหมาย / ขั้นต่ำ',
    kind: 'กรอกเอง — เป็น % ของยอดขาย ไม่ใช่ % ของต้นทุน',
    body: [
      ['คืออะไร', 'เกณฑ์ Margin สองเส้น ใช้ตัดสินว่าราคาที่เซลล์เสนอ "ผ่าน" หรือ "ต่ำกว่าเกณฑ์"'],
      ['Margin คิดยังไง', 'Margin % = กำไร ÷ ยอดขาย × 100\nกำไร = ยอดขาย − ต้นทุนรวม\nต้นทุนรวม = (ต้นทุน/ชิ้น × จำนวน) + ค่าขนส่ง + (ยอดขาย × Buffer ขนส่ง%) + (ยอดขาย × Buffer เผื่อ%)'],
      ['เส้นตัดสิน', 'Margin ที่ได้ ≥ เป้าหมาย → ผ่าน / ขายได้\n≥ ขั้นต่ำ แต่ยังไม่ถึงเป้าหมาย → ขายได้ แต่ Margin ต่ำ\nต่ำกว่าขั้นต่ำ → ต่ำกว่าเกณฑ์ (ยังมีกำไร แต่ควรคุยหัวหน้า)'],
      ['แปลงกลับเป็นราคา', 'ราคาที่ได้ Margin ตามเกณฑ์ = ต้นทุนคงที่ ÷ (1 − Buffer รวม − เกณฑ์ ÷ 100) ÷ จำนวน\nระบบใช้สูตรนี้หา "ราคาต่ำสุดที่ควรเสนอ" แล้วปัดขึ้นเป็นจำนวนเต็มบาท'],
      ['กรอกเป็นตัวเลขอะไร', 'กรอกเป็นเปอร์เซ็นต์เต็ม เช่น ต้องการ Margin 25% ให้กรอก 25 ไม่ใช่ 0.25'],
      ['ถ้าตั้งขั้นบันไดไว้', 'ค่าในขั้นบันไดของจำนวนนั้นจะถูกใช้ก่อน ค่าตรงนี้เป็นค่าสำรองเมื่อไม่มีขั้นที่ตรงกับจำนวน'],
    ],
  },
  buffer: {
    title: 'Buffer (ขนส่ง / เผื่อ)',
    kind: 'กรอกเอง — ว่างไว้ = ใช้ค่ากลาง',
    body: [
      ['คืออะไร', 'ค่าเผื่อสองตัวที่บวกเข้าไปในต้นทุนทุกครั้งที่คำนวณ คิดเป็น % ของยอดขาย ไม่ใช่ % ของต้นทุน'],
      ['Buffer ขนส่ง', 'เผื่อค่าขนส่งที่จริงแพงกว่าที่ประเมิน'],
      ['Buffer เผื่อ (Provision)', 'เผื่อความเสี่ยงอื่น เช่น ของเสีย เคลม ค่าธรรมเนียม'],
      ['ว่างไว้จะเป็นยังไง', 'ใช้ค่ากลางที่ตั้งไว้ในหน้านี้ (ค่าตั้งต้นของระบบคือ 2% ทั้งสองตัว) กรอกเฉพาะสินค้าที่ต่างจากปกติเท่านั้น'],
      ['มีผลยังไง', 'Buffer สูงขึ้น = ต้นทุนที่คำนวณสูงขึ้น = ราคาต่ำสุดที่ควรเสนอสูงขึ้นตาม'],
    ],
  },
}

const EMPTY = {
  cost_price: '', normal_selling_price: '', target_margin_percent: '', minimum_margin_percent: '',
  floor_price: '', shipping_buffer_percent: '', provision_buffer_percent: '',
  default_shipping_cost: '', special_discount_percent: '', status: 'Active', finance_remark: '',
  category: '', brand: ''
}

const HELP_CSS = `
.cm-th-help{background:none;border:none;padding:0;font:inherit;color:inherit;cursor:help;display:inline-flex;align-items:center;gap:4px}
.cm-th-help:hover{text-decoration:underline;text-underline-offset:3px}
.cm-th-help .i{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;border:1px solid currentColor;
               border-radius:50%;font-size:9px;line-height:1;opacity:.75;flex-shrink:0}
.cm-help-kind{display:inline-block;font-size:11px;font-weight:600;color:#c05621;background:#fffaf0;border:1px solid #f0c36d;
              border-radius:20px;padding:2px 10px;margin-bottom:12px}
.cm-help-row{margin-bottom:11px}
.cm-help-row .k{font-size:11.5px;font-weight:600;color:var(--navy);margin-bottom:2px}
.cm-help-row .v{font-size:12.5px;line-height:1.65;color:var(--text);white-space:pre-line}
.cm-help-formula{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:var(--gray-bg);border-radius:6px;padding:8px 10px}
`

// หัวตารางที่กดแล้วอธิบายว่าคอลัมน์นั้นคิดยังไง
function HelpTh({ id, label, onOpen }) {
  if (!id) return <th>{label}</th>
  return (
    <th>
      <button type="button" className="cm-th-help" onClick={() => onOpen(id)}>
        {label}<span className="i">?</span>
      </button>
    </th>
  )
}

function HelpPopup({ help, onClose }) {
  const { t } = useLanguage()
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div className="modal-title">{help.title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="cm-help-kind">{t(help.kind)}</div>
          {help.body.map(([k, v], i) => (
            <div className="cm-help-row" key={i}>
              <div className="k">{t(k)}</div>
              {/* บรรทัดที่เป็นสูตรมี ÷ หรือ × อยู่ ให้ใช้ฟอนต์ความกว้างคงที่ อ่านวงเล็บง่ายกว่า */}
              <div className={`v${/[÷×−]/.test(v) ? ' cm-help-formula' : ''}`}>{t(v)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
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
    special_discount_percent: c.special_discount_percent ?? '',
    status: c.status || 'Active',
    finance_remark: c.finance_remark || '',
    category: product.category || '',
    brand: product.brand || ''
  }))
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  // เตือนล่วงหน้าตามข้อควรระวังใน requirement — ไม่บล็อกการบันทึก แค่ให้บัญชีเห็นก่อน
  const warnings = []
  if (!(Number(f.cost_price) > 0)) warnings.push(t('ต้นทุนต้องมากกว่า 0 ไม่งั้นสินค้านี้จะยังคำนวณราคาไม่ได้'))
  if (f.floor_price !== '' && Number(f.floor_price) < Number(f.cost_price || 0)) {
    warnings.push(t('Floor Price ต่ำกว่าต้นทุน'))
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
              <label className="form-label">{t('สถานะ')}</label>
              <select className="form-control" value={f.status} onChange={set('status')}>
                {PRODUCT_COST_STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('เซลล์เลือกได้เฉพาะสินค้าที่เป็น Active')}</div>
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
              <label className="form-label">{t('หมวดหมู่')}</label>
              <input className="form-control" value={f.category} onChange={set('category')} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">{t('แบรนด์')}</label>
              <input className="form-control" value={f.brand} onChange={set('brand')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('เพดานส่วนลดพิเศษ (%)')}</label>
              <input className="form-control" type="number" step="0.01" value={f.special_discount_percent}
                onChange={set('special_discount_percent')} placeholder={t('ว่าง = ใช้ค่ากลาง')} />
              <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('ขอเกินส่วนลดของขั้น แต่ไม่เกินเพดานนี้ = เช็คกับหัวหน้า / เกินเพดาน = ต้องคุยหัวหน้า')}</div>
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
  // ค่ากลางตั้งครั้งเดียวแล้วแทบไม่แตะอีก ซ่อนไว้ได้จะได้ไม่บังตารางสินค้าซึ่งเป็นงานหลักของหน้านี้
  const [open, setOpen] = useState(false)

  const save = async (key) => {
    setSavingKey(key)
    try { await onSave(key, draft[key]) } finally { setSavingKey('') }
    setDraft(d => { const n = { ...d }; delete n[key]; return n })
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-header">
        <div className="card-title">{t('ค่ากลางที่ใช้คำนวณ')}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
            {t('ถ้าสินค้าตัวไหนกรอกค่าเฉพาะของตัวเองไว้ ระบบจะใช้ค่าของสินค้านั้นก่อน')}
          </span>
          <button className="btn btn-outline btn-xs" onClick={() => setOpen(v => !v)}>
            {open ? t('ซ่อน') : t('แสดง')}
          </button>
        </div>
      </div>
      {open && (
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
      )}
    </div>
  )
}

export default function CostMaster({ currentUserName }) {
  const { toast, confirm } = useUi()
  const { t, lang } = useLanguage()
  const [rows, setRows] = useState([])
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [modal, setModal] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [historyProduct, setHistoryProduct] = useState(null)
  const [tierProduct, setTierProduct] = useState(null)
  const [applyingTiers, setApplyingTiers] = useState(false)
  const [help, setHelp] = useState(null)   // คอลัมน์ที่กดหัวตารางขอคำอธิบาย

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
        special_discount_percent: num(f.special_discount_percent),
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

  // ตั้งเกณฑ์ส่วนลดมาตรฐานให้ทุกสินค้าที่มีต้นทุนแล้วในครั้งเดียว — ขั้นที่จำนวนตรงกันถูกเขียนทับ ขั้นที่ตั้งเองเพิ่มไว้ไม่หาย
  const applyStandardToAll = async () => {
    const targets = rows.filter(r => r.cost && Number(r.cost.cost_price) > 0)
    if (!targets.length) { toast('ยังไม่มีสินค้าที่กรอกต้นทุนไว้', 'error'); return }
    const noPrice = targets.filter(r => !(Number(r.cost.normal_selling_price) > 0)).length
    const warn = noPrice ? `\n(${noPrice} รายการยังไม่มีราคาขายปกติ ขั้นบันไดจะยังไม่มีผลจนกว่าจะกรอก)` : ''
    if (!(await confirm(`ตั้งขั้นบันไดมาตรฐาน ${STANDARD_PRICE_TIERS.length} ขั้นให้สินค้า ${targets.length} รายการ?${warn}`))) return
    setApplyingTiers(true)
    try {
      await applyStandardPriceTiers(targets.map(r => r.id), currentUserName)
      toast(`ตั้งขั้นบันไดให้ ${targets.length} รายการแล้ว`, 'success')
      await load()
    } catch (e) { toast('ทำไม่สำเร็จ: ' + e.message, 'error') }
    finally { setApplyingTiers(false) }
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
      <style>{HELP_CSS}</style>
      {help && <HelpPopup help={COLUMN_HELP[help]} onClose={() => setHelp(null)} />}
      <div className="section-header">
        <div className="section-title">
          {t('ต้นทุนสินค้า')} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} {t('รายการ')})</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {missingCount > 0 && (
            <span className="badge badge-orange">{t('ยังไม่ได้กรอกต้นทุน')} {missingCount} {t('รายการ')}</span>
          )}
          <button className="btn btn-outline btn-sm" onClick={applyStandardToAll} disabled={applyingTiers}>
            {applyingTiers ? t('กำลังตั้งค่า...') : t('ตั้งขั้นบันไดมาตรฐานให้ทุกสินค้า')}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>{t('นำเข้าจากไฟล์')}</button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 12 }}>
        {t('ข้อมูลในหน้านี้เห็นได้เฉพาะบัญชีและแอดมิน — เซลล์เห็นแค่ผลลัพธ์การคำนวณในหน้า "เช็คราคา" ไม่เห็นตัวเลขต้นทุน')}
      </div>

      {settings.length > 0 && <MarginSettingsCard rows={settings} onSave={onSaveSetting} />}

      {modal && <CostModal product={modal} onClose={() => setModal(null)} onSave={onSave} />}
      {showImport && (
        <ImportProductCostsModal products={rows} marginSettings={settings} currentUserName={currentUserName}
          onClose={() => setShowImport(false)} onImported={load} />
      )}
      {historyProduct && <CostHistoryModal product={historyProduct} onClose={() => setHistoryProduct(null)} />}
      {tierProduct && (
        <PriceTierModal product={tierProduct} currentUserName={currentUserName}
          onClose={() => setTierProduct(null)} onChanged={load} />
      )}

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
                  <th>{t('รหัสสินค้า')}</th><th>{t('ชื่อสินค้า')}</th>
                  <HelpTh id="cost" label={t('ต้นทุน/ชิ้น')} onOpen={setHelp} />
                  <HelpTh id="normal" label={t('ราคาขายปกติ')} onOpen={setHelp} />
                  <HelpTh id="floor" label="Floor Price" onOpen={setHelp} />
                  <HelpTh id="margins" label={t('เป้าหมาย/ขั้นต่ำ')} onOpen={setHelp} />
                  <HelpTh id="buffer" label="Buffer" onOpen={setHelp} />
                  <th>{t('สถานะ')}</th><th>{t('อัปเดตโดย')}</th><th></th>
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
                        {hasCost && <button className="btn btn-outline btn-xs" onClick={() => setTierProduct(r)}>{t('ขั้นบันได')}{r.tiers?.length ? ` (${r.tiers.length})` : ''}</button>}
                        {hasCost && <button className="btn btn-outline btn-xs" onClick={() => setHistoryProduct(r)}>{t('ประวัติ')}</button>}
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
