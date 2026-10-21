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

// คำอธิบายวิธีคิดของแต่ละตัวเลข — เอาเมาส์ไปวางที่ ? แล้วขึ้น
// เขียนจากสูตรจริงใน margin_order_report_mine (supabase/schema.sql) ไม่ใช่จากความจำ
// ถ้าแก้สูตรใน schema.sql ต้องมาแก้ตรงนี้ด้วย ไม่งั้นคำอธิบายจะพาคนเข้าใจผิด
const HELP = {
  sales: {
    title: 'ยอดขาย',
    body: [
      ['คิดจาก', 'จำนวน × ราคาต่อหน่วย รวมทุกบรรทัดในออเดอร์'],
      ['ราคารวม VAT แล้ว', 'ใช้ราคาต่อหน่วยตามที่บันทึกในออเดอร์ ซึ่งเป็นราคาเดียวกับในใบเสนอราคา คือรวม VAT แล้ว'],
      ['ยังไม่หักส่วนลดท้ายบิล', 'ถ้าออเดอร์นั้นใส่ส่วนลดท้ายบิลไว้ ยอดที่เก็บเงินจริงจะน้อยกว่าตัวเลขนี้'],
    ],
  },
  qty: {
    title: 'จำนวน',
    body: [['คิดจาก', 'จำนวนชิ้นของทุกบรรทัดในออเดอร์บวกรวมกัน ต่างรุ่นต่างขนาดก็นับรวมเป็นชิ้นเหมือนกัน']],
  },
  margin: {
    title: 'Margin (กำไรขั้นต้น %)',
    body: [
      ['สูตร', '(ยอดขาย − ต้นทุน) ÷ ยอดขาย × 100'],
      ['เป็น % ของอะไร', 'เป็น % ของยอดขาย ไม่ใช่ % ของต้นทุน — ขาย 100 ต้นทุน 70 คือ Margin 30%'],
      ['ต้นทุนที่ใช้', 'สำเนาต้นทุน ณ วันที่เปิดออเดอร์ ไม่ใช่ต้นทุนวันนี้ — บัญชีแก้ต้นทุนวันนี้จะไม่ย้อนไปเปลี่ยนออเดอร์เก่า'],
      ['ออเดอร์ Grade B', 'คิดต้นทุนตามสัดส่วนที่บัญชีตั้งไว้ให้ออเดอร์นั้น (ค่ากลางคือ 80% ของต้นทุนเต็ม)'],
      ['ถ้าสินค้ายังไม่ได้กรอกต้นทุน', 'บรรทัดนั้นจะถูกคิดต้นทุนเป็น 0 ทำให้ Margin ที่เห็นสูงกว่าความจริง'],
      ['ยังไม่หักอะไรบ้าง', 'ยังไม่หักค่าขนส่งจริงและ Buffer ตัวเลขกำไรจริงจะต่ำกว่านี้เล็กน้อย'],
      ['สีที่ขึ้น', 'เขียว = 25% ขึ้นไป · เหลือง = 15–25% · แดง = ต่ำกว่า 15%'],
    ],
  },
  discount: {
    title: 'ส่วนลด (เทียบราคาขายปกติ)',
    body: [
      ['สูตร', '(1 − ยอดขาย ÷ ราคาขายปกติ) × 100'],
      ['ลดจากราคาไหน', 'ลดจาก "ราคาขายปกติ" คือราคาป้ายก่อนลดที่บัญชีกรอกไว้ในหน้าต้นทุนสินค้า ไม่ใช่ราคาทุน และไม่ใช่ราคาที่เซลล์ตั้งเอง'],
      ['ราคาปกติ ณ วันไหน', 'ใช้ราคาขายปกติ ณ วันที่เปิดออเดอร์ บัญชีแก้ราคาปกติวันนี้จะไม่ย้อนไปเปลี่ยนออเดอร์เก่า'],
      ['ตัวอย่าง', 'ราคาปกติ 1,000 ขายจริง 800 → ส่วนลด (1 − 800 ÷ 1,000) × 100 = 20%'],
      ['ขึ้น "-" แปลว่า', 'ทั้งออเดอร์ไม่มีบรรทัดไหนมีราคาขายปกติบันทึกไว้เลย จึงเทียบส่วนลดไม่ได้'],
      ['ข้อควรระวัง', 'ตัวหารนับเฉพาะบรรทัดที่มีราคาขายปกติบันทึกไว้ แต่ตัวตั้งเป็นยอดขายทั้งออเดอร์\nถ้าออเดอร์นั้นมีบางบรรทัดที่ยังไม่ได้กรอกราคาขายปกติ ตัวเลขส่วนลดที่เห็นจะต่ำกว่าความจริง'],
    ],
  },
  salesTotal: {
    title: 'ยอดขายรวม',
    body: [
      ['คิดจาก', 'บวกยอดขายของทุกออเดอร์ที่คุณเปิดในช่วงวันที่เลือก'],
      ['นับออเดอร์ที่ยกเลิกด้วยไหม', 'ไม่นับ ถ้าอยากให้นับด้วยให้ติ๊ก "รวมออเดอร์ที่ยกเลิก"'],
    ],
  },
  marginTotal: {
    title: 'Margin รวม',
    body: [
      ['คิดยังไง', 'ไม่ได้เอา % ของแต่ละออเดอร์มาเฉลี่ยตรงๆ แต่ถ่วงน้ำหนักด้วยยอดขาย'],
      ['แปลว่าอะไร', 'ออเดอร์ใหญ่มีผลต่อตัวเลขนี้มากกว่าออเดอร์เล็ก ซึ่งให้ผลเท่ากับคิดจากกำไรรวมหารยอดขายรวมพอดี'],
      ['เงื่อนไขอื่น', 'ใช้เงื่อนไขเดียวกับ Margin รายออเดอร์ทุกข้อ'],
    ],
  },
  discountTotal: {
    title: 'ส่วนลดเฉลี่ยจากราคาปกติ',
    body: [
      ['คิดยังไง', 'คืนยอดขายกลับเป็นราคาปกติของทั้งช่วงก่อน แล้วค่อยเทียบทีเดียว ไม่ได้เอา % ของแต่ละออเดอร์มาเฉลี่ยตรงๆ'],
      ['ทำไมต้องทำแบบนี้', 'ถ้าเฉลี่ย % ตรงๆ ออเดอร์เล็กจะถ่วงผลเท่าออเดอร์ใหญ่ ซึ่งไม่สะท้อนส่วนลดที่ให้ไปจริง'],
      ['นับเฉพาะอะไร', 'นับเฉพาะออเดอร์ที่เทียบส่วนลดได้ ออเดอร์ที่ขึ้น "-" จะไม่ถูกนำมาคิด'],
    ],
  },
}

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
.sms-q{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;margin-left:5px;
  border-radius:50%;background:var(--border);color:var(--navy);font-size:9.5px;font-weight:700;line-height:1;
  cursor:help;border:none;padding:0;vertical-align:middle;flex:0 0 auto}
