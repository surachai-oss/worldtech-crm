import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchMyOrderMarginReport, listOrderItems } from '../lib/api'
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
//
// ป๊อปอัปรายการสินค้าดึงจาก order_items ตรงๆ ได้อย่างปลอดภัย เพราะตารางนั้นไม่มีคอลัมน์ต้นทุนอยู่เลย
// (ต้นทุนอยู่คนละตารางคือ order_item_costs) และ RLS ของมันเปิดตามออเดอร์แม่ซึ่งเซลล์เห็นเฉพาะของตัวเอง
// ห้ามเติม margin หรือต้นทุนรายบรรทัดลงในป๊อปอัปนี้ เพราะ margin รายบรรทัดย้อนกลับเป็นต้นทุนรายบรรทัดได้

const pct = (n) => (n === null || n === undefined || !isFinite(n) ? '-' : `${Number(n).toFixed(2)}%`)
const marginColor = (m) => (m >= 25 ? 'var(--success)' : m >= 15 ? 'var(--warning)' : 'var(--danger)')

const CSS = `
.sms table td{padding:10px 14px}
.sms table td.num{text-align:right;white-space:nowrap}
.sms table th.num{white-space:nowrap}
.sms table tbody tr:nth-child(even){background:#fcfcfe}
.sms table tbody tr{cursor:default}
.sms table tbody tr:hover{background:#f4f7ff}
.sms-link{background:none;border:none;padding:0;font:inherit;color:var(--navy);font-weight:600;cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--border)}
.sms-link:hover{text-decoration-color:var(--navy)}
.sms-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:12px}
.sms-sum > div{background:var(--gray-bg);border-radius:7px;padding:8px 11px}
.sms-sum .k{font-size:10.5px;color:var(--text-light);text-transform:uppercase}
.sms-sum .v{font-size:15px;font-weight:600;color:var(--navy);white-space:nowrap}
.sms .kpi-grid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}
.sms .kpi-card{padding:12px 16px}
.sms .kpi-value{font-size:20px;white-space:nowrap}
.sms-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.sms-sep{width:1px;height:20px;background:var(--border)}
`

function Popup({ title, sub, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 820 }}>
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

export default function SalesMarginSummary() {
  const { toast } = useUi()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [notReady, setNotReady] = useState(false)
  const [includeCancelled, setIncludeCancelled] = useState(false)
  const [fromDate, setFromDate] = useState(() => currentMonthRange().first)
  const [toDate, setToDate] = useState(() => currentMonthRange().last)
  const [detail, setDetail] = useState(null)          // ออเดอร์ที่กดดูรายการสินค้า
  const [detailLines, setDetailLines] = useState(null) // null = กำลังโหลด
  const detailReq = useRef(null)

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

  // รายการสินค้าในออเดอร์ — ดึงจาก order_items ซึ่งไม่มีคอลัมน์ต้นทุนอยู่เลย (ดูหมายเหตุหัวไฟล์)
  const openDetail = (row) => {
    detailReq.current = row.order_id   // ถ้าผู้ใช้ปิดหรือเปลี่ยนออเดอร์ระหว่างรอ ให้ทิ้งผลที่มาช้าไป
    setDetail(row)
    setDetailLines(null)
    listOrderItems(row.order_id)
      .then(items => { if (detailReq.current === row.order_id) setDetailLines(items || []) })
      .catch(e => {
        if (detailReq.current === row.order_id) setDetailLines([])
        toast(t('โหลดรายการสินค้าไม่สำเร็จ') + ': ' + e.message, 'error')
      })
  }

  const closeDetail = () => { detailReq.current = null; setDetail(null); setDetailLines(null) }

  const detailSales = useMemo(
    () => (detailLines || []).reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0),
    [detailLines]
  )

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
                          <button type="button" className="sms-link" onClick={() => openDetail(r)}>{r.order_no}</button>
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
              <div>{t('กดที่เลขออเดอร์เพื่อดูรายการสินค้าในออเดอร์นั้น')}</div>
            </div>
          </>
        )}
      </div>

      {detail && (
        <Popup title={detail.order_no}
          sub={`${detail.customer_name || '-'} · ${fmtDate(detail.order_date)}`}
          onClose={closeDetail}>
          <div className="sms-sum">
            <div><div className="k">{t('ยอดขาย')}</div><div className="v">{fmtCurrency(detail.sales)}</div></div>
            <div><div className="k">{t('จำนวน')}</div><div className="v">{detail.quantity}</div></div>
            <div><div className="k">Margin</div><div className="v" style={{ color: marginColor(Number(detail.margin_percent)) }}>{pct(detail.margin_percent)}</div></div>
            <div><div className="k">{t('ส่วนลด')}</div><div className="v">{detail.discount_percent === null ? '-' : pct(detail.discount_percent)}</div></div>
          </div>

          {detailLines === null ? (
            <div className="empty-state"><div>{t('กำลังโหลด...')}</div></div>
          ) : detailLines.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('สินค้า')}</th>
                    <th className="num">{t('จำนวน')}</th>
                    <th className="num">{t('ราคาต่อหน่วย')}</th>
                    <th className="num">{t('ยอดขาย')}</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLines.map((l, i) => (
                    <tr key={l.id || i}>
                      <td>
                        {l.product?.name || l.description || '-'}
                        {l.product?.code && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{l.product.code}</div>}
                      </td>
                      <td className="num">{l.quantity}</td>
                      <td className="num">{fmtCurrency(l.unit_price)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmtCurrency((Number(l.quantity) || 0) * (Number(l.unit_price) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>{t('รวม')}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmtCurrency(detailSales)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : <div className="empty-state"><div>{t('ไม่พบรายการสินค้าในออเดอร์นี้')}</div></div>}
        </Popup>
      )}
    </div>
  )
}
