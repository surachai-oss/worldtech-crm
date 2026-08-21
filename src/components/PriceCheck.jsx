import { useEffect, useMemo, useState } from 'react'
import {
  fetchProductPriceView, checkPrice, fetchPriceStructure,
  PRICE_STATUS_PASS, PRICE_STATUS_LOW_MARGIN, PRICE_STATUS_UNDER, PRICE_STATUS_NO_SELL
} from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import SearchableSelect from './SearchableSelect'

// สีสถานะ: เขียว = ขายได้, เหลือง = margin ต่ำ, แดง = ต่ำกว่าเกณฑ์ (ต้องคุยหัวหน้า), เทา = ไม่ควรขาย
const STATUS_CLS = {
  [PRICE_STATUS_PASS]: 'badge-green',
  [PRICE_STATUS_LOW_MARGIN]: 'badge-orange',
  [PRICE_STATUS_UNDER]: 'badge-red',
  [PRICE_STATUS_NO_SELL]: 'badge-gray'
}
const statusCls = (s) => STATUS_CLS[s] || 'badge-gray'

// สีเน้นประจำสถานะ ใช้กับกรอบการ์ดและตัวเลข Margin — เซลล์ต้องเห็นแต่ไกลว่าอันไหนขายได้ อันไหนห้าม
const STATUS_COLOR = {
  [PRICE_STATUS_PASS]: 'var(--success)',
  [PRICE_STATUS_LOW_MARGIN]: 'var(--warning)',
  [PRICE_STATUS_UNDER]: 'var(--danger)',
  [PRICE_STATUS_NO_SELL]: '#4a5568'
}
const statusColor = (s) => STATUS_COLOR[s] || '#4a5568'
const STATUS_TINT = {
  [PRICE_STATUS_PASS]: '#f0fff7',
  [PRICE_STATUS_LOW_MARGIN]: '#fffaf0',
  [PRICE_STATUS_UNDER]: '#fff5f5',
  [PRICE_STATUS_NO_SELL]: '#f7fafc'
}
const statusTint = (s) => STATUS_TINT[s] || '#f7fafc'

const fmtPct = (n) => (n === null || n === undefined || n === '' ? '-' : `${Number(n).toFixed(2)}%`)
const shipLabel = (r) => (Number(r.shipping_cost) === 0 ? 'ส่งฟรี' : `${fmtCurrency(r.shipping_cost)} บาท`)

const OPTION_COUNT = 3
const blankOption = () => ({ quantity: '1', offerPrice: '', shippingCost: '' })

