import { useEffect, useState } from 'react'
import { fetchCatalogBackCover, saveCatalogBackCover, lineHref } from '../lib/api'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import CatalogGalleryView from './CatalogGalleryView'

// ตั้งค่าปกหลัง — หน้าสุดท้ายของทุกแคตตาล็อก
// ดีไซน์ตายตัว แก้ได้แค่ข้อความกับช่องทางติดต่อ ตั้งใจไม่ให้เลือกสี/เพิ่มปุ่มเองได้
// เพราะรอบที่แล้วที่เปิดให้ปรับได้ทุกอย่าง ผลลัพธ์คือหน้าตาไม่เรียบร้อย
// ค่ากลางชุดเดียวใช้ทุกเล่ม วันเปลี่ยน LINE OA หรือเบอร์ แก้ที่นี่ที่เดียวมีผลกับลิงก์ที่ส่งไปแล้วทั้งหมด

const PREVIEW_CATALOG = { name: 'ตัวอย่าง', description: '' }
// ต้องมีรูปอย่างน้อยหนึ่งใบ ปกหลังถึงจะโผล่ (ปกหลังลอยเดี่ยวๆ ไม่มีความหมาย)
// ใช้ภาพแทนเป็น SVG ฝังในโค้ด ไม่ต้องยิงโหลดไฟล์จริงมาแค่ทำพรีวิว
const PREVIEW_IMAGE = [{
  url: 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400">' +
    '<rect width="300" height="400" fill="%23ffffff"/>' +
    '<rect x="18" y="18" width="264" height="46" rx="4" fill="%231B4C9B"/>' +
    '<g fill="%23E3E9F2">' +
    '<rect x="18" y="80" width="126" height="150" rx="4"/><rect x="156" y="80" width="126" height="150" rx="4"/>' +
    '<rect x="18" y="244" width="126" height="138" rx="4"/><rect x="156" y="244" width="126" height="138" rx="4"/>' +
    '</g></svg>'),
  caption: 'หน้าสินค้า (ภาพแทน)',
}]

export default function CatalogBackCoverModal({ onClose, onSaved }) {
  const { toast } = useUi()
  const { t } = useLanguage()
  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetchCatalogBackCover()
      .then(c => { if (alive) setCfg(c) })
      .catch(e => { if (alive) toast('โหลดค่าปกหลังไม่สำเร็จ: ' + e.message, 'error') })
    return () => { alive = false }
  }, [toast])

  const set = (k) => (e) => setCfg(c => ({ ...c, [k]: e.target.value }))

  const save = async () => {
    setSaving(true)
    try {
      await saveCatalogBackCover(cfg)
      toast('บันทึกปกหลังแล้ว มีผลกับทุกแคตตาล็อกทันที', 'success')
      onSaved?.(cfg)
      onClose()
    } catch (e) {
      // ตาราง settings เขียนได้เฉพาะแอดมิน — แปลข้อความ RLS ให้เป็นภาษาคน
      const msg = /row-level security|permission/i.test(e.message)
        ? 'ต้องเป็นแอดมินถึงจะแก้ค่ากลางนี้ได้'
        : e.message
      toast('บันทึกไม่สำเร็จ: ' + msg, 'error')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 780, width: '95vw' }}>
        <div className="modal-header">
          <div className="modal-title">{t('ตั้งค่าปกหลัง')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '76vh', overflowY: 'auto' }}>
          {!cfg ? <div className="empty-state">{t('กำลังโหลด...')}</div> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 14, lineHeight: 1.7 }}>
                  {t('ปกหลังคือหน้าสุดท้ายที่ลูกค้าเจอหลังปัดดูรูปจนจบ ลูกค้าทิ้งชื่อกับเบอร์ไว้ได้ แล้วจะเด้งเข้าหน้า "ผู้ติดต่อ" ทันที พร้อมระบุว่ามาจากแคตตาล็อกเล่มไหน')}
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <input type="checkbox" checked={cfg.enabled}
                      onChange={e => setCfg(c => ({ ...c, enabled: e.target.checked }))} />
                    {t('เปิดใช้ปกหลังในทุกแคตตาล็อก')}
                  </label>
                  {!cfg.enabled && (
                    <div style={{ fontSize: 11, color: '#c05621', marginTop: 4 }}>
                      {t('ปิดอยู่ — ลูกค้าปัดจนจบแล้วจบเลย ไม่มีทางติดต่อกลับ')}
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label required">{t('ข้อความหลัก')}</label>
                  <input className="form-control" value={cfg.heading} onChange={set('heading')} maxLength={80} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('ข้อความรอง')}</label>
                  <input className="form-control" value={cfg.note} onChange={set('note')} maxLength={120}
                    placeholder={t('เช่น ทีมขายติดต่อกลับในเวลาทำการ จันทร์–เสาร์')} />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('ลิงก์ LINE')}</label>
                  <input className="form-control" value={cfg.line} onChange={set('line')}
                    placeholder="@worldtech หรือวางลิงก์เต็มจากแอป LINE" />
                  {cfg.line && (
                    <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4, wordBreak: 'break-all' }}>
                      {t('ปุ่มจะพาไปที่')}: {lineHref(cfg.line)}
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">{t('เบอร์โทร')}</label>
                  <input className="form-control" value={cfg.phone} onChange={set('phone')} placeholder="02-000-0000" />
                </div>

                <div style={{ fontSize: 11, color: 'var(--text-light)', lineHeight: 1.7 }}>
                  {t('ไม่ใส่ LINE หรือเบอร์ก็ได้ — ช่องไหนว่าง ปุ่มนั้นจะไม่ขึ้นบนปกหลัง เหลือแค่ฟอร์ม')}
                </div>
              </div>

              {/* พรีวิวใช้คอมโพเนนต์ตัวจริงของหน้าลูกค้า ส่ง onSubmitLead เป็นตัวหลอกไว้ ไม่ส่งข้อมูลจริง */}
              <div style={{ flex: '1 1 280px', minWidth: 0, maxWidth: 320 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 8 }}>
                  {t('พรีวิว')}
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', height: 430, background: '#f5f7fa' }}>
                  <CatalogGalleryView
                    catalog={PREVIEW_CATALOG} images={PREVIEW_IMAGE}
                    backCover={cfg} onSubmitLead={async () => { throw new Error('พรีวิว — ยังไม่ส่งข้อมูลจริง') }}
                    mobile
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
                  {t('กดปุ่มขวา › เพื่อเลื่อนไปดูปกหลัง')}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t('ยกเลิก')}</button>
          <button className="btn btn-primary" disabled={!cfg || saving} onClick={save}>
            {saving ? t('กำลังบันทึก...') : t('บันทึก')}
          </button>
        </div>
      </div>
    </div>
  )
}
