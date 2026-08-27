import { useEffect, useRef, useState } from 'react'
import {
  fetchCatalog, updateCatalog, listCatalogImages, uploadCatalogImage, updateCatalogImage,
  softDeleteCatalogImage, setCatalogCover, reorderCatalogImages, fetchCatalogMonthlyViews,
  isValidSlug, catalogPublicUrl, CATALOG_STATUS, CATALOG_ACCEPT, MAX_CATALOG_IMAGE_SIZE, MAX_CATALOG_PDF_SIZE, isPdf,
  resolveCatalogButtons, listCatalogButtons, addCatalogButton, deleteCatalogButton,
} from '../lib/api'
import CatalogButtonsEditor from './CatalogButtonsEditor'
import { pdfToImageFiles } from '../lib/pdfToImages'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import CatalogGalleryView from './CatalogGalleryView'
import CatalogLinkModal from './CatalogLinkModal'
import { StatusBadge, CATALOG_STATUS_LABEL } from './Catalogs'

// หน้าจัดการแคตตาล็อก — ซ้าย: ตั้งค่า / กลาง: จัดการรูป / ขวา: พรีวิวมือถือ
// พรีวิวใช้คอมโพเนนต์ตัวเดียวกับหน้าลูกค้าจริง (CatalogGalleryView) จะได้ไม่มีวันเพี้ยนจากกัน
// จอแคบจะไหลลงเป็น ตั้งค่า > จัดการรูป > พรีวิว ตามลำดับ

const LAYOUT_CSS = `
.cb-grid{display:grid;grid-template-columns:1fr;gap:14px;align-items:start}
@media (min-width:1100px){ .cb-grid{grid-template-columns:300px minmax(0,1fr) 340px} }
.cb-panel{background:#fff;border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
.cb-panel-h{padding:12px 14px;border-bottom:1px solid var(--border);font-weight:600;font-size:13px;color:var(--navy);
  display:flex;align-items:center;justify-content:space-between;gap:8px}
.cb-panel-b{padding:14px}
.cb-img{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;padding:12px;border:1px solid var(--border);
  border-radius:8px;margin-bottom:10px;background:#fff}
.cb-img.hidden{background:#fafbfc;opacity:.62}
.cb-thumb{width:96px;height:96px;object-fit:contain;background:var(--gray-bg);border-radius:6px;border:1px solid var(--border)}
.cb-img-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.cb-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.cb-preview-frame{border:1px solid var(--border);border-radius:12px;overflow:hidden;height:480px;background:#f5f7fa}
.cb-drop{border:2px dashed var(--border);border-radius:10px;padding:22px 14px;text-align:center;color:var(--text-light);font-size:13px;cursor:pointer}
.cb-drop.over{border-color:var(--yellow);background:#fffdf3;color:var(--text)}
`

function Panel({ title, right, children, style }) {
  return (
    <div className="cb-panel" style={style}>
      <div className="cb-panel-h"><span>{title}</span>{right}</div>
      <div className="cb-panel-b">{children}</div>
    </div>
  )
}

