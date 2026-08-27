import { useEffect, useMemo, useState } from 'react'
import { fetchCatalogViewReport } from '../lib/api'
import { exportRowsToExcel } from '../lib/importExport'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// รายงานยอดเปิดดูแคตตาล็อกรายเดือน
// ตั้งแถวเป็นเดือน คอลัมน์เป็นแคตตาล็อก เพราะคำถามที่ถามกันจริงคือ "เดือนนี้คนดูเยอะกว่าเดือนที่แล้วมั้ย"
// การนับเดือนทำที่ฐานข้อมูลด้วยเวลาไทย (ดู catalog_view_report ใน schema.sql)
// ไม่ใช่ตัดเดือนฝั่ง client ที่จะเพี้ยนตาม timezone ของเครื่องคนเปิดรายงาน

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const TH_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function monthLabel(ym) {
  const [y, m] = ym.split('-')
  return `${TH_MONTH[Number(m) - 1] || m} ${Number(y) + 543 - 2000 > 0 ? Number(y) + 543 : y}`
}

// เดือนทุกเดือนในช่วง แม้เดือนที่ไม่มีคนเปิดเลย — เดือนที่หายไปจากตารางอ่านยากกว่าเดือนที่เป็นศูนย์
function monthsBetween(from, to) {
  const out = []
  const a = new Date(from + 'T00:00:00')
  const b = new Date(to + 'T00:00:00')
  const cur = new Date(a.getFullYear(), a.getMonth(), 1)
  while (cur <= b) {
    out.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`)
    cur.setMonth(cur.getMonth() + 1)
  }
  return out.reverse()
}

export default function CatalogViewReport({ onClose }) {
  const { toast } = useUi()
  const { t } = useLanguage()

  const today = new Date()
  const [from, setFrom] = useState(iso(new Date(today.getFullYear(), today.getMonth() - 11, 1)))
  const [to, setTo] = useState(iso(today))
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchCatalogViewReport(from, to)
      .then(r => { if (alive) setRows(r || []) })
      .catch(e => { if (alive) toast('โหลดรายงานไม่สำเร็จ: ' + e.message, 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [from, to, toast])

  const { months, catalogs, cell, monthTotal, catalogTotal, grand } = useMemo(() => {
    const months = monthsBetween(from, to)
    const names = new Map()
    const cell = new Map()      // `${month}|${catalogId}` -> views
    const catalogTotal = new Map()
    const monthTotal = new Map()
    let grand = 0
    for (const r of rows) {
      const id = r.catalog_id || 'deleted'
      const n = Number(r.views) || 0
      names.set(id, r.catalog_name || '(ถูกลบแล้ว)')
      cell.set(`${r.month}|${id}`, (cell.get(`${r.month}|${id}`) || 0) + n)
      catalogTotal.set(id, (catalogTotal.get(id) || 0) + n)
      monthTotal.set(r.month, (monthTotal.get(r.month) || 0) + n)
      grand += n
    }
    // เรียงแคตตาล็อกจากยอดรวมมากไปน้อย อันที่คนดูเยอะที่สุดควรอยู่ซ้ายสุด
    const catalogs = [...names.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (catalogTotal.get(b.id) || 0) - (catalogTotal.get(a.id) || 0))
    return { months, catalogs, cell, monthTotal, catalogTotal, grand }
  }, [rows, from, to])

  const doExport = async () => {
    setExporting(true)
    try {
      const columns = [
        { key: 'month', label: 'เดือน' },
        ...catalogs.map(c => ({ key: c.id, label: c.name })),
        { key: '__total', label: 'รวม' },
      ]
      const data = months.map(m => {
        const row = { month: monthLabel(m) }
        catalogs.forEach(c => { row[c.id] = cell.get(`${m}|${c.id}`) || 0 })
        row.__total = monthTotal.get(m) || 0
        return row
      })
      const totalRow = { month: 'รวมทั้งช่วง' }
      catalogs.forEach(c => { totalRow[c.id] = catalogTotal.get(c.id) || 0 })
      totalRow.__total = grand
      data.push(totalRow)
      await exportRowsToExcel(columns, data, `catalog-views-${from}-to-${to}.xlsx`)
    } catch (e) { toast('ส่งออกไม่สำเร็จ: ' + e.message, 'error') }
    finally { setExporting(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 940, width: '95vw' }}>
        <div className="modal-header">
          <div className="modal-title">{t('รายงานยอดเปิดดูแคตตาล็อก')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '76vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('ตั้งแต่')}</label>
              <input className="form-control" type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">{t('ถึง')}</label>
              <input className="form-control" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} />
            </div>
            <button className="btn btn-outline" disabled={exporting || !rows.length} onClick={doExport}>
              {exporting ? t('กำลังส่งออก...') : t('ส่งออกเป็น Excel')}
            </button>
            <div style={{ marginLeft: 'auto', fontSize: 13 }}>
              {t('รวมทั้งช่วง')}: <b style={{ color: 'var(--navy)', fontSize: 16 }}>{grand.toLocaleString('th-TH')}</b> {t('ครั้ง')}
            </div>
          </div>

          {loading ? (
            <div className="empty-state">{t('กำลังโหลด...')}</div>
          ) : !rows.length ? (
            <div className="empty-state">
              <div>{t('ยังไม่มีคนเปิดดูในช่วงนี้')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 6 }}>
                {t('ยอดจะเริ่มนับตั้งแต่ครั้งแรกที่ลูกค้าเปิดลิงก์ที่เผยแพร่แล้ว')}
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', left: 0, background: 'var(--navy)' }}>{t('เดือน')}</th>
                    {catalogs.map(c => <th key={c.id} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{c.name}</th>)}
                    <th style={{ textAlign: 'right' }}>{t('รวม')}</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map(m => (
                    <tr key={m}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{monthLabel(m)}</td>
                      {catalogs.map(c => {
                        const v = cell.get(`${m}|${c.id}`) || 0
                        return <td key={c.id} style={{ textAlign: 'right', color: v ? 'var(--text)' : 'var(--text-light)' }}>{v || '-'}</td>
                      })}
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{monthTotal.get(m) || 0}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--gray-bg)' }}>
                    <td style={{ fontWeight: 700 }}>{t('รวมทั้งช่วง')}</td>
                    {catalogs.map(c => <td key={c.id} style={{ textAlign: 'right', fontWeight: 700 }}>{catalogTotal.get(c.id) || 0}</td>)}
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--navy)' }}>{grand}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 10, lineHeight: 1.7 }}>
            {t('นับ 1 ครั้งต่อการเปิดหน้า 1 ครั้ง — ลูกค้าคนเดิมเปิดซ้ำหรือรีเฟรชจะนับเพิ่ม และนับเฉพาะแคตตาล็อกที่เผยแพร่แล้วเท่านั้น')}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t('ปิด')}</button>
        </div>
      </div>
    </div>
  )
}
