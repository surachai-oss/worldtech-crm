import { useEffect, useMemo, useState } from 'react'
import { fetchOrderMarginReport } from '../lib/api'
import { exportRowsToExcel } from '../lib/importExport'
import { fmtCurrency, fmtDate, currentMonthRange } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// สรุปกำไร/ส่วนลดจาก "ออเดอร์ที่เปิดจริง" ไม่ใช่จากหน้าเช็คราคา
// เพราะเช็คราคาเป็นแค่การลองคิด เช็คไปแล้วอาจไม่ได้ขาย หรือลูกค้ายกเลิก — เอามาสรุปให้หัวหน้าไม่ได้
// เห็นได้เฉพาะบัญชี/แอดมิน (บังคับที่ margin_order_report ฝั่งฐานข้อมูล)

const pct = (n) => (n === null || n === undefined || !isFinite(n) ? '-' : `${Number(n).toFixed(2)}%`)
const marginColor = (m) => (m >= 25 ? 'var(--success)' : m >= 15 ? 'var(--warning)' : 'var(--danger)')

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
    if (!out.has(k)) out.set(k, { key: k, ...labelOf(l), sales: 0, cost: 0, normal: 0, qty: 0, orders: new Set() })
    const g = out.get(k)
    g.sales += Number(l.line_sales) || 0
    g.cost += Number(l.line_cost) || 0
    g.normal += Number(l.line_normal) || 0
    g.qty += Number(l.quantity) || 0
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
        sales_name: l.sales_name, order_status: l.order_status
      }))
    }
    if (view === 'product') {
      return groupLines(active, l => l.product_id || l.product_name, l => ({
        product_code: l.product_code, product_name: l.product_name
      }))
    }
    return groupLines(active, l => l.sales_name || '-', l => ({ sales_name: l.sales_name || '-' }))
  }, [active, view])

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
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <div className="card-title">{t('สรุปกำไร/ส่วนลดจากออเดอร์จริง')}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {VIEWS.map(v => (
            <button key={v.key} className={`btn btn-xs ${view === v.key ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setView(v.key)}>{t(v.label)}</button>
          ))}
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('ถึง')}</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          {(fromDate || toDate) && <button className="btn btn-outline btn-xs" onClick={() => { setFromDate(''); setToDate('') }}>{t('ล้าง')}</button>}
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
            <div className="kpi-sub">{totals.orders} {t('ออเดอร์')}</div>
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
          <div style={{ fontSize: 12, color: '#c05621', background: '#fffaf0', padding: '8px 10px', borderRadius: 6, marginBottom: 10 }}>
            {t('มี')} {totals.missingCost} {t('บรรทัดที่ไม่มีต้นทุนบันทึกไว้ (สินค้าที่ยังไม่ได้กรอกต้นทุน หรือรายการที่พิมพ์ชื่อเอง) — กำไรที่แสดงจะสูงกว่าความจริง')}
          </div>
        )}

        <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>{view === 'order' ? t('เลขออเดอร์') : view === 'product' ? t('สินค้า') : t('เซลล์')}</th>
                  {view === 'order' && <th>{t('ลูกค้า')}</th>}
                  {view === 'order' && <th>{t('วันที่')}</th>}
                  {view !== 'order' && <th>{t('ออเดอร์')}</th>}
                  <th>{t('จำนวน')}</th>
                  <th>{t('ยอดขาย')}</th>
                  <th>{t('ต้นทุน')}</th>
                  <th>{t('กำไรขั้นต้น')}</th>
                  <th>Margin</th>
                  <th>{t('ส่วนลด')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                      {r.order_no || r.product_code || r.sales_name}
                      {r.order_status === 'Cancelled' && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>{t('ยกเลิกแล้ว')}</span>}
                      {view === 'product' && <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>{r.product_name}</div>}
                    </td>
                    {view === 'order' && <td style={{ fontSize: 12 }}>{r.customer_name || '-'}<div style={{ fontSize: 11, color: 'var(--text-light)' }}>{r.sales_name || ''}</div></td>}
                    {view === 'order' && <td style={{ fontSize: 12 }}>{fmtDate(r.order_date)}</td>}
                    {view !== 'order' && <td>{r.orderCount}</td>}
                    <td>{r.qty}</td>
                    <td style={{ fontWeight: 600 }}>{fmtCurrency(r.sales)}</td>
                    <td>{fmtCurrency(r.cost)}</td>
                    <td style={{ fontWeight: 600 }}>{fmtCurrency(r.profit)}</td>
                    <td style={{ fontWeight: 700, color: marginColor(r.margin) }}>{pct(r.margin)}</td>
                    <td>{r.discount === null ? '-' : pct(r.discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? t('กำลังโหลด...') : t('ไม่มีออเดอร์ในช่วงที่เลือก')}</div></div>}
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8, lineHeight: 1.6 }}>
          <div>{t('ต้นทุนที่ใช้คือต้นทุน ณ วันที่เปิดออเดอร์ ไม่ใช่ต้นทุนวันนี้ — ออเดอร์เก่าจึงยังสะท้อนราคาทุนตอนนั้น')}</div>
          <div>{t('กำไรขั้นต้น = ยอดขาย − ต้นทุนสินค้า ยังไม่ได้หักค่าขนส่งจริงและ Buffer ตัวเลขจึงสูงกว่า Margin ในหน้าเช็คราคาเล็กน้อย')}</div>
          <div>{t('ส่วนลดเทียบกับราคาขายปกติ ณ วันที่เปิดออเดอร์ นับเฉพาะรายการที่มีราคาขายปกติบันทึกไว้')}</div>
        </div>
      </div>
    </div>
  )
}