.sms-q:hover,.sms-q:focus-visible{background:var(--navy);color:#fff;outline:none}
.sms-tip{position:fixed;z-index:9000;width:340px;max-width:calc(100vw - 24px);background:#fff;
  border:1px solid var(--border);border-radius:9px;box-shadow:0 8px 26px rgba(16,24,40,.16);
  padding:12px 14px;text-align:left;cursor:default;overflow:auto}
.sms-tip .tt{font-size:12.5px;font-weight:700;color:var(--navy);margin-bottom:8px}
.sms-tip .r{margin-bottom:9px}
.sms-tip .r:last-child{margin-bottom:0}
.sms-tip .k{font-size:10.5px;font-weight:600;color:var(--text-light);margin-bottom:2px}
.sms-tip .v{font-size:12px;line-height:1.6;color:var(--text);white-space:pre-line}
.sms-tip .v.f{font-family:ui-monospace,Menlo,monospace;background:var(--gray-bg);border-radius:6px;padding:7px 9px;font-size:11.5px}
.sms .kpi-grid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin-bottom:14px}
.sms .kpi-card{padding:12px 16px}
.sms .kpi-value{font-size:20px;white-space:nowrap}
.sms-bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.sms-sep{width:1px;height:20px;background:var(--border)}
`

// ? ที่เอาเมาส์ไปวางแล้วขึ้นคำอธิบาย — วางแบบ fixed เพราะหัวตารางอยู่ในกล่องที่ scroll ได้ ถ้าใช้ absolute จะโดนตัด
// หน่วงตอนซ่อน 120ms ให้ขยับเมาส์จากปุ่มเข้าไปในกล่องได้โดยไม่กะพริบ และเปิดด้วยคีย์บอร์ด (focus) ได้ด้วย
function Hint({ help }) {
  const { t } = useLanguage()
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const hideTimer = useRef(null)

  useEffect(() => () => clearTimeout(hideTimer.current), [])

  const show = () => {
    clearTimeout(hideTimer.current)
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const half = 170 + 12
    const x = Math.min(Math.max(r.left + r.width / 2, half), window.innerWidth - half)
    // เลือกข้างที่มีที่ว่างมากกว่า แล้วจำกัดความสูงเท่าที่ว่างจริง กล่องยาวๆ จะ scroll ในตัวแทนที่จะล้นจอ
    // คิดจากที่ว่างจริง ไม่ใช่แค่ดูว่าปุ่มอยู่ครึ่งบนหรือครึ่งล่าง เพราะกล่องแต่ละอันสูงไม่เท่ากัน
    const below = window.innerHeight - r.bottom - 14
    const above = r.top - 14
    const up = below < 260 && above > below
    setPos({
      x, up, top: r.bottom + 8, bottom: window.innerHeight - r.top + 8,
      max: Math.max(150, up ? above : below),
    })
  }
  const hide = () => { hideTimer.current = setTimeout(() => setPos(null), 120) }

  return (
    <>
      <button type="button" ref={btnRef} className="sms-q" aria-label={t('วิธีคิด') + ' ' + t(help.title)}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={e => { e.stopPropagation(); pos ? setPos(null) : show() }}>?</button>
      {pos && (
        <div className="sms-tip" onMouseEnter={() => clearTimeout(hideTimer.current)} onMouseLeave={hide}
          style={{ left: pos.x, maxHeight: pos.max, transform: 'translateX(-50%)', ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }) }}>
          <div className="tt">{t(help.title)}</div>
          {help.body.map(([k, v], i) => (
            <div className="r" key={i}>
              <div className="k">{t(k)}</div>
              {/* บรรทัดที่เป็นสูตรมี ÷ หรือ × อยู่ ให้ใช้ฟอนต์ความกว้างคงที่ อ่านวงเล็บง่ายกว่า */}
              <div className={`v${/[÷×−]/.test(v) ? ' f' : ''}`}>{t(v)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

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
                <div className="kpi-label">{t('ยอดขายรวม')}<Hint help={HELP.salesTotal} /></div>
                <div className="kpi-value">{fmtCurrency(totals.sales)}</div>
                <div className="kpi-sub">{totals.orders} {t('ออเดอร์', 'orders')}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Margin<Hint help={HELP.marginTotal} /></div>
                <div className="kpi-value" style={{ color: marginColor(totals.margin) }}>{pct(totals.margin)}</div>
              </div>
              <div className="kpi-card red">
                <div className="kpi-label">{t('ส่วนลดเฉลี่ยจากราคาปกติ')}<Hint help={HELP.discountTotal} /></div>
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
                      <th className="num">{t('จำนวน')}<Hint help={HELP.qty} /></th>
                      <th className="num">{t('ยอดขาย')}<Hint help={HELP.sales} /></th>
                      <th className="num">Margin<Hint help={HELP.margin} /></th>
                      <th className="num">{t('ส่วนลด')}<Hint help={HELP.discount} /></th>
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
              <div>{t('กดที่เลขออเดอร์เพื่อดูรายการสินค้าในออเดอร์นั้น')}</div>
              <div>{t('เอาเมาส์ไปวางที่ ? ของแต่ละหัวข้อ เพื่อดูว่าตัวเลขนั้นคิดมาจากอะไร')}</div>
            </div>
          </>
        )}
      </div>

      {detail && (
        <Popup title={detail.order_no}
          sub={`${detail.customer_name || '-'} · ${fmtDate(detail.order_date)}`}
          onClose={closeDetail}>
          <div className="sms-sum">
            <div><div className="k">{t('ยอดขาย')}<Hint help={HELP.sales} /></div><div className="v">{fmtCurrency(detail.sales)}</div></div>
            <div><div className="k">{t('จำนวน')}<Hint help={HELP.qty} /></div><div className="v">{detail.quantity}</div></div>
            <div><div className="k">Margin<Hint help={HELP.margin} /></div><div className="v" style={{ color: marginColor(Number(detail.margin_percent)) }}>{pct(detail.margin_percent)}</div></div>
            <div><div className="k">{t('ส่วนลด')}<Hint help={HELP.discount} /></div><div className="v">{detail.discount_percent === null ? '-' : pct(detail.discount_percent)}</div></div>
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
                    <th className="num">{t('ยอดขาย')}<Hint help={HELP.sales} /></th>
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
