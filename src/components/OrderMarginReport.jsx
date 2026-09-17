import { useEffect, useMemo, useState } from 'react'
import { fetchOrderMarginReport, setOrderCostFactor } from '../lib/api'
import { exportRowsToExcel } from '../lib/importExport'
import { fmtCurrency, fmtDate, currentMonthRange } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// สรุปกำไร/ส่วนลดจาก "ออเดอร์ที่เปิดจริง" ไม่ใช่จากหน้าเช็คราคา
// เพราะเช็คราคาเป็นแค่การลองคิด เช็คไปแล้วอาจไม่ได้ขาย หรือลูกค้ายกเลิก — เอามาสรุปให้หัวหน้าไม่ได้
// เห็นได้เฉพาะบัญชี/แอดมิน (บังคับที่ margin_order_report ฝั่งฐานข้อมูล)

const pct = (n) => (n === null || n === undefined || !isFinite(n) ? '-' : `${Number(n).toFixed(2)}%`)
const marginColor = (m) => (m >= 25 ? 'var(--success)' : m >= 15 ? 'var(--warning)' : 'var(--danger)')

// ตารางนี้เป็นตัวเลขล้วน เดิมชิดซ้ายทั้งหมดทำให้หลักไม่ตรงกัน เทียบด้วยตายาก
// และแถวแน่นจนอ่านข้ามบรรทัด จึงเพิ่มช่องไฟและจัดตัวเลขชิดขวาเฉพาะในหน้านี้
const CSS = `
.omr .kpi-grid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}
.omr .kpi-card{padding:12px 16px}
.omr .kpi-value{font-size:20px;white-space:nowrap}
.omr-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.omr-bar .omr-sep{width:1px;height:20px;background:var(--border)}
.omr table td{padding:10px 14px}
.omr table th{padding:9px 14px}
.omr table td.num,.omr table th.num{text-align:right;white-space:nowrap}
.omr table tbody tr:nth-child(even){background:#fcfcfe}
.omr table tbody tr:hover{background:#f4f7ff}
.omr-link{background:none;border:none;padding:0;font:inherit;color:var(--navy);font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--border)}
.omr-link:hover{text-decoration-color:var(--navy)}
.omr-warn{display:flex;gap:12px;align-items:center;justify-content:space-between;width:100%;text-align:left;
          font-size:12.5px;color:#c05621;background:#fffaf0;border:1px solid #f0c36d;border-radius:7px;
          padding:10px 13px;margin-bottom:12px;cursor:pointer;line-height:1.5}
.omr-warn:hover{background:#fff4e0}
.omr-warn-link{font-weight:600;white-space:nowrap}
.omr-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:12px}
.omr-sum > div{background:var(--gray-bg);border-radius:7px;padding:8px 11px}
.omr-sum .k{font-size:10.5px;color:var(--text-light);text-transform:uppercase}
.omr-sum .v{font-size:15px;font-weight:600;color:var(--navy);white-space:nowrap}
.omr-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px 16px;margin-bottom:12px;font-size:12.5px}
.omr-meta .k{color:var(--text-light);font-size:11px}
`

const VIEWS = [
  { key: 'order', label: 'รายออเดอร์' },
  { key: 'product', label: 'รายสินค้า' },
  { key: 'sales', label: 'รายเซลล์' },
]

// รวมยอดจากบรรทัดสินค้า — คืน map ของ key -> ตัวเลขรวม
function groupLines(lines, keyOf, labelOf) {
  const out = new Map()
  lines.forEach(l => {
    const k = keyOf(l)
    if (!out.has(k)) out.set(k, { key: k, ...labelOf(l), sales: 0, cost: 0, normal: 0, qty: 0, lineCount: 0, noCostLines: 0, orders: new Set() })
    const g = out.get(k)
    g.sales += Number(l.line_sales) || 0
    g.cost += Number(l.line_cost) || 0
    g.normal += Number(l.line_normal) || 0
    g.qty += Number(l.quantity) || 0
    g.lineCount += 1
    // บรรทัดที่ไม่มีต้นทุน = ไม่มีแถวใน order_item_costs ซึ่งเป็นเหตุผลเดียวกับที่ปรับสัดส่วนต้นทุนไม่ได้
    if (!(Number(l.line_cost) > 0)) g.noCostLines += 1
    g.orders.add(l.order_id)
  })
  return [...out.values()].map(g => ({
    ...g,
    orderCount: g.orders.size,
    profit: g.sales - g.cost,
    margin: g.sales > 0 ? (g.sales - g.cost) / g.sales * 100 : 0,
    // ส่วนลดเทียบราคาขายปกติ — คิดเฉพาะบรรทัดที่มีราคาขายปกติบันทึกไว้ ไม่งั้นตัวเลขจะเพี้ยน
    discount: g.normal > 0 ? (1 - g.sales / g.normal) * 100 : null,
  })).sort((a, b) => b.sales - a.sales)
}

