import { useState } from 'react'
import { catalogPublicUrl, CATALOG_SOURCES } from '../lib/api'
import { useLanguage } from './LanguageContext'

// คัดลอกลิงก์สาธารณะของแคตตาล็อก — แยกปุ่มตามช่องทางที่จะเอาไปส่ง
// ที่ต้องแยกเพราะ ?src= คือสิ่งเดียวที่บอกได้ว่ายอดเปิดดูมาจากช่องทางไหน
// ถ้าให้เซลล์พิมพ์เองท้ายลิงก์ ไม่มีใครทำ แล้วรายงานช่องทางจะว่างเปล่า
const SOURCE_LABEL = {
  line: 'LINE', facebook: 'Facebook', website: 'เว็บไซต์', email: 'อีเมล', other: 'อื่นๆ',
}

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
  const [copied, setCopied] = useState('')
  const published = catalog.status === 'published'

  const doCopy = async (key, url) => {
    const ok = await copyText(url)
    setCopied(ok ? key : '')
    if (ok) setTimeout(() => setCopied(c => (c === key ? '' : c)), 1800)
  }

  const rows = [
    { key: '', label: t('ลิงก์ปกติ (ไม่ระบุช่องทาง)'), url: catalogPublicUrl(catalog.catalog_slug) },
    ...CATALOG_SOURCES.map(s => ({ key: s, label: SOURCE_LABEL[s], url: catalogPublicUrl(catalog.catalog_slug, s) })),
  ]

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
          <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 10 }}>
            {t('เลือกช่องทางที่จะเอาลิงก์ไปส่ง ระบบจะนับยอดเปิดดูแยกให้ตามช่องทางนั้น')}
          </div>
          {rows.map(r => (
            <div key={r.key || 'plain'} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <div style={{ width: 130, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{t(r.label)}</div>
              <input className="form-control" readOnly value={r.url} onFocus={e => e.target.select()} style={{ fontSize: 11 }} />
              <button className={`btn btn-xs ${copied === r.key ? 'btn-success' : 'btn-outline'}`}
                style={{ whiteSpace: 'nowrap', minWidth: 68 }} onClick={() => doCopy(r.key, r.url)}>
                {copied === r.key ? t('คัดลอกแล้ว') : t('คัดลอก')}
              </button>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t('ปิด')}</button>
          <a className="btn btn-primary" href={catalogPublicUrl(catalog.catalog_slug)} target="_blank" rel="noreferrer">
            {t('เปิดหน้าลูกค้า')}
          </a>
        </div>
      </div>
    </div>
  )
}