// ===== เลือกตัวเลือกที่คุ้มที่สุด แล้วอธิบายว่าเพราะอะไร =====
// ใช้ได้เฉพาะข้อมูลที่เซลล์เห็นอยู่แล้ว (Margin %, สถานะ, ค่าขนส่ง) ไม่แตะตัวเลขต้นทุน
// เกณฑ์: ตัดตัวที่ "ไม่ควรขาย" ออกก่อน แล้วเลือก Margin สูงสุด — Margin เท่ากันเอายอดขายรวมสูงกว่า
function buildComparison(results) {
  const ok = results.filter(x => x.result)
  if (ok.length < 2) return null

  const sellable = ok.filter(x => x.result.price_status !== PRICE_STATUS_NO_SELL)
  if (!sellable.length) {
    return { bestNo: null, headline: 'ทุกตัวเลือกอยู่ในสถานะ "ไม่ควรขาย" — ราคาต่ำกว่า Floor Price หรือไม่ครอบคลุมต้นทุนรวม ควรปรับราคาขึ้นก่อนเสนอ', lines: [] }
  }

  const best = sellable.reduce((a, b) => {
    const dm = Number(b.result.margin_percent) - Number(a.result.margin_percent)
    if (Math.abs(dm) > 0.001) return dm > 0 ? b : a
    return Number(b.result.net_sales) > Number(a.result.net_sales) ? b : a
  })
  const br = best.result

  const headline = `ตัวเลือกที่ ${best.no} คุ้มที่สุด — Margin ${fmtPct(br.margin_percent)} ยอดขายรวม ${fmtCurrency(br.net_sales)} บาท (${br.price_status})`

  const lines = []
  ok.filter(x => x.no !== best.no).forEach(x => {
    const r = x.result
    const diff = Number(br.margin_percent) - Number(r.margin_percent)
    const why = []
    if (Number(r.offer_price) !== Number(br.offer_price)) {
      why.push(`ราคาเสนอ ${fmtCurrency(br.offer_price)} vs ${fmtCurrency(r.offer_price)} บาท/ชิ้น`)
    }
    if (Number(r.quantity) !== Number(br.quantity)) {
      why.push(`จำนวน ${br.quantity} vs ${r.quantity} ชิ้น`)
    }
    if (Number(r.shipping_cost) !== Number(br.shipping_cost)) {
      why.push(`ค่าขนส่ง ${shipLabel(br)} vs ${shipLabel(r)}`)
    }

    if (r.price_status === PRICE_STATUS_NO_SELL) {
      lines.push(`ตัวเลือกที่ ${x.no} เสนอไม่ได้ (${r.price_status}) — ${why.join(' · ') || 'ต่ำกว่า Floor Price'}`)
    } else if (diff > 0.001) {
      lines.push(`ดีกว่าตัวเลือกที่ ${x.no} อยู่ ${diff.toFixed(2)} จุด (${fmtPct(r.margin_percent)} → ${fmtPct(br.margin_percent)})${why.length ? ' เพราะ ' + why.join(' · ') : ''}`)
    } else {
      lines.push(`ตัวเลือกที่ ${x.no} ได้ Margin เท่ากัน (${fmtPct(r.margin_percent)}) แต่ยอดขายรวมน้อยกว่า (${fmtCurrency(r.net_sales)} บาท)`)
    }
  })

  // จุดที่มักเป็นตัวชี้ขาดจริงในการต่อรอง: ตัวที่ส่งฟรีเสีย Margin ไปเท่าไหร่เทียบกับตัวที่เก็บค่าส่ง
  const free = ok.filter(x => Number(x.result.shipping_cost) === 0)
  const charged = ok.filter(x => Number(x.result.shipping_cost) > 0)
  if (free.length && charged.length) {
    const f = free[0], c = charged[0]
    const d = Number(c.result.margin_percent) - Number(f.result.margin_percent)
    if (d > 0.001) {
      lines.push(`ตัวเลือกที่ ${f.no} ส่งฟรีเลยเสีย Margin ไป ${d.toFixed(2)} จุด — ถ้าเก็บค่าขนส่ง ${fmtCurrency(c.result.shipping_cost)} บาทแบบตัวเลือกที่ ${c.no} จะได้ ${fmtPct(c.result.margin_percent)}`)
    }
  }

  // แนะนำด้วยราคาที่มาจาก "ราคาขายปกติ × ส่วนลด" เท่านั้น — ไม่อ้างราคาที่คำนวณจากต้นทุน
  if (br.price_status === PRICE_STATUS_UNDER && br.special_price) {
    lines.push(`แม้จะเป็นตัวที่ดีที่สุด แต่ยังเกินเพดานส่วนลดพิเศษ — ถ้าขยับขึ้นเป็น ${fmtCurrency(br.special_price)} บาท/ชิ้น จะอยู่ในเพดานพอดี`)
  } else if (br.price_status === PRICE_STATUS_LOW_MARGIN && br.tier_price) {
    lines.push(`ถ้าอยากอยู่ในส่วนลดปกติของขั้นนี้ ต้องเสนออย่างน้อย ${fmtCurrency(br.tier_price)} บาท/ชิ้น`)
  }

  return { bestNo: best.no, headline, lines }
}

