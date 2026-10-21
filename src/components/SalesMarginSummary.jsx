import { useEffect, useMemo, useState } from 'react'
import { fetchMyOrderMarginReport } from '../lib/api'
import { fmtCurrency, fmtDate, currentMonthRange } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// สรุปกำไร/ส่วนลดฉบับเซลล์ — เห็นเฉพาะออเดอร์ที่ตัวเองเปิด
//
// แยกเป็นคนละคอมโพเนนต์กับ OrderMarginReport ของผู้จัดการโดยตั้งใจ ไม่ใช่ใส่ if ซ่อนคอลัมน์ในตัวเดิม
// เพราะถ้าใช้ตัวเดียวกัน วันหนึ่งมีคนเพิ่มคอลัมน์ต้นทุนเข้าไปแล้วลืมเงื่อนไข ข้อมูลจะหลุดเงียบๆ
// ตัวนี้ไม่มีทางแสดงต้นทุนได้เลย เพราะฐานข้อมูลไม่ได้ส่งมาให้ตั้งแต่แรก (ดู margin_order_report_mine)
//
// Margin ที่แสดงคำนวณกลับเป็นต้นทุนรวมของออเดอร์ได้ (ต้นทุน = ยอดขาย × (1 − margin)) — ตกลงกันแล้วว่ารับได้
// แต่ต้นทุน "รายบรรทัดสินค้า" ไม่ได้ออกจากฐานข้อมูลเลย ซึ่งเป็นตัวเลขที่ละเอียดกว่ามาก

const pct = (n) => (n === null || n === undefined || !isFinite(n) ? '-' : `${Number(n).toFixed(2)}%`)
const marginColor = (m) => (m >= 25 ? 'var(--success)' : m >= 15 ? 'var(--warning)' : 'var(--danger)')

const CSS = `
.sms table td{padding:10px 14px}
.sms table td.num{text-align:right;white-space:nowrap}
.sms table th.num{white-space:nowrap}
.sms table tbody tr:nth-child(even){background:#fcfcfe}
.sms table tbody tr{cursor:default}
.sms .kpi-grid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}
.sms .kpi-card{padding:12px 16px}
.sms .kpi-value{font-size:20px;white-space:nowrap}
.sms-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.sms-sep{width:1px;height:20px;background:var(--border)}
`

