import { useEffect, useMemo, useState } from 'react'
import {
  fetchProductPriceView, checkPrice, savePriceCheck, fetchPriceChecks, deletePriceCheck,
  PRICE_STATUS_PASS, PRICE_STATUS_LOW_MARGIN, PRICE_STATUS_UNDER, PRICE_STATUS_NO_SELL, PRICE_STATUS_ORDER
} from '../lib/api'
import { exportPriceChecksToExcel } from '../lib/importExport'
import { fmtCurrency, fmtDate, currentMonthRange } from '../lib/format'
import { adminOnlyDelete } from '../lib/permissions'
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

  if (br.price_status === PRICE_STATUS_UNDER) {
    lines.push(`แม้จะเป็นตัวที่ดีที่สุด แต่ยังต่ำกว่า Margin ขั้นต่ำ — ควรคุยหัวหน้าก่อนเสนอ หรือขยับราคาขึ้นเป็น ${br.suggested_min_price ? fmtCurrency(br.suggested_min_price) + ' บาท/ชิ้น' : 'ราคาแนะนำขั้นต่ำ'}`)
  } else if (br.price_status === PRICE_STATUS_LOW_MARGIN && br.suggested_min_price) {
    lines.push(`ถ้าอยากถึงเป้าหมาย ต้องเสนออย่างน้อย ${fmtCurrency(br.suggested_min_price)} บาท/ชิ้น`)
  }

  return { bestNo: best.no, headline, lines }
}

// ข้อความสรุปให้เซลล์คัดลอกไปคุยหัวหน้านอกระบบ — ห้ามมีต้นทุนอยู่ในนี้
function buildSummaryText(results, comparison, note) {
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
      `Shipping Buffer: ${fmtCurrency(r.shipping_buffer)} บาท`,
      `Provision Buffer: ${fmtCurrency(r.provision_buffer)} บาท`,
      `Margin คงเหลือ: ${fmtPct(r.margin_percent)}`,
      `Tier ระบบ: ${r.auto_tier}`,
      `สถานะ: ${r.price_status}`,
      `ราคาแนะนำขั้นต่ำ: ${r.suggested_min_price ? `${fmtCurrency(r.suggested_min_price)} บาท` : 'คำนวณไม่ได้'}`,
      `Floor Price: ${fmtCurrency(r.floor_price)} บาท`,
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

  if (note?.trim()) lines.push('หมายเหตุจากเซลล์:', note.trim(), '')
  lines.push('หมายเหตุ: ระบบไม่ได้แสดงต้นทุนสินค้าใน Summary นี้')
  return lines.join('\n')
}

