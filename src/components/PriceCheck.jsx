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

// ข้อความสรุปให้เซลล์คัดลอกไปคุยหัวหน้านอกระบบ — ห้ามมีต้นทุนอยู่ในนี้
function buildSummaryText(r) {
  const lines = [
    'ขอปรึกษาราคา B2B',
    '',
    `สินค้า: ${r.product_code} - ${r.product_name}`,
    `จำนวน: ${r.quantity} เครื่อง`,
    `ราคาที่จะเสนอ: ${fmtCurrency(r.offer_price)} บาท`,
    `ค่าขนส่งจริง: ${fmtCurrency(r.shipping_cost)} บาท${r.used_default_shipping ? ' (ใช้ค่ามาตรฐาน)' : ''}`,
    `ยอดขายรวม: ${fmtCurrency(r.net_sales)} บาท`,
    `Shipping Buffer: ${fmtCurrency(r.shipping_buffer)} บาท`,
    `Provision Buffer: ${fmtCurrency(r.provision_buffer)} บาท`,
    `Margin คงเหลือ: ${fmtPct(r.margin_percent)}`,
    `Tier ระบบ: ${r.auto_tier}`,
    `สถานะ: ${r.price_status}`,
    `ราคาแนะนำขั้นต่ำ: ${r.suggested_min_price ? `${fmtCurrency(r.suggested_min_price)} บาท` : 'คำนวณไม่ได้'}`,
    `Floor Price: ${fmtCurrency(r.floor_price)} บาท`,
    '',
    'คำแนะนำระบบ:',
    r.recommendation || '',
    '',
    'หมายเหตุ: ระบบไม่ได้แสดงต้นทุนสินค้าใน Summary นี้'
  ]
  return lines.join('\n')
}

