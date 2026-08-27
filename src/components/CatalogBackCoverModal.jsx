import { useEffect, useState } from 'react'
import {
  fetchCatalogBackCover, saveCatalogBackCover, saveCatalogOwnBackCover, resolveCatalogBackCover,
  lineHref, THEMES, LOGO_SIZES, LOGO_LABELS, ALIGN_LABELS, ORDER_LABELS,
} from '../lib/api'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import CatalogGalleryView from './CatalogGalleryView'

// ตั้งค่าปกหลัง ใช้ได้สองโหมด
//   catalog = null  -> ค่ากลาง ใช้กับทุกเล่มที่ไม่ได้ตั้งเอง
//   catalog = {...} -> ชุดของเล่มนั้นโดยเฉพาะ เอาไว้ปรับโทนให้เข้ากับแคตตาล็อกแต่ละเล่ม
//
// แก้ได้ทุกคำที่ลูกค้าเห็น ส่วนหน้าตาให้เลือกจาก "ชุด" ที่จับคู่สีมาแล้ว ไม่ใช่เลือกสีทีละช่อง
// คนละเรื่องกับการล็อกไม่ให้ปรับ — แต่กันไม่ให้ได้คู่สีที่ตัวหนังสืออ่านไม่ออกบนพื้นของมันเอง

const PREVIEW_CATALOG = { name: 'ตัวอย่าง', description: '' }
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

function Group({ title, children }) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: .4, margin: '18px 0 8px' }}>
        {title}
      </div>
      {children}
    </>
  )
}