function ResultRow({ label, value, strong, hint }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '4px 0', borderBottom: '1px dashed var(--border)' }}>
      <span style={{ fontSize: 11.5, color: 'var(--text-light)' }}>{label}{hint && <span style={{ marginLeft: 4 }}>{hint}</span>}</span>
      <span style={{ fontSize: strong ? 14 : 12.5, fontWeight: strong ? 700 : 500, color: 'var(--navy)', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

export default function PriceCheck({ perm }) {
  const { toast, confirm } = useUi()
  const { t, lang } = useLanguage()
  const canSeeProfit = perm?.isAdmin || perm?.isFinance

  const [products, setProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(true)

  const [productId, setProductId] = useState('')
  const [options, setOptions] = useState(() => [blankOption(), blankOption(), blankOption()])
  const [note, setNote] = useState('')
  const [calculating, setCalculating] = useState(false)
  const [savingNo, setSavingNo] = useState(0)
  const [results, setResults] = useState([])   // [{ no, result, error }]

  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [hq, setHq] = useState('')
  const [hStatus, setHStatus] = useState('')
  const [fromDate, setFromDate] = useState(() => currentMonthRange().first)
  const [toDate, setToDate] = useState(() => currentMonthRange().last)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetchProductPriceView()
      .then(setProducts)
      .catch(e => toast('โหลดรายการสินค้าไม่สำเร็จ: ' + e.message, 'error'))
      .finally(() => setLoadingProducts(false))
  }, [toast])

  const loadHistory = () => {
    setLoadingHistory(true)
    fetchPriceChecks({ q: hq, status: hStatus, dateFrom: fromDate, dateTo: toDate })
      .then(setHistory)
      .catch(e => toast('โหลดประวัติไม่สำเร็จ: ' + e.message, 'error'))
      .finally(() => setLoadingHistory(false))
  }

  useEffect(() => {
    const timer = setTimeout(loadHistory, 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hq, hStatus, fromDate, toDate])

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

  const doSave = async (entry) => {
    setSavingNo(entry.no)
    try {
      const saved = await savePriceCheck({
        ...argsFor(entry.idx),
        note,
        optionLabel: results.filter(x => x.result).length > 1 ? `ตัวเลือกที่ ${entry.no}` : null
      })
      setResults(prev => prev.map(x => (x.no === entry.no ? { ...x, result: { ...x.result, check_no: saved.check_no } } : x)))
      toast('บันทึกประวัติแล้ว (' + saved.check_no + ')', 'success')
      loadHistory()
    } catch (e) { toast(e.message, 'error') }
    finally { setSavingNo(0) }
  }

  const comparison = useMemo(() => buildComparison(results), [results])

  const doCopy = async () => {
    const text = buildSummaryText(results, comparison, note)
    try {
      await navigator.clipboard.writeText(text)
      toast('คัดลอกสรุปแล้ว นำไปวางในแชทได้เลย', 'success')
    } catch {
      window.prompt(lang === 'en' ? 'Copy this summary:' : 'คัดลอกข้อความนี้:', text)
    }
  }

  const doExport = async () => {
    setExporting(true)
    try { await exportPriceChecksToExcel(history, canSeeProfit) }
    catch (e) { toast('ส่งออกไม่สำเร็จ: ' + e.message, 'error') }
    finally { setExporting(false) }
  }

  const doDelete = async (row) => {
    if (!(await confirm(`ลบประวัติการเช็คราคา ${row.check_no}?`))) return
    try { await deletePriceCheck(row.id); toast('ลบสำเร็จ', 'success'); loadHistory() }
    catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error') }
  }

  const reset = () => {
    setProductId(''); setOptions([blankOption(), blankOption(), blankOption()]); setNote(''); setResults([])
  }

  const okResults = results.filter(x => x.result)

  return (
    <div className="list-view">
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
              {'  ·  '}Floor Price: <b>{fmtCurrency(selected.floor_price)}</b>
              {'  ·  '}{t('Margin เป้าหมาย')}: <b>{fmtPct(selected.target_margin_percent)}</b>
              {'  ·  '}{t('Margin ขั้นต่ำ')}: <b>{fmtPct(selected.minimum_margin_percent)}</b>
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

          <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
            <label className="form-label">{t('หมายเหตุ (บันทึกไว้ดูย้อนหลัง)')}</label>
            <input className="form-control" value={note} onChange={e => setNote(e.target.value)}
              placeholder={t('เช่น ตกลงราคาโปรเจค A / ลูกค้าเก่าซื้อซ้ำ / แถมค่าส่งแลกกับสั่งเพิ่ม')} />
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
              {t('ข้อความนี้จะถูกเก็บไว้กับประวัติตอนกดบันทึก ใช้ตอบย้อนหลังว่าทำไมลูกค้ารายนี้ได้ราคานี้')}
            </div>
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
            <div className="card" key={entry.no} style={comparison?.bestNo === entry.no ? { outline: '2px solid var(--success)' } : undefined}>
              <div className="card-header">
                <div className="card-title" style={{ fontSize: 13 }}>
                  {t('ตัวเลือกที่')} {entry.no}
                  {comparison?.bestNo === entry.no && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>{t('คุ้มที่สุด')}</span>}
                  {entry.result?.check_no && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-light)', fontWeight: 400 }}>({entry.result.check_no})</span>}
                </div>
                {entry.result && <span className={`badge ${statusCls(entry.result.price_status)}`} style={{ fontSize: 11 }}>{entry.result.price_status}</span>}
              </div>
              <div className="card-body">
                {entry.error ? (
                  <div style={{ color: 'var(--danger)', fontSize: 12 }}>{entry.error}</div>
                ) : (
                  <>
                    <ResultRow label="Margin" value={fmtPct(entry.result.margin_percent)} strong />
                    <ResultRow label={t('ยอดขายรวม')} value={fmtCurrency(entry.result.net_sales)} strong />
                    <ResultRow label={t('ราคาที่เสนอ/ชิ้น')} value={`${fmtCurrency(entry.result.offer_price)} × ${entry.result.quantity}`} />
                    <ResultRow label={t('ค่าขนส่งที่ใช้คำนวณ')} value={shipLabel(entry.result)}
                      hint={entry.result.used_default_shipping ? `(${t('ค่ามาตรฐาน')})` : null} />
                    <ResultRow label="Shipping Buffer" value={fmtCurrency(entry.result.shipping_buffer)} hint={`(${fmtPct(entry.result.shipping_buffer_percent)})`} />
                    <ResultRow label="Provision Buffer" value={fmtCurrency(entry.result.provision_buffer)} hint={`(${fmtPct(entry.result.provision_buffer_percent)})`} />
                    {canSeeProfit && <ResultRow label={t('กำไรรวม')} value={fmtCurrency(entry.result.total_profit)} strong />}
                    <ResultRow label="Tier" value={entry.result.auto_tier} />
                    <ResultRow label="Floor Price" value={fmtCurrency(entry.result.floor_price)} />
                    <ResultRow label={t('ราคาแนะนำขั้นต่ำ/ชิ้น')}
                      value={entry.result.suggested_min_price ? fmtCurrency(entry.result.suggested_min_price) : t('คำนวณไม่ได้')} strong />
                    <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--gray-bg)', fontSize: 12, whiteSpace: 'pre-line' }}>
                      {entry.result.recommendation}
                    </div>
                    <button className="btn btn-outline btn-sm" style={{ marginTop: 10, width: '100%' }}
                      onClick={() => doSave(entry)} disabled={savingNo === entry.no}>
                      {savingNo === entry.no ? t('กำลังบันทึก...') : t('บันทึกประวัติ')}
                    </button>
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

      <div className="section-header" style={{ marginTop: 4 }}>
        <div className="section-title" style={{ fontSize: 15 }}>
          {t('ประวัติการเช็คราคา')} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({history.length} {t('รายการ')})</span>
        </div>
        <button className="btn btn-outline btn-sm" onClick={doExport} disabled={exporting || !history.length}>
          {exporting ? t('กำลังส่งออก...') : t('ส่งออกเป็น Excel')}
        </button>
      </div>

      <div className="filter-bar">
        <select className="filter-select" value={hStatus} onChange={e => setHStatus(e.target.value)}>
          <option value="">{t('ทุกสถานะ')}</option>
          {PRICE_STATUS_ORDER.map(s => <option key={s}>{s}</option>)}
        </select>
        <input className="filter-input" placeholder={lang === 'en' ? 'Search product / check no...' : 'ค้นหา สินค้า/เลขที่...'}
          value={hq} onChange={e => setHq(e.target.value)} style={{ minWidth: 240 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('ถึง')}</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>{t('ล้าง')}</button>}
        </div>
      </div>

      <div className="card list-card">
        <div className="table-wrap">
          {history.length ? (
            <table>
              <thead>
                <tr>
                  <th>{t('เลขที่')}</th><th>{t('วันที่')}</th><th>{t('สินค้า')}</th><th>{t('จำนวน')}</th>
                  <th>{t('ราคาที่เสนอ')}</th><th>{t('ยอดขายรวม')}</th>
                  {canSeeProfit && <th>{t('กำไรรวม')}</th>}
                  <th>Margin</th><th>{t('สถานะ')}</th><th>{t('ราคาแนะนำขั้นต่ำ')}</th><th>{t('หมายเหตุ')}</th><th>{t('ผู้เช็ค')}</th>
                  {adminOnlyDelete(perm) && <th></th>}
                </tr>
              </thead>
              <tbody>
                {history.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 12 }}>
                      {r.check_no}
                      {r.option_label && <div style={{ fontSize: 10, color: 'var(--text-light)', fontWeight: 400 }}>{r.option_label}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</td>
                    <td><div style={{ fontWeight: 500 }}>{r.product_code}</div><div style={{ fontSize: 11, color: 'var(--text-light)' }}>{r.product_name}</div></td>
                    <td>{r.quantity}</td>
                    <td>{fmtCurrency(r.offer_price)}</td>
                    <td style={{ fontWeight: 600 }}>{fmtCurrency(r.net_sales)}</td>
                    {canSeeProfit && <td style={{ fontWeight: 600 }}>{fmtCurrency(r.total_profit)}</td>}
                    <td style={{ fontWeight: 600 }}>{fmtPct(r.margin_percent)}</td>
                    <td><span className={`badge ${statusCls(r.price_status)}`}>{r.price_status}</span></td>
                    <td>{r.suggested_min_price ? fmtCurrency(r.suggested_min_price) : '-'}</td>
                    <td style={{ fontSize: 11, maxWidth: 220 }}>{r.note || '-'}</td>
                    <td style={{ fontSize: 11 }}>{r.created_by_name || '-'}</td>
                    {adminOnlyDelete(perm) && (
                      <td className="td-actions"><button className="btn btn-danger btn-xs" onClick={() => doDelete(r)}>{t('ลบ')}</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loadingHistory ? t('กำลังโหลด...') : t('ยังไม่มีประวัติการเช็คราคา')}</div></div>}
        </div>
      </div>
    </div>
  )
}
