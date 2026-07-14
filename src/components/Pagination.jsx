import { useLanguage } from './LanguageContext'

export default function Pagination({ page, pageSize, count, onPage }) {
  const { t, lang } = useLanguage()
  const totalPages = Math.max(1, Math.ceil((count || 0) / pageSize))
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', fontSize: 12, color: 'var(--text-light)', borderTop: '1px solid var(--border)' }}>
      <div>{lang === 'en' ? `${count || 0} total · page ${page + 1}/${totalPages}` : `ทั้งหมด ${count || 0} รายการ · หน้า ${page + 1}/${totalPages}`}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-outline btn-xs" disabled={page <= 0} onClick={() => onPage(page - 1)}>{t('‹ ก่อนหน้า')}</button>
        <button className="btn btn-outline btn-xs" disabled={page + 1 >= totalPages} onClick={() => onPage(page + 1)}>{t('ถัดไป ›')}</button>
      </div>
    </div>
  )
}