// ข้อความสรุปให้เซลล์คัดลอกไปคุยหัวหน้านอกระบบ — ห้ามมีต้นทุนอยู่ในนี้
function buildSummaryText(results, comparison) {
  const ok = results.filter(x => x.result)
  const lines = ['ขอปรึกษาราคา B2B', '']
  if (ok.length) lines.push(`สินค้า: ${ok[0].result.product_code} - ${ok[0].result.product_name}`, '')

  ok.forEach(x => {
    const r = x.result
    if (ok.length > 1) lines.push(`— ตัวเลือกที่ ${x.no} —`)
    lines.push(
      `จำนวน: ${r.quantity} เครื่อง`,
      `ราคาที่จะเสนอ: ${fmtCurrency(r.offer_price)} บาท/ชิ้น`,
      `ค่าขนส่งจริง: ${shipLabel(r)}${r.used_default_shipping ? ' (ใช้ค่ามาตรฐาน)' : ''}`,
      `ยอดขายรวม: ${fmtCurrency(r.net_sales)} บาท`,
      `Margin คงเหลือ: ${fmtPct(r.margin_percent)}`,
      `Tier ระบบ: ${r.auto_tier}`,
      `สถานะ: ${r.price_status}`,
      ...(r.tier_price ? [`ส่วนลดที่ขั้นนี้ให้ได้: ${r.tier_discount_percent}% (${fmtCurrency(r.tier_price)} บาท/ชิ้น)`] : []),
      ...(r.special_price ? [`เพดานส่วนลดพิเศษ: ${r.special_discount_percent}% (${fmtCurrency(r.special_price)} บาท/ชิ้น)`] : []),
      ''
    )
  })

  if (comparison) {
    lines.push('ระบบแนะนำ:', comparison.headline)
    comparison.lines.forEach(l => lines.push('- ' + l))
    lines.push('')
  } else if (ok.length === 1) {
    lines.push('คำแนะนำระบบ:', ok[0].result.recommendation || '', '')
  }

  lines.push('หมายเหตุ: ระบบไม่ได้แสดงต้นทุนสินค้าใน Summary นี้')
  return lines.join('\n')
}

// ===== ตารางโครงสร้างราคา =====
// ให้เซลล์เห็นทั้งบันไดในตาราง ไม่ต้องกดคำนวณทีละจำนวนเพื่อจะรู้ว่าขายได้เท่าไหร่
// แถวที่ตรงกับจำนวนที่กำลังกรอกอยู่จะถูกไฮไลต์ เชื่อมกับสิ่งที่กำลังทำ
function qtyLabel(tier) {
  if (tier.max_qty == null) return `${tier.min_qty}+ ตัว`
  if (tier.max_qty === tier.min_qty) return `${tier.min_qty} ตัว`
  return `${tier.min_qty}-${tier.max_qty} ตัว`
}