export default function CatalogBuilder({ catalogId, perm, currentUser, onBack }) {
  const { toast, confirm } = useUi()
  const { t } = useLanguage()
  const canManage = !perm?.isFinance

  const [cat, setCat] = useState(null)
  const [images, setImages] = useState([])
  const [months, setMonths] = useState([])
  // ปุ่มติดต่อที่หน้าลูกค้าจะเห็นจริง (ของแคตตาล็อกนี้ ถ้าไม่มีก็ชุดกลาง) — ใช้ทั้งพรีวิวและบอกสถานะ
  const [btnState, setBtnState] = useState({ buttons: [], usingShared: true })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [uploading, setUploading] = useState(null) // { done, total }
  const [dragOver, setDragOver] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [showFull, setShowFull] = useState(false)
  const fileRef = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const [c, imgs, mv, bs] = await Promise.all([
        fetchCatalog(catalogId), listCatalogImages(catalogId), fetchCatalogMonthlyViews(catalogId, 12),
        resolveCatalogButtons(catalogId),
      ])
      setCat(c); setImages(imgs); setMonths(mv); setBtnState(bs); setDirty(false)
    } catch (e) { toast('โหลดแคตตาล็อกไม่สำเร็จ: ' + e.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [catalogId]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => { setDirty(true); setCat(c => ({ ...c, [k]: e.target.value })) }
  const actor = { name: currentUser?.name, id: currentUser?.id }

  const save = async () => {
    if (!cat.catalog_name?.trim()) { toast('กรุณากรอกชื่อแคตตาล็อก', 'error'); return }
    if (!isValidSlug(cat.catalog_slug || '')) { toast('ลิงก์ (slug) ใช้ได้เฉพาะ a-z, 0-9 และขีดกลาง', 'error'); return }
    setSaving(true)
    try {
      await updateCatalog(cat.id, {
        catalog_name: cat.catalog_name.trim(),
        catalog_slug: cat.catalog_slug.trim().toLowerCase(),
        description: cat.description?.trim() || null,
        status: cat.status,
      }, actor)
      setDirty(false)
      toast('บันทึกแล้ว', 'success')
      load()
    } catch (e) {
      // unique violation ของ slug เป็นเคสที่เจอบ่อยสุด แปลให้เป็นภาษาคนแทนข้อความดิบของ postgres
      const msg = /duplicate key|unique/i.test(e.message) ? 'ลิงก์ (slug) นี้มีคนใช้แล้ว เปลี่ยนเป็นชื่ออื่น' : e.message
      toast('บันทึกไม่สำเร็จ: ' + msg, 'error')
    } finally { setSaving(false) }
  }

  // อัปโหลดทีละไฟล์ ไม่ยิงพร้อมกัน — ได้ตัวเลขความคืบหน้าที่ตรงจริง
  // และไฟล์ที่พังไม่ไปล้มไฟล์อื่นที่อัปสำเร็จแล้ว
  // PDF ถูกแตกเป็นรูปรายหน้าก่อนในเบราว์เซอร์ แล้วอัปเหมือนรูปธรรมดา (ดู pdfToImages.js)
  const doUpload = async (files) => {
    const list = Array.from(files || []).filter(Boolean)
    if (!list.length) return
    const failed = []

    // แตก PDF ตามลำดับที่เลือกมา ไม่ยกไปต่อท้าย — คนเลือกไฟล์เรียงมาแบบไหนก็ควรได้แบบนั้น
    const queue = []
    for (const file of list) {
      if (!isPdf(file)) { queue.push(file); continue }
      if (file.size > MAX_CATALOG_PDF_SIZE) {
        failed.push(`${file.name}: ไฟล์ PDF ใหญ่เกิน ${Math.round(MAX_CATALOG_PDF_SIZE / 1024 / 1024)}MB`); continue
      }
      try {
        setUploading({ phase: 'pdf', done: 0, total: 0, label: file.name })
        const { files: pages, skipped } = await pdfToImageFiles(file, (done, total) =>
          setUploading({ phase: 'pdf', done, total, label: file.name }))
        queue.push(...pages)
        if (skipped) failed.push(`${file.name}: ใช้แค่ ${pages.length} หน้าแรก (ไฟล์ยาวเกินที่รองรับ)`)
      } catch (e) {
        failed.push(`${file.name}: แปลง PDF ไม่สำเร็จ — ${e.message}`)
      }
    }

    if (!queue.length) {
      setUploading(null)
      toast(failed[0] || 'ไม่มีไฟล์ที่อัปโหลดได้', 'error')
      return
    }

    setUploading({ phase: 'upload', done: 0, total: queue.length, label: '' })
    let order = images.length ? Math.max(...images.map(i => i.display_order)) + 1 : 0
    let firstNew = null
    let okCount = 0
    for (const file of queue) {
      try {
        const row = await uploadCatalogImage(catalogId, file, { displayOrder: order++, uploadedBy: currentUser?.id })
        if (!firstNew) firstNew = row
        okCount++
      } catch (e) { failed.push(e.message || file.name) }
      setUploading(u => ({ ...u, done: u.done + 1 }))
    }
    // รูปแรกของแคตตาล็อกตั้งเป็นปกให้เลย ถ้ายังไม่มีปก — จะได้มีรูปขึ้นตอนแชร์ลิงก์โดยไม่ต้องกดเอง
    if (firstNew && !images.some(i => i.is_cover)) {
      await setCatalogCover(firstNew.id).catch(() => {})
    }
    setUploading(null)
    if (failed.length) toast(`${okCount ? `อัปโหลด ${okCount} รูปแล้ว แต่` : ''}มีปัญหา ${failed.length} รายการ: ${failed[0]}`, 'error')
    else toast(`อัปโหลด ${okCount} รูปแล้ว`, 'success')
    load()
  }

  // ข้อความบอกสถานะระหว่างทำงาน — แปลง PDF กับอัปโหลดใช้เวลาคนละแบบ ต้องบอกให้ตรงว่าตอนนี้อยู่ขั้นไหน
  const busyLabel = !uploading ? ''
    : uploading.phase === 'pdf'
      ? `${t('กำลังแปลง PDF')} ${uploading.label} ${uploading.total ? `${uploading.done}/${uploading.total}` : ''}`
      : `${t('กำลังอัปโหลด')} ${uploading.done}/${uploading.total}`

  const saveCaption = async (img, value) => {
    const next = value.trim() || null
    if ((img.caption || null) === next) return
    try {
      await updateCatalogImage(img.id, { caption: next })
      setImages(rows => rows.map(r => (r.id === img.id ? { ...r, caption: next } : r)))
    } catch (e) { toast('บันทึกคำบรรยายไม่สำเร็จ: ' + e.message, 'error') }
  }

  const toggleVisible = async (img) => {
    try {
      await updateCatalogImage(img.id, { is_visible: !img.is_visible })
      setImages(rows => rows.map(r => (r.id === img.id ? { ...r, is_visible: !img.is_visible } : r)))
    } catch (e) { toast('เปลี่ยนไม่สำเร็จ: ' + e.message, 'error') }
  }

  const makeCover = async (img) => {
    try { await setCatalogCover(img.id); toast('ตั้งเป็นรูปปกแล้ว', 'success'); load() }
    catch (e) { toast('ตั้งรูปปกไม่สำเร็จ: ' + e.message, 'error') }
  }

  const removeImage = async (img) => {
    if (!(await confirm('ลบรูปนี้ออกจากแคตตาล็อก?'))) return
    try { await softDeleteCatalogImage(img); toast('ลบแล้ว', 'success'); load() }
    catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error') }
  }

  const move = async (index, delta) => {
    const to = index + delta
    if (to < 0 || to >= images.length) return
    const next = [...images]
    ;[next[index], next[to]] = [next[to], next[index]]
    setImages(next)   // ขยับบนจอก่อน แล้วค่อยเขียนลงฐาน ไม่ให้ปุ่มหน่วง
    try { await reorderCatalogImages(catalogId, next.map(i => i.id)) }
    catch (e) { toast('จัดลำดับไม่สำเร็จ: ' + e.message, 'error'); load() }
  }

  // "ตั้งปุ่มเอง" = คัดลอกชุดกลางมาเป็นของแคตตาล็อกนี้ ให้เริ่มจากของที่มีอยู่แล้ว ไม่ใช่หน้าว่าง
  const useOwnButtons = async () => {
    try {
      const shared = await listCatalogButtons(null)
      for (const [i, b] of shared.entries()) {
        await addCatalogButton(catalogId, {
          label: b.label, kind: b.kind, url: b.url, image_url: b.image_url,
          bg_color: b.bg_color, text_color: b.text_color, is_visible: b.is_visible, display_order: i,
        })
      }
      if (!shared.length) await addCatalogButton(catalogId, { label: '', kind: 'link', display_order: 0 })
      setBtnState(await resolveCatalogButtons(catalogId))
    } catch (e) { toast('ตั้งปุ่มเองไม่สำเร็จ: ' + e.message, 'error') }
  }

  const backToShared = async () => {
    if (!(await confirm('กลับไปใช้ปุ่มชุดกลาง? ปุ่มที่ตั้งไว้เฉพาะแคตตาล็อกนี้จะถูกลบ'))) return
    try {
      for (const b of await listCatalogButtons(catalogId)) await deleteCatalogButton(b)
      setBtnState(await resolveCatalogButtons(catalogId))
    } catch (e) { toast('เปลี่ยนไม่สำเร็จ: ' + e.message, 'error') }
  }

  if (loading || !cat) {
    return <div className="list-view"><div className="empty-state">{t('กำลังโหลด...')}</div></div>
  }

  const visible = images.filter(i => i.is_visible)
  const totalViews = months.reduce((n, m) => n + m.views, 0)
  const previewCatalog = { name: cat.catalog_name, description: cat.description || '' }
  const previewImages = visible.map(i => ({ url: i.image_url, caption: i.caption || '' }))

  return (
    <div className="list-view">
      <style>{LAYOUT_CSS}</style>

      <div className="section-header">
        <div>
          <button className="btn btn-outline btn-xs" onClick={onBack} style={{ marginBottom: 6 }}>← {t('กลับไปรายการแคตตาล็อก')}</button>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {cat.catalog_name} <StatusBadge status={cat.status} t={t} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2 }}>
            /catalog/{cat.catalog_slug} · {t('รูปที่แสดง')} {visible.length}/{images.length} · {t('เปิดดู')} {totalViews} ({t('12 เดือนล่าสุด')})
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowFull(true)}>{t('ดูเต็มหน้าจอ')}</button>
          <button className="btn btn-outline" onClick={() => setShowLink(true)}>{t('คัดลอกลิงก์')}</button>
          {canManage && (
            <button className="btn btn-primary" disabled={saving || !dirty} onClick={save}>
              {saving ? t('กำลังบันทึก...') : dirty ? t('บันทึกการตั้งค่า') : t('บันทึกแล้ว')}
            </button>
          )}
        </div>
      </div>

      {showLink && <CatalogLinkModal catalog={cat} onClose={() => setShowLink(false)} />}
      {showFull && (
        <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setShowFull(false) }}>
          <div className="modal" style={{ maxWidth: 860, width: '95vw' }}>
            <div className="modal-header">
              <div className="modal-title">{t('พรีวิวหน้าลูกค้า')}</div>
              <button className="modal-close" onClick={() => setShowFull(false)}>×</button>
            </div>
            <div className="modal-body" style={{ padding: 0, maxHeight: '78vh', overflowY: 'auto' }}>
              <CatalogGalleryView catalog={previewCatalog} images={previewImages} buttons={btnState.buttons} />
            </div>
          </div>
        </div>
      )}

      <div className="cb-grid">
        {/* ===== ซ้าย: ตั้งค่าแคตตาล็อก ===== */}
        <Panel title={t('ตั้งค่าแคตตาล็อก')}>
          <div className="form-group">
            <label className="form-label required">{t('ชื่อแคตตาล็อก')}</label>
            <input className="form-control" value={cat.catalog_name || ''} onChange={set('catalog_name')} disabled={!canManage} />
          </div>
          <div className="form-group">
            <label className="form-label required">{t('ลิงก์ (slug)')}</label>
            <input className="form-control" value={cat.catalog_slug || ''} disabled={!canManage}
              onChange={e => { setDirty(true); setCat(c => ({ ...c, catalog_slug: e.target.value.toLowerCase() })) }} />
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
              {t('เปลี่ยน slug แล้วลิงก์เดิมที่เคยส่งลูกค้าจะใช้ไม่ได้ทันที')}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('คำอธิบายสั้นๆ')}</label>
            <textarea className="form-control" rows={3} value={cat.description || ''} onChange={set('description')} disabled={!canManage} />
          </div>

          <div className="form-group">
            <label className="form-label">{t('สถานะ')}</label>
            <select className="form-control" value={cat.status} onChange={set('status')} disabled={!canManage}>
              {CATALOG_STATUS.map(s => <option key={s} value={s}>{t(CATALOG_STATUS_LABEL[s])}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
              {t('ลูกค้าเปิดลิงก์เห็นรูปได้เฉพาะสถานะ "เผยแพร่แล้ว" เท่านั้น')}
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: .4, margin: '14px 0 8px' }}>
            {t('ยอดเปิดดูรายเดือน')}
          </div>
          {months.length ? months.map(m => (
            <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0' }}>
              <span style={{ color: 'var(--text-light)', width: 62, flexShrink: 0 }}>{m.month}</span>
              {/* แถบยาวตามสัดส่วนเดือนที่สูงสุด — เห็นแนวโน้มได้เร็วกว่าอ่านตัวเลขเรียงกัน */}
              <span style={{ flex: 1, height: 6, background: 'var(--gray-bg)', borderRadius: 3, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', borderRadius: 3, background: 'var(--navy)',
                  width: `${Math.max(4, Math.round(m.views / Math.max(...months.map(x => x.views)) * 100))}%` }} />
              </span>
              <b style={{ width: 34, textAlign: 'right' }}>{m.views}</b>
            </div>
          )) : <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('ยังไม่มีคนเปิดดู')}</div>}
        </Panel>

        {/* ===== กลาง: จัดการรูป + ปุ่มติดต่อ ซ้อนกันในคอลัมน์เดียว =====
             ต้องห่อเป็นกล่องเดียว ไม่ใช่วาง grid-column เอง — พอวางเองแล้ว auto-placement
             จะดันพาเนลพรีวิวหล่นไปแถวสอง กลายเป็นอยู่ล่างสุดแทนที่จะอยู่ขวาบน */}
        <div className="cb-col">
        <Panel
          title={`${t('รูปในแคตตาล็อก')} (${images.length})`}
          right={canManage && (
            <button className="btn btn-primary btn-xs" disabled={!!uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? busyLabel : `+ ${t('อัปโหลดรูป / PDF')}`}
            </button>
          )}
        >
          <input ref={fileRef} type="file" accept={CATALOG_ACCEPT} multiple style={{ display: 'none' }}
            onChange={e => { doUpload(e.target.files); e.target.value = '' }} />

          {canManage && (
            <div
              className={`cb-drop${dragOver ? ' over' : ''}`}
              style={{ marginBottom: 12 }}
              onClick={() => !uploading && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); if (!uploading) doUpload(e.dataTransfer.files) }}
            >
              {uploading
                ? `${busyLabel} — ${t('อย่าเพิ่งปิดหน้านี้')}`
                : t('ลากไฟล์มาวางตรงนี้ หรือคลิกเพื่อเลือก — JPG, PNG, WebP (ไม่เกิน 10MB ต่อรูป) หรือ PDF ทั้งเล่ม ระบบจะแตกเป็นหน้าๆ ให้เอง')}
            </div>
          )}

          {images.length === 0 && !uploading && (
            <div className="empty-state">
              <div>{t('ยังไม่มีรูปในแคตตาล็อกนี้')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 6 }}>
                {t('อัปโหลดรูป Artwork หรือไฟล์ PDF ที่กราฟิกทำไว้แล้วได้เลย ไม่ต้องกรอกราคาหรือสเปก')}
              </div>
            </div>
          )}

          {images.map((img, i) => (
            <div className={`cb-img${img.is_visible ? '' : ' hidden'}`} key={img.id}>
              <div>
                <img className="cb-thumb" src={img.image_url} alt="" loading="lazy" />
                <div style={{ fontSize: 10, color: 'var(--text-light)', textAlign: 'center', marginTop: 4 }}>#{i + 1}</div>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, wordBreak: 'break-all' }}>{img.image_name || t('รูปภาพ')}</span>
                  {img.is_cover && <span className="badge badge-yellow">{t('รูปปก')}</span>}
                  {!img.is_visible && <span className="badge badge-gray">{t('ซ่อนอยู่')}</span>}
                </div>
                <input className="form-control" defaultValue={img.caption || ''} disabled={!canManage}
                  placeholder={t('คำบรรยายใต้รูป (ไม่ใส่ก็ได้)')} style={{ fontSize: 12 }}
                  onBlur={e => canManage && saveCaption(img, e.target.value)} />
                {canManage && (
                  <div className="cb-img-actions">
                    <button className="btn btn-outline btn-xs" disabled={i === 0} onClick={() => move(i, -1)} title={t('เลื่อนขึ้น')}>↑</button>
                    <button className="btn btn-outline btn-xs" disabled={i === images.length - 1} onClick={() => move(i, 1)} title={t('เลื่อนลง')}>↓</button>
                    <button className="btn btn-outline btn-xs" onClick={() => toggleVisible(img)}>
                      {t(img.is_visible ? 'ซ่อนรูป' : 'แสดงรูป')}
                    </button>
                    {!img.is_cover && <button className="btn btn-outline btn-xs" onClick={() => makeCover(img)}>{t('ตั้งเป็นปก')}</button>}
                    <button className="btn btn-danger btn-xs" onClick={() => removeImage(img)}>{t('ลบ')}</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </Panel>

        {canManage && (
          <Panel
            title={t('ปุ่มติดต่อ')}
            right={btnState.usingShared
              ? <button className="btn btn-outline btn-xs" onClick={useOwnButtons}>{t('ตั้งปุ่มเฉพาะแคตตาล็อกนี้')}</button>
              : <button className="btn btn-outline btn-xs" onClick={backToShared}>{t('กลับไปใช้ปุ่มชุดกลาง')}</button>}
          >
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 10, lineHeight: 1.7 }}>
              {btnState.usingShared
                ? t('ตอนนี้ใช้ "ปุ่มชุดกลาง" ที่ใช้ร่วมกับแคตตาล็อกอื่น — แก้ที่นี่จะเปลี่ยนทุกแคตตาล็อกที่ใช้ชุดกลาง')
                : t('แคตตาล็อกนี้ใช้ปุ่มของตัวเอง ไม่เกี่ยวกับชุดกลางแล้ว')}
            </div>
            <CatalogButtonsEditor
              catalogId={btnState.usingShared ? null : catalogId}
              onChanged={(rows) => setBtnState(s => ({ ...s, buttons: rows }))}
            />
          </Panel>
        )}
        </div>

        {/* ===== ขวา: พรีวิวมือถือ ===== */}
        <Panel title={t('พรีวิวบนมือถือ')}>
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 8 }}>
            {t('นี่คือสิ่งที่ลูกค้าจะเห็น — อัปเดตตามที่แก้ทันที (ยังไม่ต้องบันทึกก็เห็น)')}
          </div>
          <div className="cb-preview-frame">
            <CatalogGalleryView catalog={previewCatalog} images={previewImages} buttons={btnState.buttons} mobile />
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setShowFull(true)}>{t('ดูเต็มหน้าจอ')}</button>
            <a className="btn btn-outline btn-sm" style={{ flex: 1, textAlign: 'center' }}
              href={catalogPublicUrl(cat.catalog_slug)} target="_blank" rel="noreferrer">{t('เปิดลิงก์จริง')}</a>
          </div>
          {cat.status !== 'published' && (
            <div style={{ fontSize: 11, color: '#c05621', marginTop: 8 }}>
              {t('ยังไม่เผยแพร่ — เปิดลิงก์จริงตอนนี้ลูกค้าจะเห็นข้อความว่ายังไม่เปิดให้เข้าชม')}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 8 }}>
            {t('ขนาดไฟล์สูงสุด')} — {t('รูป')} {Math.round(MAX_CATALOG_IMAGE_SIZE / 1024 / 1024)}MB · PDF {Math.round(MAX_CATALOG_PDF_SIZE / 1024 / 1024)}MB
          </div>
        </Panel>
      </div>
    </div>
  )
}