export default function SalesMarginSummary() {
  const { toast } = useUi()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [notReady, setNotReady] = useState(false)
  const [includeCancelled, setIncludeCancelled] = useState(false)
  const [fromDate, setFromDate] = useState(() => currentMonthRange().first)
  const [toDate, setToDate] = useState(() => currentMonthRange().last)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      fetchMyOrderMarginReport({ dateFrom: fromDate, dateTo: toDate })
        .then(r => { if (!alive) return; setRows(r.rows); setNotReady(r.notReady) })
        .catch(e => { if (alive) toast(t('โหลดรายงานไม่สำเร็จ') + ': ' + e.message, 'error') })
        .finally(() => { if (alive) setLoading(false) })
    }, 250)
    return () => { alive = false; clearTimeout(timer) }
  }, [fromDate, toDate, toast, t])

  const active = useMemo(
    () => (includeCancelled ? rows : rows.filter(r => r.order_status !== 'Cancelled')),
    [rows, includeCancelled]
  )

  const totals = useMemo(() => {
    const sales = active.reduce((s, r) => s + (Number(r.sales) || 0), 0)
    // Margin รวม = ถ่วงน้ำหนักด้วยยอดขาย ซึ่งให้ผลเท่ากับคิดจากต้นทุนรวมพอดี (ต้นทุน = ยอดขาย × (1 − margin))
    const marginWeighted = active.reduce((s, r) => s + (Number(r.sales) || 0) * (Number(r.margin_percent) || 0), 0)
    // ส่วนลดรวมต้องคืนกลับเป็นราคาขายปกติก่อนแล้วค่อยเทียบ ไม่ใช่เฉลี่ย % ตรงๆ ไม่งั้นออเดอร์เล็กจะถ่วงผลเท่าออเดอร์ใหญ่
    let normal = 0, salesWithNormal = 0
    active.forEach(r => {
      const s = Number(r.sales) || 0
      const d = r.discount_percent
      if (d === null || d === undefined || d >= 100) return
      normal += s / (1 - d / 100)
      salesWithNormal += s
    })
    return {
      sales, orders: active.length,
      margin: sales > 0 ? marginWeighted / sales : 0,
      discount: normal > 0 ? (1 - salesWithNormal / normal) * 100 : null,
    }
  }, [active])

  return (
    <div className="card sms" style={{ marginBottom: 14 }}>
      <style>{CSS}</style>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="card-title">{t('สรุปยอดขาย/ส่วนลดของฉัน')}</div>
        <div className="sms-bar">
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('ถึง')}</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
          {(fromDate || toDate) && <button className="btn btn-outline btn-xs" onClick={() => { setFromDate(''); setToDate('') }}>{t('ล้าง')}</button>}
          <span className="sms-sep" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <input type="checkbox" checked={includeCancelled} onChange={e => setIncludeCancelled(e.target.checked)} />
            {t('รวมออเดอร์ที่ยกเลิก')}
          </label>
        </div>
      </div>

      <div className="card-body">
        {notReady ? (
          <div className="empty-state"><div>{t('รายงานนี้ยังไม่พร้อมใช้งาน กรุณาแจ้งผู้ดูแลระบบ')}</div></div>
        ) : (
          <>
            <div className="kpi-grid">
              <div className="kpi-card navy">
                <div className="kpi-label">{t('ยอดขายรวม')}</div>
                <div className="kpi-value">{fmtCurrency(totals.sales)}</div>
                <div className="kpi-sub">{totals.orders} {t('ออเดอร์', 'orders')}</div>
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

            <div className="table-wrap" style={{ maxHeight: 420, overflow: 'auto' }}>
              {active.length ? (
                <table>
                  <thead>
                    <tr>
                      <th>{t('เลขออเดอร์')}</th>
                      <th>{t('ลูกค้า')}</th>
                      <th>{t('วันที่')}</th>
                      <th className="num">{t('จำนวน')}</th>
                      <th className="num">{t('ยอดขาย')}</th>
                      <th className="num">Margin</th>
                      <th className="num">{t('ส่วนลด')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map(r => (
                      <tr key={r.order_id}>
                        <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                          {r.order_no}
                          {r.order_status === 'Cancelled' && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>{t('ยกเลิกแล้ว')}</span>}
                          {r.order_type === 'Grade B' && <span className="badge badge-orange" style={{ marginLeft: 4, fontSize: 10 }}>GB</span>}
                        </td>
                        <td style={{ fontSize: 12 }}>{r.customer_name || '-'}</td>
                        <td style={{ fontSize: 12 }}>{fmtDate(r.order_date)}</td>
                        <td className="num">{r.quantity}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{fmtCurrency(r.sales)}</td>
                        <td className="num" style={{ fontWeight: 700, color: marginColor(Number(r.margin_percent)) }}>{pct(r.margin_percent)}</td>
                        <td className="num">{r.discount_percent === null ? '-' : pct(r.discount_percent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <div className="empty-state"><div>{loading ? t('กำลังโหลด...') : t('ยังไม่มีออเดอร์ของคุณในช่วงที่เลือก')}</div></div>}
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8, lineHeight: 1.6 }}>
              <div>{t('แสดงเฉพาะออเดอร์ที่คุณเป็นผู้เปิดเท่านั้น')}</div>
              <div>{t('ส่วนลดเทียบกับราคาขายปกติ ณ วันที่เปิดออเดอร์ นับเฉพาะรายการที่มีราคาขายปกติบันทึกไว้')}</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