function PriceStructureTable({ data, highlightQtys = [] }) {
  const { t } = useLanguage()
  if (!data) return null
  const tiers = data.tiers || []
  const normal = Number(data.normal_selling_price) || 0

  if (!normal) {
    return <div style={{ fontSize: 12, color: 'var(--danger)' }}>{t('สินค้านี้ยังไม่ได้กรอกราคาขายปกติ — ยังแสดงโครงสร้างราคาไม่ได้')}</div>
  }
  if (!tiers.length) {
    return <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('สินค้านี้ยังไม่ได้ตั้งขั้นบันไดตามจำนวน — ใช้ราคาขายปกติกับทุกจำนวน')}</div>
  }

  // จำนวนที่กรอกอยู่ตกอยู่ขั้นไหน (ขั้นที่ min_qty มากสุดที่ยังไม่เกินจำนวนนั้น) — เกณฑ์เดียวกับที่ระบบใช้คำนวณ
  const tierIndexFor = (qty) => {
    let idx = -1
    tiers.forEach((tr, i) => { if (qty >= tr.min_qty) idx = i })
    return idx
  }
  const activeIdx = new Set(highlightQtys.filter(q => q > 0).map(tierIndexFor).filter(i => i >= 0))

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('จำนวน')}</th>
              <th>{t('ส่วนลดที่ให้ได้')}</th>
              <th>{t('ราคา/ชิ้น')}</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tr, i) => {
              const on = activeIdx.has(i)
              return (
                <tr key={tr.min_qty} style={on ? { background: '#f0fff7' } : undefined}>
                  <td style={{ fontWeight: on ? 700 : 500, color: 'var(--navy)' }}>
                    {qtyLabel(tr)}
                    {on && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>{t('ขั้นที่ใช้อยู่')}</span>}
                  </td>
                  <td>{Number(tr.discount_percent) > 0 ? `${Number(tr.discount_percent)}%` : <span style={{ color: 'var(--text-light)' }}>{t('ไม่ลด')}</span>}</td>
                  <td style={{ fontWeight: 700, color: 'var(--success)' }}>{fmtCurrency(tr.unit_price)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* เพดานพิเศษไม่ใช่ขั้นตามจำนวน เลยแยกออกมาจากตาราง ไม่ให้เข้าใจผิดว่าเป็นอีกขั้นหนึ่ง */}
      <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#fffaf0', borderLeft: '3px solid var(--warning)', fontSize: 12 }}>
        <b>{t('เพดานส่วนลดพิเศษ')} {Number(data.special_discount_percent)}% = {fmtCurrency(data.special_price)} {t('บาท/ชิ้น')}</b>
        <div style={{ color: 'var(--text-light)', marginTop: 2 }}>
          {t('ใช้ได้ทุกจำนวน — ต่ำกว่าราคาของขั้นแต่ไม่ต่ำกว่าราคานี้ = เช็คกับหัวหน้าก่อน / ต่ำกว่าราคานี้ = เกินเกณฑ์ ต้องคุยหัวหน้า')}
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-light)', lineHeight: 1.6 }}>
        <div>{t('ราคาในตารางคิดจากราคาขายปกติ')} {fmtCurrency(normal)} {t('บาท/ชิ้น')}</div>
        <div>{t('ยังไม่รวมค่าขนส่ง — ถ้าดีลนั้นมีค่าขนส่งจริง ให้กรอกในช่องด้านบนแล้วกดคำนวณ Margin จะต่างจากตารางนี้')}</div>
      </div>
    </>
  )
}