function ResultRow({ label, value, strong, hint }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '5px 0', borderBottom: '1px dashed var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{label}{hint && <span style={{ marginLeft: 6, fontSize: 11 }}>{hint}</span>}</span>
      <span style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 700 : 500, color: 'var(--navy)' }}>{value}</span>
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
  const [quantity, setQuantity] = useState('1')
  const [offerPrice, setOfferPrice] = useState('')
  const [shippingCost, setShippingCost] = useState('')
  const [calculating, setCalculating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

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

  const buildArgs = () => ({
    productId,
    quantity: Number(quantity),
    offerPrice: Number(offerPrice),
    shippingCost: shippingCost.trim() === '' ? null : Number(shippingCost)
  })

  const validate = () => {
    if (!productId) { toast('กรุณาเลือกสินค้า', 'error'); return false }
    if (!(Number(quantity) > 0)) { toast('จำนวนต้องมากกว่า 0', 'error'); return false }
    if (!(Number(offerPrice) > 0)) { toast('ราคาที่จะเสนอต้องมากกว่า 0', 'error'); return false }
    if (shippingCost.trim() !== '' && Number(shippingCost) < 0) { toast('ค่าขนส่งต้องไม่ติดลบ', 'error'); return false }
    return true
  }

  const doCheck = async () => {
    if (!validate()) return
    setCalculating(true)
    try {
      setResult(await checkPrice(buildArgs()))
    } catch (e) {
      setResult(null)
      toast(e.message, 'error')
    } finally { setCalculating(false) }
  }

  const doSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const saved = await savePriceCheck(buildArgs())
      setResult(saved)
      toast('บันทึกประวัติแล้ว (' + saved.check_no + ')', 'success')
      loadHistory()
    } catch (e) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const doCopy = async () => {
    if (!result) return
    const text = buildSummaryText(result)
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

  const reset = () => { setProductId(''); setQuantity('1'); setOfferPrice(''); setShippingCost(''); setResult(null) }

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">{t('เช็คราคา')}</div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-header">
          <div className="card-title">{t('คำนวณราคาก่อนเสนอลูกค้า')}</div>
          <span style={{ fontSize: 11, color: 'var(--text-light)' }}>
            {t('กรอกแค่ 4 ช่อง ระบบคำนวณ Margin สถานะ และราคาแนะนำขั้นต่ำให้เอง')}
          </span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required">{t('สินค้า')}</label>
              <SearchableSelect
                options={selectable}
                value={productId}
                onChange={(v) => { setProductId(v); setResult(null) }}
                getOptionValue={(o) => o.product_id}
                getOptionLabel={(o) => `${o.code} - ${o.name}`}
                placeholder={loadingProducts ? t('กำลังโหลด...') : t('-- เลือกสินค้า --')}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required">{t('จำนวน')}</label>
              <input className="form-control" type="number" min="1" value={quantity}
                onChange={e => { setQuantity(e.target.value); setResult(null) }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required">{t('ราคาที่จะเสนอ/ชิ้น')}</label>
              <input className="form-control" type="number" min="0" step="0.01" value={offerPrice}
                onChange={e => { setOfferPrice(e.target.value); setResult(null) }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('ค่าขนส่งจริง (ทั้งดีล)')}</label>
              <input className="form-control" type="number" min="0" step="0.01" value={shippingCost}
                placeholder={t('เว้นว่าง = ใช้ค่ามาตรฐาน')}
                onChange={e => { setShippingCost(e.target.value); setResult(null) }} />
            </div>
          </div>

          {selected && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-light)' }}>
              {t('ราคาขายปกติ')}: <b>{selected.normal_selling_price ? fmtCurrency(selected.normal_selling_price) : '-'}</b>
              {'  ·  '}Floor Price: <b>{fmtCurrency(selected.floor_price)}</b>
              {'  ·  '}{t('Margin เป้าหมาย')}: <b>{fmtPct(selected.target_margin_percent)}</b>
              {'  ·  '}{t('Margin ขั้นต่ำ')}: <b>{fmtPct(selected.minimum_margin_percent)}</b>
              {selected.finance_remark && <div style={{ marginTop: 4 }}>{t('หมายเหตุจากบัญชี')}: {selected.finance_remark}</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={doCheck} disabled={calculating || saving}>
              {calculating ? t('กำลังคำนวณ...') : t('คำนวณ')}
            </button>
            <button className="btn btn-secondary" onClick={doSave} disabled={calculating || saving}>
              {saving ? t('กำลังบันทึก...') : t('คำนวณและบันทึกประวัติ')}
            </button>
            <button className="btn btn-outline" onClick={reset} disabled={calculating || saving}>{t('ล้างฟอร์ม')}</button>
            {missingCost > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-light)', alignSelf: 'center' }}>
                {t('สินค้าที่บัญชียังไม่ได้กรอกต้นทุน')}: {missingCost} {t('รายการ')}
              </span>
            )}
          </div>
        </div>
      </div>

      {result && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-header">
            <div className="card-title">
              {result.product_code} - {result.product_name}
              {result.check_no && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>({result.check_no})</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className={`badge ${statusCls(result.price_status)}`} style={{ fontSize: 12 }}>{result.price_status}</span>
              <button className="btn btn-outline btn-sm" onClick={doCopy}>{t('คัดลอกสรุปไปคุยหัวหน้า')}</button>
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <ResultRow label={t('ยอดขายรวม')} value={fmtCurrency(result.net_sales)} strong />
                <ResultRow label="Shipping Buffer" value={fmtCurrency(result.shipping_buffer)} hint={`(${fmtPct(result.shipping_buffer_percent)})`} />
                <ResultRow label="Provision Buffer" value={fmtCurrency(result.provision_buffer)} hint={`(${fmtPct(result.provision_buffer_percent)})`} />
                <ResultRow label={t('ค่าขนส่งที่ใช้คำนวณ')} value={fmtCurrency(result.shipping_cost)}
                  hint={result.used_default_shipping ? `(${t('ค่ามาตรฐาน')})` : null} />
                {canSeeProfit && <ResultRow label={t('กำไรรวม')} value={fmtCurrency(result.total_profit)} strong />}
              </div>
              <div>
                <ResultRow label="Margin" value={fmtPct(result.margin_percent)} strong />
                <ResultRow label="Tier" value={result.auto_tier} />
                <ResultRow label={t('Margin เป้าหมาย / ขั้นต่ำ')} value={`${fmtPct(result.target_margin_percent)} / ${fmtPct(result.minimum_margin_percent)}`} />
                <ResultRow label="Floor Price" value={fmtCurrency(result.floor_price)} />
                <ResultRow label={t('ราคาแนะนำขั้นต่ำ/ชิ้น')}
                  value={result.suggested_min_price ? fmtCurrency(result.suggested_min_price) : t('คำนวณไม่ได้')} strong />
              </div>
            </div>
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--gray-bg)', fontSize: 13, whiteSpace: 'pre-line' }}>
              {result.recommendation}
            </div>
            {(result.price_status === PRICE_STATUS_UNDER || result.price_status === PRICE_STATUS_NO_SELL) && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                {t('ระบบไม่มีขั้นตอนขออนุมัติ — ให้คัดลอกสรุปไปคุยกับหัวหน้าก่อนเสนอราคานี้ให้ลูกค้า')}
              </div>
            )}
          </div>
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
                  <th>Margin</th><th>{t('สถานะ')}</th><th>{t('ราคาแนะนำขั้นต่ำ')}</th><th>{t('ผู้เช็ค')}</th>
                  {adminOnlyDelete(perm) && <th></th>}
                </tr>
              </thead>
              <tbody>
                {history.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)', fontSize: 12 }}>{r.check_no}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</td>
                    <td><div style={{ fontWeight: 500 }}>{r.product_code}</div><div style={{ fontSize: 11, color: 'var(--text-light)' }}>{r.product_name}</div></td>
                    <td>{r.quantity}</td>
                    <td>{fmtCurrency(r.offer_price)}</td>
                    <td style={{ fontWeight: 600 }}>{fmtCurrency(r.net_sales)}</td>
                    {canSeeProfit && <td style={{ fontWeight: 600 }}>{fmtCurrency(r.total_profit)}</td>}
                    <td style={{ fontWeight: 600 }}>{fmtPct(r.margin_percent)}</td>
                    <td><span className={`badge ${statusCls(r.price_status)}`}>{r.price_status}</span></td>
                    <td>{r.suggested_min_price ? fmtCurrency(r.suggested_min_price) : '-'}</td>
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