function Choice({ options, value, onPick, t }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([v, label]) => (
        <button key={v} type="button"
          className={`btn btn-xs ${value === v ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => onPick(v)}>{t(label)}</button>
      ))}
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4, wordBreak: 'break-all' }}>{hint}</div>}
    </div>
  )
}

export default function CatalogBackCoverModal({ catalog = null, onClose, onSaved }) {
  const { toast, confirm } = useUi()
  const { t } = useLanguage()
  const perCatalog = Boolean(catalog)

  const [cfg, setCfg] = useState(null)
  const [usingShared, setUsingShared] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    const load = perCatalog
      ? resolveCatalogBackCover(catalog)
      : fetchCatalogBackCover().then(c => ({ cfg: c, usingShared: true }))
    load
      .then(r => { if (alive) { setCfg(r.cfg); setUsingShared(perCatalog ? r.usingShared : true) } })
      .catch(e => { if (alive) toast('โหลดค่าปกหลังไม่สำเร็จ: ' + e.message, 'error') })
    return () => { alive = false }
  }, [catalog, perCatalog, toast])

  const set = (k) => (e) => setCfg(c => ({ ...c, [k]: e.target.value }))
  const pick = (k) => (v) => setCfg(c => ({ ...c, [k]: v }))
  // เล่มที่ยังใช้ค่ากลางอยู่ ต้องกด "ตั้งเฉพาะเล่มนี้" ก่อน ไม่งั้นแก้ไปก็ไม่มีผล
  const editable = !perCatalog || !usingShared

  const save = async () => {
    setSaving(true)
    try {
      if (perCatalog) await saveCatalogOwnBackCover(catalog.id, cfg)
      else await saveCatalogBackCover(cfg)
      toast(perCatalog ? 'บันทึกปกหลังของเล่มนี้แล้ว' : 'บันทึกแล้ว มีผลกับทุกเล่มที่ใช้ค่ากลาง', 'success')
      onSaved?.()
      onClose()
    } catch (e) {
      // settings เขียนได้เฉพาะแอดมิน — แปลข้อความ RLS ดิบให้เป็นภาษาคน
      const msg = /row-level security|permission/i.test(e.message) ? 'ไม่มีสิทธิ์แก้ค่านี้' : e.message
      toast('บันทึกไม่สำเร็จ: ' + msg, 'error')
    } finally { setSaving(false) }
  }

  const backToShared = async () => {
    if (!(await confirm('กลับไปใช้ค่ากลาง? ปกหลังที่ตั้งไว้เฉพาะเล่มนี้จะถูกลบ'))) return
    try {
      await saveCatalogOwnBackCover(catalog.id, null)
      const r = await resolveCatalogBackCover({ ...catalog, back_cover: null })
      setCfg(r.cfg); setUsingShared(true)
      toast('กลับไปใช้ค่ากลางแล้ว', 'success')
      onSaved?.()
    } catch (e) { toast('เปลี่ยนไม่สำเร็จ: ' + e.message, 'error') }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 900, width: '96vw' }}>
        <div className="modal-header">
          <div className="modal-title">
            {perCatalog ? `${t('ปกหลังของ')} ${catalog.catalog_name}` : t('ปกหลัง (ค่ากลาง)')}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '76vh', overflowY: 'auto' }}>
          {!cfg ? <div className="empty-state">{t('กำลังโหลด...')}</div> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>

              <div style={{ flex: '1 1 340px', minWidth: 0 }}>
                {perCatalog && (
                  <div style={{
                    padding: '10px 12px', borderRadius: 8, marginBottom: 14, fontSize: 12, lineHeight: 1.7,
                    background: usingShared ? 'var(--gray-bg)' : '#fff8e1',
                    border: `1px solid ${usingShared ? 'var(--border)' : '#ffe082'}`,
                  }}>
                    {usingShared ? (
                      <>
                        {t('เล่มนี้ใช้ค่ากลางอยู่ — กดปุ่มด้านล่างก่อน ถึงจะแก้เฉพาะเล่มนี้ได้')}
                        <div style={{ marginTop: 8 }}>
                          <button className="btn btn-outline btn-xs" onClick={() => setUsingShared(false)}>
                            {t('ตั้งเฉพาะเล่มนี้')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {t('เล่มนี้ใช้ปกหลังของตัวเอง แยกจากค่ากลางแล้ว')}
                        <div style={{ marginTop: 8 }}>
                          <button className="btn btn-outline btn-xs" onClick={backToShared}>{t('กลับไปใช้ค่ากลาง')}</button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, opacity: editable ? 1 : .55 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
                    <input type="checkbox" checked={cfg.enabled}
                      onChange={e => setCfg(c => ({ ...c, enabled: e.target.checked }))} />
                    {t('แสดงปกหลัง')}
                  </label>

                  <Group title={t('หน้าตา')}>
                    <Field label={t('ชุดสี')}>
                      <Choice t={t} value={cfg.theme} onPick={pick('theme')}
                        options={Object.entries(THEMES).map(([k, v]) => [k, v.label])} />
                    </Field>
                    <Field label={t('การจัดวาง')}>
                      <Choice t={t} value={cfg.align} onPick={pick('align')} options={Object.entries(ALIGN_LABELS)} />
                    </Field>
                    <Field label={t('ลำดับ')}>
                      <Choice t={t} value={cfg.order} onPick={pick('order')} options={Object.entries(ORDER_LABELS)} />
                    </Field>
                    <Field label={t('ขนาดโลโก้')}>
                      <Choice t={t} value={cfg.logo} onPick={pick('logo')}
                        options={Object.keys(LOGO_SIZES).map(k => [k, LOGO_LABELS[k] || k])} />
                    </Field>
                  </Group>

                  <Group title={t('ข้อความที่ลูกค้าเห็น')}>
                    <Field label={t('ข้อความหลัก')}>
                      <input className="form-control" value={cfg.heading} onChange={set('heading')} maxLength={90} />
                    </Field>
                    <Field label={t('ข้อความรอง')} hint={t('เว้นบรรทัดได้')}>
                      <textarea className="form-control" rows={2} value={cfg.note} onChange={set('note')} maxLength={200} />
                    </Field>
                    <Field label={t('ข้อความบนปุ่ม')}>
                      <input className="form-control" value={cfg.button} onChange={set('button')} maxLength={40} />
                    </Field>
                  </Group>

                  <Group title={t('ช่องกรอก')}>
                    <div className="form-row">
                      <Field label={t('ช่องชื่อ')}>
                        <input className="form-control" value={cfg.phName} onChange={set('phName')} maxLength={40} />
                      </Field>
                      <Field label={t('ช่องเบอร์')}>
                        <input className="form-control" value={cfg.phPhone} onChange={set('phPhone')} maxLength={40} />
                      </Field>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 8 }}>
                      <input type="checkbox" checked={cfg.showInterest}
                        onChange={e => setCfg(c => ({ ...c, showInterest: e.target.checked }))} />
                      {t('มีช่องที่สาม')}
                    </label>
                    {cfg.showInterest && (
                      <Field label={t('ช่องที่สาม')}>
                        <input className="form-control" value={cfg.phInterest} onChange={set('phInterest')} maxLength={60} />
                      </Field>
                    )}
                  </Group>

                  <Group title={t('ลิงก์ติดต่อ')}>
                    <Field label={t('ลิงก์ LINE')}
                      hint={cfg.line
                        ? `${t('กดแล้วไปที่')}: ${lineHref(cfg.line)}`
                        : t('ใส่ @ไอดี หรือวางลิงก์เต็มจากแอป LINE — เว้นว่างไว้ ลิงก์นี้จะไม่ขึ้น')}>
                      <input className="form-control" value={cfg.line} onChange={set('line')} placeholder="@worldtech" />
                    </Field>
                    <Field label={t('ข้อความลิงก์ LINE')}>
                      <input className="form-control" value={cfg.lineText} onChange={set('lineText')} maxLength={60} />
                    </Field>
                    <div className="form-row">
                      <Field label={t('เบอร์โทร')}>
                        <input className="form-control" value={cfg.phone} onChange={set('phone')} placeholder="02-000-0000" />
                      </Field>
                      <Field label={t('คำนำหน้าเบอร์')}>
                        <input className="form-control" value={cfg.phoneText} onChange={set('phoneText')} maxLength={20} />
                      </Field>
                    </div>
                  </Group>

                  <Group title={t('หลังลูกค้ากดส่ง')}>
                    <Field label={t('หัวข้อ')}>
                      <input className="form-control" value={cfg.doneTitle} onChange={set('doneTitle')} maxLength={60} />
                    </Field>
                    <Field label={t('ข้อความ')}>
                      <textarea className="form-control" rows={2} value={cfg.doneText} onChange={set('doneText')} maxLength={200} />
                    </Field>
                  </Group>
                </fieldset>
              </div>

              {/* พรีวิวเป็นคอมโพเนนต์ตัวจริงของหน้าลูกค้า — onSubmitLead เป็นตัวหลอก ไม่ส่งข้อมูลจริง */}
              <div style={{ flex: '1 1 300px', minWidth: 0, maxWidth: 330, position: 'sticky', top: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 8 }}>
                  {t('พรีวิว')}
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', height: 470, background: '#f5f7fa' }}>
                  <CatalogGalleryView
                    catalog={PREVIEW_CATALOG} images={PREVIEW_IMAGE}
                    backCover={{ ...cfg, enabled: true }}
                    onSubmitLead={async () => { throw new Error('พรีวิว — ยังไม่ส่งข้อมูลจริง') }}
                    mobile
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6 }}>
                  {t('กด › เพื่อเลื่อนไปดูปกหลัง — อัปเดตตามที่แก้ทันที')}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t('ยกเลิก')}</button>
          <button className="btn btn-primary" disabled={!cfg || saving || !editable} onClick={save}>
            {saving ? t('กำลังบันทึก...') : t('บันทึก')}
          </button>
        </div>
      </div>
    </div>
  )
}