function ResultRow({ label, value, strong, hint, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '4px 0', borderBottom: '1px dashed var(--border)' }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-light)' }}>{label}{hint && <span style={{ marginLeft: 4 }}>{hint}</span>}</span>
      <span style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? 700 : 500, color: color || 'var(--navy)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function PriceCheck({ perm }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const canSeeProfit = perm?.isAdmin || perm?.isFinance

  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)

  const [productId, setProductId] = useState('')
  const [options, setOptions] = useState(() => [blankOption(), blankOption(), blankOption()])
  const [calculating, setCalculating] = useState(false)
  const [results, setResults] = useState([])   // [{ no, result, error }]
  const [structure, setStructure] = useState(null)
  const [showStructure, setShowStructure] = useState(true)


  // โครงสร้างราคาของสินค้าที่เลือก — โหลดครั้งเดียวตอนเปลี่ยนสินค้า ไม่ต้องรอกดคำนวณ
  useEffect(() => {
    if (!productId) { setStructure(null); return }
    let alive = true
    fetchPriceStructure(productId)
      .then(r => { if (alive) setStructure(r) })
      .catch(e => { if (alive) toast('โหลดโครงสร้างราคาไม่สำเร็จ: ' + e.message, 'error') })
    return () => { alive = false }
  }, [productId, toast])

  useEffect(() => {
    fetchProductPriceView()
      .then(setProducts)
      .catch(e => toast('โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error'))
      .finally(() => setLoadingProducts(false))
  }, [toast])


  // เลือกได้เฉพาะสินค้าที่บัญชีกรอกต้นทุนแล้วและยัง Active — ตัวอื่นคำนวณไม่ได้อยู่ดี
  const selectable = useMemo(
    () => products.filter(p => p.has_cost && String(p.status).toLowerCase() === 'active'),
    [products]
  )
  const selected = useMemo(() => products.find(p => p.product_id === productId) || null, [products, productId])
  const missingCost = products.filter(p => !p.has_cost).length

  const setOpt = (i, k) => (e) => {
    const v = e.target.value
    setOptions(prev => prev.map((o, idx) => (idx === i ? { ...o, [k]: v } : o)))
    setResults([])
  }

  // ตัวเลือกที่ "กรอกแล้ว" = ใส่ราคาที่จะเสนอมา (จำนวนมีค่าตั้งต้น 1 อยู่แล้ว)
  const filledIdx = options.map((o, i) => (o.offerPrice.trim() !== '' ? i : -1)).filter(i => i >= 0)

  const argsFor = (i) => ({
    productId,
    quantity: Number(options[i].quantity),
    offerPrice: Number(options[i].offerPrice),
    shippingCost: options[i].shippingCost.trim() === '' ? null : Number(options[i].shippingCost)
  })

  const validate = () => {
    if (!productId) { toast('กรุณาเลือกสินค้า', 'error'); return false }
    if (!filledIdx.length) { toast('กรุณากรอกราคาที่จะเสนออย่างน้อย 1 ตัวเลือก', 'error'); return false }
    for (const i of filledIdx) {
      const o = options[i]
      if (!(Number(o.quantity) > 0)) { toast(`ตัวเลือกที่ ${i + 1}: จำนวนต้องมากกว่า 0`, 'error'); return false }
      if (!(Number(o.offerPrice) > 0)) { toast(`ตัวเลือกที่ ${i + 1}: ราคาที่จะเสนอต้องมากกว่า 0`, 'error'); return false }
      if (o.shippingCost.trim() !== '' && Number(o.shippingCost) < 0) { toast(`ตัวเลือกที่ ${i + 1}: ค่าขนส่งต้องไม่ติดลบ`, 'error'); return false }
    }
    return true
  }

  const doCheck = async () => {
    if (!validate()) return
    setCalculating(true)
    try {
      const out = await Promise.all(filledIdx.map(async (i) => {
        try { return { no: i + 1, idx: i, result: await checkPrice(argsFor(i)) } }
        catch (e) { return { no: i + 1, idx: i, error: e.message } }
      }))
      setResults(out)
      const firstError = out.find(x => x.error)
      if (firstError) toast(`ตัวเลือกที่ ${firstError.no}: ${firstError.error}`, 'error')
    } finally { setCalculating(false) }
  }


  const comparison = useMemo(() => buildComparison(results), [results])

  const doCopy = async () => {
    const text = buildSummaryText(results, comparison)
    try {
      await navigator.clipboard.writeText(text)
      toast('คัดลอกสรุปแล้ว นำไปวางในแชทได้เลย', 'success')
    } catch {
      window.prompt(lang === 'en' ? 'Copy this summary:' : 'คัดลอกข้อความนี้:', text)
    }
  }



  const reset = () => {
    setProductId(''); setOptions([blankOption(), blankOption(), blankOption()]); setResults([])
  }

  const okResults = results.filter(x => x.result)

  return (
    <div className="scroll-view">
      <div className="section-header">
        <div className="section-title">{t('เช็คราคา')}</div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header">
          <div className="card-title">{t('คำนวณราคาก่อนเสนอลูกค้า')}</div>
          <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
            {t('กรอกได้ถึง 3 ตัวเลือก เพื่อเทียบว่าแบบไหนคุ้มที่สุด — กรอกแค่ตัวเลือกที่ 1 ก็ได้')}
          </span>
        </div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label required">{t('สินค้า')}</label>
            <SearchableSelect
              options={selectable}
              value={productId}
              onChange={(v) => { setProductId(v); setResults([]) }}
              getOptionValue={(o) => o.product_id}
              getOptionLabel={(o) => `${o.code} - ${o.name}`}
              placeholder={loadingProducts ? t('กำลังโหลด...') : t('-- เลือกสินค้า --')}
            />
          </div>

          {selected && (
            <div style={{ margin: '2px 0 12px', fontSize: 12, color: 'var(--text-light)' }}>
              {t('ราคาขายปกติ')}: <b>{selected.normal_selling_price ? fmtCurrency(selected.normal_selling_price) : '-'}</b>
              {/* Floor Price / เกณฑ์ Margin เป็นตัวเลขภายใน เซลล์ใช้ส่วนลดของขั้นตัดสินใจแทน */}
              {canSeeProfit && <>
                {'  ·  '}Floor Price: <b>{fmtCurrency(selected.floor_price)}</b>
                {'  ·  '}{t('Margin เป้าหมาย')}: <b>{fmtPct(selected.target_margin_percent)}</b>
                {'  ·  '}{t('Margin ขั้นต่ำ')}: <b>{fmtPct(selected.minimum_margin_percent)}</b>
              </>}
              {selected.finance_remark && <div style={{ marginTop: 4 }}>{t('หมายเหตุจากบัญชี')}: {selected.finance_remark}</div>}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${OPTION_COUNT}, 1fr)`, gap: 12 }}>
            {options.map((o, i) => (
              <div key={i} style={{
                border: '1px solid var(--border)', borderRadius: 8, padding: 10,
                background: comparison?.bestNo === i + 1 ? '#f0fff7' : 'transparent'
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>
                  {t('ตัวเลือกที่')} {i + 1}
                  {i > 0 && <span style={{ fontWeight: 400, color: 'var(--text-light)' }}> ({t('ไม่บังคับ')})</span>}
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">{t('จำนวน')}</label>
                  <input className="form-control" type="number" min="1" value={o.quantity} onChange={setOpt(i, 'quantity')} />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label className="form-label">{t('ราคาที่จะเสนอ/ชิ้น')}</label>
                  <input className="form-control" type="number" min="0" step="0.01" value={o.offerPrice} onChange={setOpt(i, 'offerPrice')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">{t('ค่าขนส่งจริง (ทั้งดีล)')}</label>
                  <input className="form-control" type="number" min="0" step="0.01" value={o.shippingCost}
                    placeholder={t('0 = ส่งฟรี, ว่าง = ค่ามาตรฐาน')} onChange={setOpt(i, 'shippingCost')} />
                </div>
              </div>
            ))}
          </div>


          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={doCheck} disabled={calculating}>
              {calculating ? t('กำลังคำนวณ...') : (filledIdx.length > 1 ? t('คำนวณเปรียบเทียบ') : t('คำนวณ'))}
            </button>
            <button className="btn btn-outline" onClick={reset} disabled={calculating}>{t('ล้างฟอร์ม')}</button>
            {okResults.length > 0 && (
              <button className="btn btn-secondary" onClick={doCopy}>{t('คัดลอกสรุปไปคุยหัวหน้า')}</button>
            )}
            {missingCost > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-light)', alignSelf: 'center' }}>
                {t('สินค้าที่บัญชียังไม่ได้กรอกต้นทุน')}: {missingCost} {t('รายการ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {productId && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <div className="card-title">{t('โครงสร้างราคา')}{selected ? ` — ${selected.code}` : ''}</div>
            <button className="btn btn-outline btn-xs" onClick={() => setShowStructure(v => !v)}>
              {showStructure ? t('ซ่อน') : t('แสดง')}
            </button>
          </div>
          {showStructure && (
            <div className="card-body">
              <PriceStructureTable
                data={structure}
                highlightQtys={filledIdx.map(i => Number(options[i].quantity))}
              />
            </div>
          )}
        </div>
      )}

      {comparison && (
        <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--yellow)' }}>
          <div className="card-body">
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
              {t('ระบบแนะนำ')}: {comparison.headline}
            </div>
            {comparison.lines.map((l, i) => (
              <div key={i} style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 3 }}>• {l}</div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(results.length, 1)}, 1fr)`, gap: 12, marginBottom: 14 }}>
          {results.map(entry => (
            <div className="card" key={entry.no}
              style={entry.result
                ? { borderTop: `4px solid ${statusColor(entry.result.price_status)}`, outline: comparison?.bestNo === entry.no ? '2px solid var(--success)' : undefined }
                : { borderTop: '4px solid var(--danger)' }}>
              <div className="card-header" style={{ background: entry.result ? statusTint(entry.result.price_status) : undefined }}>
                <div className="card-title" style={{ fontSize: 13 }}>
                  {t('ตัวเลือกที่')} {entry.no}
                  {comparison?.bestNo === entry.no && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>{t('คุ้มที่สุด')}</span>}
                  {entry.result?.check_no && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-light)', fontWeight: 400 }}>({entry.result.check_no})</span>}
                </div>
                {entry.result && (
                  <span className={`badge ${statusCls(entry.result.price_status)}`} style={{ fontSize: 12, fontWeight: 700 }}>{entry.result.price_status}</span>
                )}
              </div>
              <div className="card-body">
                {entry.error ? (
                  <div style={{ color: 'var(--danger)', fontSize: 12 }}>{entry.error}</div>
                ) : (
                  <>
                    <ResultRow label="Margin" value={fmtPct(entry.result.margin_percent)} strong
                      color={statusColor(entry.result.price_status)} />
                    <ResultRow label={t('ยอดขายรวม')} value={fmtCurrency(entry.result.net_sales)} strong />
                    <ResultRow label={t('ราคาที่เสนอ/ชิ้น')} value={`${fmtCurrency(entry.result.offer_price)} × ${entry.result.quantity}`} />
                    {/* เทียบกับราคาขายปกติ ให้เซลล์เห็นว่าที่ลูกค้าขอมาถูกกว่าปกติมากแค่ไหน */}
                    <ResultRow label={t('ราคาขายปกติ/ชิ้น')}
                      value={entry.result.normal_selling_price ? fmtCurrency(entry.result.normal_selling_price) : '-'} />
                    {entry.result.normal_selling_price > 0 && (() => {
                      const normal = Number(entry.result.normal_selling_price)
                      const diff = Number(entry.result.offer_price) - normal
                      const pctOff = (diff / normal) * 100
                      return (
                        <ResultRow label={t('ต่างจากราคาปกติ')}
                          value={`${diff > 0 ? '+' : ''}${fmtCurrency(diff)} (${pctOff > 0 ? '+' : ''}${pctOff.toFixed(1)}%)`}
                          color={diff < 0 ? 'var(--danger)' : 'var(--success)'} />
                      )
                    })()}
                    <ResultRow label={t('ค่าขนส่งที่ใช้คำนวณ')} value={shipLabel(entry.result)}
                      hint={entry.result.used_default_shipping ? `(${t('ค่ามาตรฐาน')})` : null} />
                    <ResultRow label="Tier" value={entry.result.auto_tier} />
                    {entry.result.ladder && (
                      <>
                        <ResultRow label={t('ส่วนลดที่ลูกค้าขอ')}
                          value={entry.result.offer_discount_percent != null ? `${Number(entry.result.offer_discount_percent).toFixed(2)}%` : '-'}
                          strong color={statusColor(entry.result.price_status)} />
                        <ResultRow label={t('ส่วนลดปกติของขั้นนี้')}
                          value={`${Number(entry.result.tier_discount_percent)}%  (${fmtCurrency(entry.result.tier_price)})`}
                          hint={entry.result.tier_label ? `· ${entry.result.tier_label}` : null} />
                        <ResultRow label={t('เพดานส่วนลดพิเศษ')}
                          value={`${Number(entry.result.special_discount_percent)}%  (${fmtCurrency(entry.result.special_price)})`} />
                      </>
                    )}
                    {/* ราคาเท่าทุน/ขั้นต่ำ/ถึงเป้าหมาย คำนวณจากต้นทุนโดยตรง เซลล์จึงไม่เห็น (ฝั่งเซิร์ฟเวอร์ก็ไม่ส่งมาให้)
                        สิ่งที่เซลล์ใช้ตัดสินใจคือราคาของขั้นกับเพดานพิเศษ ซึ่งมาจากราคาขายปกติ ไม่เกี่ยวกับต้นทุน */}
                    {canSeeProfit && (
                      <>
                        <ResultRow label={entry.result.ladder ? t('ราคาเท่าทุน/ชิ้น') : 'Floor Price'}
                          value={fmtCurrency(entry.result.floor_price)}
                          hint={entry.result.ladder ? `(${t('ต่ำกว่านี้คือขาดทุน')})` : null} />
                        <ResultRow label={t('ราคาแนะนำขั้นต่ำ/ชิ้น')}
                          value={entry.result.suggested_min_price ? fmtCurrency(entry.result.suggested_min_price) : t('คำนวณไม่ได้')} strong />
                        {entry.result.suggested_target_price && (
                          <ResultRow label={t('ราคาที่ถึงเป้าหมาย/ชิ้น')} value={fmtCurrency(entry.result.suggested_target_price)}
                            color="var(--success)" />
                        )}
                      </>
                    )}
                    {/* ขั้นถัดไปเป็นไพ่ให้เซลล์ชวนลูกค้าซื้อเพิ่มเพื่อแลกส่วนลดที่ลึกกว่า */}
                    {entry.result.next_tier_min_qty && entry.result.next_tier_price && (
                      <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: '#ebf8ff', fontSize: 11.5, color: '#2b6cb0' }}>
                        {t('ถ้าเพิ่มเป็น')} <b>{entry.result.next_tier_min_qty}</b> {t('ชิ้น')} {t('จะลดได้ถึง')} <b>{Number(entry.result.next_tier_max_discount_percent)}%</b>
                        {' '}({t('ราคาต่ำสุดประมาณ')} {fmtCurrency(entry.result.next_tier_price)})
                      </div>
                    )}
                    {/* ตัวเลข Buffer และกำไรเป็นบาท เซลล์ไม่ต้องเห็น — ดูแค่ Margin % กับสถานะก็พอตัดสินใจได้ */}
                    {canSeeProfit && (
                      <>
                        <ResultRow label="Shipping Buffer" value={fmtCurrency(entry.result.shipping_buffer)} hint={`(${fmtPct(entry.result.shipping_buffer_percent)})`} />
                        <ResultRow label="Provision Buffer" value={fmtCurrency(entry.result.provision_buffer)} hint={`(${fmtPct(entry.result.provision_buffer_percent)})`} />
                        <ResultRow label={t('กำไรรวม')} value={fmtCurrency(entry.result.total_profit)} strong />
                      </>
                    )}
                    <div style={{
                      marginTop: 10, padding: '8px 10px', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-line',
                      background: statusTint(entry.result.price_status),
                      borderLeft: `3px solid ${statusColor(entry.result.price_status)}`
                    }}>
                      {entry.result.recommendation}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {okResults.some(x => x.result.price_status === PRICE_STATUS_UNDER || x.result.price_status === PRICE_STATUS_NO_SELL) && (
        <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--danger)' }}>
          {t('ระบบไม่มีขั้นตอนขออนุมัติ — ให้คัดลอกสรุปไปคุยกับหัวหน้าก่อนเสนอราคานี้ให้ลูกค้า')}
        </div>
      )}

    </div>
  )
}
