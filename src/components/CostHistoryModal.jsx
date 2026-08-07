import { useEffect, useState } from 'react'
import { fetchProductCostHistory } from '../lib/api'
import { fmtCurrency } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// ประวัติการแก้ไขต้นทุนของสินค้าหนึ่งตัว — ตอบคำถามว่า "ตอนที่ลูกค้าได้ราคานั้น ต้นทุนเป็นเท่าไหร่"
// เห็นได้เฉพาะบัญชี/แอดมิน (บังคับที่ RLS ของ product_cost_history)

const money = (n) => (n === null || n === undefined || n === '' ? '-' : fmtCurrency(n))
const pct = (n) => (n === null || n === undefined || n === '' ? '-' : `${Number(n).toFixed(2)}%`)

const fmtStamp = (ts) => {
  if (!ts) return '-'
  const d = new Date(ts)
  return `${d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`
}

// แสดงเฉพาะช่องที่เปลี่ยนจริง เป็น "ค่าเดิม → ค่าใหม่" กันต้องเทียบเองทีละแถว
function Diff({ label, prev, next, format }) {
  if (prev === next) return null
  return (
    <div style={{ fontSize: 12 }}>
      <span style={{ color: 'var(--text-light)' }}>{label}: </span>
      <span style={{ textDecoration: 'line-through', color: 'var(--text-light)' }}>{format(prev)}</span>
      <span style={{ margin: '0 6px' }}>→</span>
      <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{format(next)}</span>
    </div>
  )
}

export default function CostHistoryModal({ product, onClose }) {
  const { toast } = useUi()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchProductCostHistory({ productId: product.id })
      .then(setRows)
      .catch(e => toast('โหลดประวัติไม่สำเร็จ: ' + e.message, 'error'))
      .finally(() => setLoading(false))
  }, [product.id, toast])

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <div className="modal-title">{t('ประวัติการแก้ไขต้นทุน')} — {product.code} {product.name}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {rows.length ? (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 10 }}>
                {t('เรียงจากใหม่ไปเก่า — ใช้เทียบว่าตอนที่ลูกค้าได้ราคานั้น ต้นทุนและเกณฑ์ราคาเป็นเท่าไหร่')}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 150 }}>{t('เมื่อ')}</th>
                      <th>{t('การเปลี่ยนแปลง')}</th>
                      <th style={{ width: 150 }}>{t('ค่าหลังแก้')}</th>
                      <th style={{ width: 110 }}>{t('โดย')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(h => (
                      <tr key={h.id}>
                        <td style={{ fontSize: 12 }}>{fmtStamp(h.changed_at)}</td>
                        <td>
                          <div style={{ marginBottom: 4 }}>
                            <span className={`badge ${h.action === 'created' ? 'badge-blue' : 'badge-orange'}`} style={{ fontSize: 10 }}>
                              {h.action === 'created' ? t('เริ่มบันทึก') : t('แก้ไข')}
                            </span>
                            {(h.changed_fields || []).length > 0 && (
                              <span style={{ fontSize: 11, color: 'var(--text-light)', marginLeft: 6 }}>{h.changed_fields.join(', ')}</span>
                            )}
                          </div>
                          {h.action === 'updated' && (
                            <>
                              <Diff label={t('ต้นทุน/ชิ้น')} prev={h.prev_cost_price} next={h.cost_price} format={money} />
                              <Diff label={t('ราคาขายปกติ')} prev={h.prev_normal_selling_price} next={h.normal_selling_price} format={money} />
                              <Diff label="Floor Price" prev={h.prev_floor_price} next={h.floor_price} format={money} />
                              <Diff label={t('Margin เป้าหมาย')} prev={h.prev_target_margin_percent} next={h.target_margin_percent} format={pct} />
                              <Diff label={t('Margin ขั้นต่ำ')} prev={h.prev_minimum_margin_percent} next={h.minimum_margin_percent} format={pct} />
                            </>
                          )}
                          {h.finance_remark && (
                            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('หมายเหตุ')}: {h.finance_remark}</div>
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <div>{t('ต้นทุน')} <b>{money(h.cost_price)}</b></div>
                          <div style={{ color: 'var(--text-light)' }}>Floor {money(h.floor_price)}</div>
                          <div style={{ color: 'var(--text-light)' }}>{pct(h.target_margin_percent)} / {pct(h.minimum_margin_percent)}</div>
                        </td>
                        <td style={{ fontSize: 11 }}>{h.changed_by_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="empty-state"><div>{loading ? t('กำลังโหลด...') : t('ยังไม่มีประวัติการแก้ไข')}</div></div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>{t('ปิด')}</button>
        </div>
      </div>
    </div>
  )
}
