import { useState } from 'react'
import { catalogPublicUrl } from '../lib/api'
import { useLanguage } from './LanguageContext'

// ลิงก์สาธารณะของแคตตาล็อก — ลิงก์เดียวจบ ไม่แยกตามช่องทางแล้ว
// ยอดเปิดดูดูรวมรายเดือนที่ปุ่ม "รายงานยอดเปิดดู" แทน (ดู CatalogViewReport)

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // clipboard API ใช้ไม่ได้ตอนเปิดผ่าน http หรือเบราว์เซอร์เก่า — ถอยไปใช้วิธีเดิม
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.position = 'fixed'
      el.style.opacity = '0'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch { return false }
  }
}

export default function CatalogLinkModal({ catalog, onClose }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  const url = catalogPublicUrl(catalog.catalog_slug)
  const published = catalog.status === 'published'

  const doCopy = async () => {
    const ok = await copyText(url)
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{t('คัดลอกลิงก์')} — {catalog.catalog_name}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {!published && (
            <div style={{ padding: '8px 10px', borderRadius: 6, background: '#fff8e1', border: '1px solid #ffe082', fontSize: 12, marginBottom: 12 }}>
              {t('แคตตาล็อกนี้ยังไม่ได้เผยแพร่ — ลูกค้าเปิดลิงก์แล้วจะยังไม่เห็นรูป กด "เผยแพร่" ก่อนส่ง')}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="form-control" readOnly value={url} onFocus={e => e.target.select()} style={{ fontSize: 12 }} />
            <button className={`btn ${copied ? 'btn-success' : 'btn-primary'}`} style={{ whiteSpace: 'nowrap', minWidth: 92 }} onClick={doCopy}>
              {copied ? t('คัดลอกแล้ว') : t('คัดลอก')}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8 }}>
            {t('ส่งลิงก์นี้ทาง LINE, Facebook, อีเมล หรือช่องทางไหนก็ได้ ทุกครั้งที่ลูกค้าเปิดจะถูกนับยอดให้อัตโนมัติ')}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t('ปิด')}</button>
          <a className="btn btn-outline" href={url} target="_blank" rel="noreferrer">{t('เปิดหน้าลูกค้า')}</a>
        </div>
      </div>
    </div>
  )
}