// ป๊อปอัปอ่านอย่างเดียว — ใช้ทั้งดูรายการในออเดอร์ และดูบรรทัดที่ไม่มีต้นทุน
function Popup({ title, sub, wide, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: wide ? 900 : 720 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{title}</div>
            {sub && <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2 }}>{sub}</div>}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export default function OrderMarginReport() {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('order')
  const [includeCancelled, setIncludeCancelled] = useState(false)
  const [fromDate, setFromDate] = useState(() => currentMonthRange().first)
  const [toDate, setToDate] = useState(() => currentMonthRange().last)
  const [exporting, setExporting] = useState(false)
  const [detailOrderId, setDetailOrderId] = useState(null)   // ออเดอร์ที่กดดูรายการสินค้า
  const [showMissing, setShowMissing] = useState(false)      // รายการบรรทัดที่ไม่มีต้นทุน

  useEffect(() => {
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      fetchOrderMarginReport({ dateFrom: fromDate, dateTo: toDate })
        .then(r => { if (alive) setLines(r) })
        .catch(e => { if (alive) toast('โหลดรายงานไม่สำเร็จ: ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [fromDate, toDate, toast])

  const active = useMemo(
    () => (includeCancelled ? lines : lines.filter(l => l.order_status !== 'Cancelled')),
    [lines, includeCancelled]
  )

  const totals = useMemo(() => {
    const sales = active.reduce((s, l) => s + (Number(l.line_sales) || 0), 0)
    const cost = active.reduce((s, l) => s + (Number(l.line_cost) || 0), 0)
    const normal = active.reduce((s, l) => s + (Number(l.line_normal) || 0), 0)
    const orders = new Set(active.map(l => l.order_id)).size
    // บรรทัดที่ยังไม่มีต้นทุนบันทึกไว้ ทำให้กำไรดูสูงเกินจริง ต้องบอกให้เห็น ไม่ใช่ซ่อน
    const missingCost = active.filter(l => !(Number(l.line_cost) > 0)).length
    return {
      sales, cost, normal, orders, missingCost,
      profit: sales - cost,
      margin: sales > 0 ? (sales - cost) / sales * 100 : 0,
      discount: normal > 0 ? (1 - sales / normal) * 100 : null,
    }
  }, [active])

  const rows = useMemo(() => {
    if (view === 'order') {
      return groupLines(active, l => l.order_id, l => ({
        order_no: l.order_no, order_date: l.order_date, customer_name: l.customer_name,
        sales_name: l.sales_name, order_status: l.order_status,
        order_type: l.order_type, cost_factor: Number(l.cost_factor) || 100
      }))
    }
    if (view === 'product') {
      return groupLines(active, l => l.product_id || l.product_name, l => ({
        product_code: l.product_code, product_name: l.product_name
      }))
    }
    return groupLines(active, l => l.sales_name || '-', l => ({ sales_name: l.sales_name || '-' }))
  }, [active, view])

  // กดเลขออเดอร์แล้วเห็นเลยว่าสั่งอะไรไป ไม่ต้องจดเลขไปค้นต่อในหน้าออเดอร์
  // ใช้ข้อมูลที่โหลดมาแล้วในรายงาน ไม่ต้องยิงขอใหม่ เพราะ margin_order_report คืนมาทีละบรรทัดสินค้าอยู่แล้ว
  const detail = useMemo(() => {
    if (!detailOrderId) return null
    const ls = active.filter(l => l.order_id === detailOrderId)
    if (!ls.length) return null
    const sales = ls.reduce((a, l) => a + (Number(l.line_sales) || 0), 0)
    const cost = ls.reduce((a, l) => a + (Number(l.line_cost) || 0), 0)
    return { head: ls[0], lines: ls, sales, cost, profit: sales - cost, margin: sales > 0 ? (sales - cost) / sales * 100 : 0 }
  }, [detailOrderId, active])

  const missingLines = useMemo(() => active.filter(l => !(Number(l.line_cost) > 0)), [active])

  // ปรับสัดส่วนต้นทุนของออเดอร์นั้น เช่น Grade B ล็อตที่สภาพแย่กว่าปกติ อยากคิดต้นทุน 70% แทน 80%
  const adjustFactor = async (row) => {
    const input = window.prompt(
      `ออเดอร์ ${row.order_no}: คิดต้นทุนกี่ % ของต้นทุนเต็ม?\n100 = ต้นทุนเต็ม, 80 = ลบ 20%`,
      String(row.cost_factor ?? 100)
    )
    if (input === null) return
    const pct2 = Number(input)
    if (!(pct2 > 0 && pct2 <= 200)) { toast('กรุณากรอกตัวเลขระหว่าง 1-200', 'error'); return }
    try {
      await setOrderCostFactor(row.key, pct2)
      toast('ปรับสัดส่วนต้นทุนแล้ว', 'success')
      setLines(await fetchOrderMarginReport({ dateFrom: fromDate, dateTo: toDate }))
    } catch (e) { toast('ปรับไม่สำเร็จ: ' + e.message, 'error') }
  }

  const doExport = async () => {
    setExporting(true)
    try {
      const cols = [
        { key: 'name', label: view === 'order' ? 'เลขออเดอร์' : view === 'product' ? 'สินค้า' : 'เซลล์' },
        { key: 'sub', label: view === 'order' ? 'ลูกค้า' : 'รายละเอียด' },
        { key: 'orderCount', label: 'จำนวนออเดอร์' },
        { key: 'qty', label: 'จำนวนชิ้น' },
        { key: 'sales', label: 'ยอดขาย' },
        { key: 'cost', label: 'ต้นทุน' },
        { key: 'profit', label: 'กำไรขั้นต้น' },
        { key: 'margin', label: 'Margin (%)' },
        { key: 'discount', label: 'ส่วนลดจากราคาปกติ (%)' },
      ]
      await exportRowsToExcel(cols, rows.map(r => ({
        name: r.order_no || r.product_code || r.sales_name || '-',
        sub: r.customer_name || r.product_name || '',
        orderCount: r.orderCount, qty: r.qty,
        sales: Math.round(r.sales * 100) / 100,
        cost: Math.round(r.cost * 100) / 100,
        profit: Math.round(r.profit * 100) / 100,
        margin: Math.round(r.margin * 100) / 100,
        discount: r.discount === null ? '' : Math.round(r.discount * 100) / 100,
      })), `สรุปกำไรออเดอร์_${view}.xlsx`)
    } catch (e) { toast('ส่งออกไม่สำเร็จ: ' + e.message, 'error') }
    finally { setExporting(false) }
  }

  return (
    <div className="card omr" style={{ marginBottom: 14 }}>
      <style>{CSS}</style>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="card-title">{t('สรุปกำไร/ส่วนลดจากออเดอร์จริง')}</div>
        <div className="omr-bar">
          {VIEWS.map(v => (
            <button key={v.key} className={`btn btn-xs ${view === v.key ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setView(v.key)}>{t(v.label)}</button>
          ))}
          <span className="omr-sep" />
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('ถึง')}</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          {(fromDate || toDate) && <button className="btn btn-outline btn-xs" onClick={() => { setFromDate(''); setToDate('') }}>{t('ล้าง')}</button>}
          <span className="omr-sep" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <input type="checkbox" checked={includeCancelled} onChange={e => setIncludeCancelled(e.target.checked)} />
            {t('รวมออเดอร์ที่ยกเลิก')}
          </label>
          <button className="btn btn-outline btn-xs" onClick={doExport} disabled={exporting || !rows.length}>
            {exporting ? t('กำลังส่งออก...') : t('ส่งออกเป็น Excel')}
          </button>
        </div>
      </div>
      <div className="card-body">
        <div className="kpi-grid" style={{ marginBottom: 12 }}>
          <div className="kpi-card navy">
            <div className="kpi-label">{t('ยอดขายรวม')}</div>
            <div className="kpi-value">{fmtCurrency(totals.sales)}</div>
            <div className="kpi-sub">{totals.orders} {t('ออเดอร์', 'orders')}</div>
          </div>
          <div className="kpi-card green">
            <div className="kpi-label">{t('กำไรขั้นต้น')}</div>
            <div className="kpi-value">{fmtCurrency(totals.profit)}</div>
            <div className="kpi-sub">{t('ยังไม่หักค่าขนส่ง/Buffer')}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Margin</div>
            <div className="kpi-value" style={{ color: marginColor(totals.margin) }}>{pct(totals.margin)}</div>
          </div>
          <div className="kpi-card red">
            <div className="kpi-label">{t('ส่วนลดเฉลี่ยจากราคาปกติ')}</div>
            <div className="kpi-value">{totals.discount === null ? '-' : pct(totals.discount)}</div>
          </div>
        </div>

        {totals.missingCost > 0 && (
          <button type="button" className="omr-warn" onClick={() => setShowMissing(true)}>
            <span>
              {t('มี')} <b>{totals.missingCost}</b> {t('บรรทัดที่ไม่มีต้นทุนบันทึกไว้ (สินค้าที่ยังไม่ได้กรอกต้นทุน หรือรายการที่พิมพ์ชื่อเอง) — กำไรที่แสดงจะสูงกว่าความจริง')}
            </span>
            <span className="omr-warn-link">{t('ดูว่าคืออะไรบ้าง')} →</span>
          </button>
        )}

        <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>{view === 'order' ? t('เลขออเดอร์') : view === 'product' ? t('สินค้า') : t('เซลล์')}</th>
                  {view === 'order' && <th>{t('ลูกค้า')}</th>}
                  {view === 'order' && <th>{t('วันที่')}</th>}
                  {view === 'order' && <th>{t('ต้นทุนที่คิด')}</th>}
                  {view !== 'order' && <th className="num">{t('ออเดอร์', 'Order')}</th>}
                  <th className="num">{t('จำนวน')}</th>
                  <th className="num">{t('ยอดขาย')}</th>
                  <th className="num">{t('ต้นทุน')}</th>
                  <th className="num">{t('กำไรขั้นต้น')}</th>
                  <th className="num">Margin</th>
                  <th className="num">{t('ส่วนลด')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                      {view === 'order'
                        ? <button type="button" className="omr-link" onClick={() => setDetailOrderId(r.key)}>{r.order_no}</button>
                        : (r.product_code || r.sales_name)}
                      {r.order_status === 'Cancelled' && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>{t('ยกเลิกแล้ว')}</span>}
                      {view === 'product' && <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>{r.product_name}</div>}
                    </td>
                    {view === 'order' && <td style={{ fontSize: 12 }}>{r.customer_name || '-'}<div style={{ fontSize: 11, color: 'var(--text-light)' }}>{r.sales_name || ''}</div></td>}
                    {view === 'order' && <td style={{ fontSize: 12 }}>{fmtDate(r.order_date)}</td>}
                    {view === 'order' && (
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: r.cost_factor === 100 ? 'var(--text-light)' : '#c05621' }}>{r.cost_factor}%</span>
                        {r.order_type === 'Grade B' && <span className="badge badge-orange" style={{ marginLeft: 4, fontSize: 10 }}>GB</span>}
                        {/* ไม่มีต้นทุนสักบรรทัด = ไม่มีอะไรให้คูณ % ปรับไปก็ไม่เกิดอะไร บอกไว้ตรงนี้ก่อนจะกด */}
                        {r.noCostLines === r.lineCount
                          ? <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>{t('ไม่มีต้นทุน')}</span>
                          : <button className="btn btn-outline btn-xs" style={{ marginLeft: 6 }} onClick={() => adjustFactor(r)}>{t('ปรับ')}</button>}
                      </td>
                    )}
                    {view !== 'order' && <td className="num">{r.orderCount}</td>}
                    <td className="num">{r.qty}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtCurrency(r.sales)}</td>
                    <td className="num">{fmtCurrency(r.cost)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{fmtCurrency(r.profit)}</td>
                    <td className="num" style={{ fontWeight: 700, color: marginColor(r.margin) }}>{pct(r.margin)}</td>
                    <td className="num">{r.discount === null ? '-' : pct(r.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? t('กำลังโหลด...') : t('ไม่มีออเดอร์ในช่วงที่เลือก')}</div></div>}
        </div>

        {detail && (
          <Popup wide title={detail.head.order_no}
            sub={`${detail.head.customer_name || '-'} · ${fmtDate(detail.head.order_date)}${detail.head.sales_name ? ' · ' + detail.head.sales_name : ''}`}
            onClose={() => setDetailOrderId(null)}>
            <div className="omr-sum">
              <div><div className="k">{t('ยอดขาย')}</div><div className="v">{fmtCurrency(detail.sales)}</div></div>
              <div><div className="k">{t('ต้นทุน')}</div><div className="v">{fmtCurrency(detail.cost)}</div></div>
              <div><div className="k">{t('กำไรขั้นต้น')}</div><div className="v">{fmtCurrency(detail.profit)}</div></div>
              <div><div className="k">Margin</div><div className="v" style={{ color: marginColor(detail.margin) }}>{pct(detail.margin)}</div></div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('สินค้า')}</th>
                    <th className="num">{t('จำนวน')}</th>
                    <th className="num">{t('ราคาต่อหน่วย')}</th>
                    <th className="num">{t('ยอดขาย')}</th>
                    <th className="num">{t('ต้นทุน')}</th>
                    <th className="num">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map((l, i) => {
                    const ls = Number(l.line_sales) || 0
                    const lc = Number(l.line_cost) || 0
                    const m = ls > 0 ? (ls - lc) / ls * 100 : 0
                    return (
                      <tr key={i} style={{ cursor: 'default' }}>
                        <td>
                          {l.product_name || '-'}
                          {l.product_code && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{l.product_code}</div>}
                        </td>
                        <td className="num">{l.quantity}</td>
                        <td className="num">{fmtCurrency(l.unit_price)}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{fmtCurrency(ls)}</td>
                        <td className="num">
                          {lc > 0 ? fmtCurrency(lc)
                            : <span className="badge badge-gray" style={{ fontSize: 10 }}>{t('ไม่มีต้นทุน')}</span>}
                        </td>
                        <td className="num" style={{ fontWeight: 600, color: lc > 0 ? marginColor(m) : 'var(--text-light)' }}>
                          {lc > 0 ? pct(m) : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Popup>
        )}

        {showMissing && (
          <Popup wide title={t('บรรทัดที่ไม่มีต้นทุนบันทึกไว้')}
            sub={`${missingLines.length} ${t('บรรทัด')} · ${t('กำไรของออเดอร์เหล่านี้จะแสดงสูงกว่าความจริง')}`}
            onClose={() => setShowMissing(false)}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('เลขออเดอร์')}</th>
                    <th>{t('สินค้า')}</th>
                    <th className="num">{t('จำนวน')}</th>
                    <th className="num">{t('ยอดขาย')}</th>
                  </tr>
                </thead>
                <tbody>
                  {missingLines.map((l, i) => (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td>
                        {/* กดแล้วข้ามไปดูรายละเอียดออเดอร์นั้นต่อได้เลย ไม่ต้องปิดแล้วไปหาเอง */}
                        <button type="button" className="omr-link"
                          onClick={() => { setShowMissing(false); setDetailOrderId(l.order_id) }}>{l.order_no}</button>
                        <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{fmtDate(l.order_date)}</div>
                      </td>
                      <td>
                        {l.product_name || '-'}
                        <div style={{ fontSize: 11, color: 'var(--text-light)' }}>
                          {l.product_code || t('พิมพ์ชื่อเอง ไม่ได้ผูกกับสินค้าในระบบ')}
                        </div>
                      </td>
                      <td className="num">{l.quantity}</td>
                      <td className="num">{fmtCurrency(l.line_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-light)', marginTop: 10, lineHeight: 1.6 }}>
              {t('รายการที่มีรหัสสินค้า แก้ได้โดยกรอกต้นทุนในหน้า "ต้นทุนสินค้า" แล้วเปิดออเดอร์ใหม่ — ออเดอร์ที่เปิดไปแล้วเก็บต้นทุน ณ วันที่เปิดไว้ จึงไม่ย้อนกลับมาเอง')}
            </div>
          </Popup>
        )}

        <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8, lineHeight: 1.6 }}>
          <div>{t('ต้นทุนที่ใช้คือต้นทุน ณ วันที่เปิดออเดอร์ ไม่ใช่ต้นทุนวันนี้ — ออเดอร์เก่าจึงยังสะท้อนราคาทุนตอนนั้น')}</div>
          <div>{t('กำไรขั้นต้น = ยอดขาย − ต้นทุนสินค้า ยังไม่ได้หักค่าขนส่งจริงและ Buffer ตัวเลขจึงสูงกว่า Margin ในหน้าเช็คราคาเล็กน้อย')}</div>
          <div>{t('ส่วนลดเทียบกับราคาขายปกติ ณ วันที่เปิดออเดอร์ นับเฉพาะรายการที่มีราคาขายปกติบันทึกไว้')}</div>
          <div>{t('"ต้นทุนที่คิด" คือคิดต้นทุนกี่ % ของราคาเต็ม — ออเดอร์ Grade B ใช้ค่ากลางจากหน้าต้นทุนสินค้า ปรับรายออเดอร์ได้ที่ปุ่ม "ปรับ"')}</div>
        </div>
      </div>
    </div>
  )
}
