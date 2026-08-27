import { useEffect, useState } from 'react'
import {
  listCatalogs, createCatalog, updateCatalog, deleteCatalog, duplicateCatalog,
  fetchCatalogImageCounts, fetchCatalogViewCounts, slugify, isValidSlug, isTempSlug,
} from '../lib/api'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import CatalogLinkModal from './CatalogLinkModal'
import CatalogViewReport from './CatalogViewReport'

// รายการแคตตาล็อกทั้งหมด — ทุกคนใน CRM เห็นทุกอัน เพราะเป็นสื่อการตลาดร่วม ยิ่งใช้ซ้ำยิ่งดี
// ฝ่ายบัญชีเห็นแต่แก้ไม่ได้ (บังคับที่ RLS ฝั่งนี้แค่ซ่อนปุ่ม)

export const CATALOG_STATUS_LABEL = {
  draft: 'ฉบับร่าง', published: 'เผยแพร่แล้ว', hidden: 'ซ่อนอยู่', archived: 'เก็บเข้าคลัง',
}
const STATUS_BADGE = {
  draft: 'badge-gray', published: 'badge-green', hidden: 'badge-yellow', archived: 'badge-gray',
}

export function StatusBadge({ status, t }) {
  return <span className={`badge ${STATUS_BADGE[status] || 'badge-gray'}`}>{t(CATALOG_STATUS_LABEL[status] || status)}</span>
}

function NewCatalogModal({ existingSlugs, onClose, onSave }) {
  const { t } = useLanguage()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // slug เดาจากชื่อให้จนกว่าคนกรอกจะแก้เอง — ชื่อไทยแปลงเป็น ascii ไม่ได้ ต้องพิมพ์เอง
  const onName = (v) => {
    setName(v)
    if (!slugTouched) setSlug(slugify(v))
  }

  const dup = slug && existingSlugs.includes(slug)
  const badFormat = slug && !isValidSlug(slug)
  const canSave = name.trim() && slug && !dup && !badFormat && !saving

  const submit = async () => {
    if (!canSave) return
    setSaving(true)
    try { await onSave({ catalog_name: name.trim(), catalog_slug: slug, description: description.trim() }) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{t('สร้างแคตตาล็อก')}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label required">{t('ชื่อแคตตาล็อก')}</label>
            <input className="form-control" value={name} onChange={e => onName(e.target.value)} autoFocus
              placeholder={t('เช่น ตู้เย็นสำหรับโรงแรม')} />
          </div>
          <div className="form-group">
            <label className="form-label required">{t('ลิงก์ (slug)')}</label>
            <input className="form-control" value={slug}
              onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()) }}
              placeholder="hotel-refrigerator" />
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
              {t('จะกลายเป็นลิงก์')}: <code>/catalog/{slug || '...'}</code>
            </div>
            {badFormat && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
              {t('ใช้ได้เฉพาะ a-z, 0-9 และขีดกลาง ห้ามขึ้นหรือลงท้ายด้วยขีด')}
            </div>}
            {dup && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
              {t('ลิงก์นี้มีคนใช้แล้ว เปลี่ยนเป็นชื่ออื่น')}
            </div>}
            {name.trim() && !slug && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 4 }}>
              {t('ชื่อภาษาไทยแปลงเป็นลิงก์อัตโนมัติไม่ได้ พิมพ์เป็นภาษาอังกฤษเองในช่องนี้ เช่น hotel-refrigerator')}
            </div>}
          </div>
          <div className="form-group">
            <label className="form-label">{t('คำอธิบายสั้นๆ')}</label>
            <textarea className="form-control" rows={2} value={description} onChange={e => setDescription(e.target.value)}
              placeholder={t('ลูกค้าจะเห็นข้อความนี้ใต้ชื่อแคตตาล็อก')} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t('ยกเลิก')}</button>
          <button className="btn btn-primary" disabled={!canSave} onClick={submit}>
            {saving ? t('กำลังบันทึก...') : t('สร้างแล้วอัปโหลดรูป')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Catalogs({ perm, currentUser, onOpen }) {
  const { toast, confirm } = useUi()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState(new Map())
  const [views, setViews] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [linkFor, setLinkFor] = useState(null)
  const [showReport, setShowReport] = useState(false)
  const canManage = !perm?.isFinance

  const load = async () => {
    setLoading(true)
    try {
      const [cs, ic, vc] = await Promise.all([listCatalogs(), fetchCatalogImageCounts(), fetchCatalogViewCounts()])
      setRows(cs); setCounts(ic); setViews(vc)
    } catch (e) { toast('โหลดแคตตาล็อกไม่สำเร็จ: ' + e.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onCreate = async (fields) => {
    try {
      const row = await createCatalog({ ...fields, createdByName: currentUser?.name })
      setShowNew(false)
      onOpen(row.id)   // เข้าหน้าอัปโหลดรูปต่อทันที สร้างเปล่าๆ ทิ้งไว้ไม่มีประโยชน์
    } catch (e) { toast('สร้างไม่สำเร็จ: ' + e.message, 'error') }
  }

  const togglePublish = async (c) => {
    const next = c.status === 'published' ? 'hidden' : 'published'
    if (next === 'published' && !(counts.get(c.id) > 0)) {
      toast('ยังไม่มีรูปที่แสดงในแคตตาล็อกนี้ อัปโหลดรูปก่อนเผยแพร่', 'error'); return
    }
    if (next === 'published' && isTempSlug(c.catalog_slug)) {
      toast('ยังเป็นลิงก์ชั่วคราว กด "แก้ไข" เพื่อตั้งลิงก์ (slug) ใหม่ก่อนเผยแพร่', 'error'); return
    }
    try {
      await updateCatalog(c.id, { status: next }, { name: currentUser?.name, id: currentUser?.id })
      toast(next === 'published' ? 'เผยแพร่แล้ว ส่งลิงก์ให้ลูกค้าได้เลย' : 'ซ่อนแล้ว ลูกค้าเปิดลิงก์จะไม่เห็นรูป', 'success')
      load()
    } catch (e) { toast('เปลี่ยนสถานะไม่สำเร็จ: ' + e.message, 'error') }
  }

  const onCopy = async (c) => {
    try {
      const copy = await duplicateCatalog(c, currentUser?.name)
      toast('คัดลอกแล้ว — กรุณาตั้งลิงก์ (slug) ใหม่ก่อนเผยแพร่', 'success')
      onOpen(copy.id)
    } catch (e) { toast('คัดลอกไม่สำเร็จ: ' + e.message, 'error') }
  }

  const onDelete = async (c) => {
    if (!(await confirm(`ลบแคตตาล็อก "${c.catalog_name}"? รูปทั้งหมดจะถูกลบไปด้วย และลิงก์ที่เคยส่งลูกค้าจะใช้ไม่ได้อีก`))) return
    try { await deleteCatalog(c.id); toast('ลบแล้ว', 'success'); load() }
    catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error') }
  }

  return (
    <div className="list-view">
      <div className="section-header">
        <div>
          <div className="section-title">
            {t('แคตตาล็อกออนไลน์')} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} {t('รายการ')})</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 2 }}>
            {t('สร้างแคตตาล็อกจากรูปภาพและแชร์ลิงก์ให้ลูกค้า')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowReport(true)}>{t('รายงานยอดเปิดดู')}</button>
          {canManage && <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ {t('สร้างแคตตาล็อก')}</button>}
        </div>
      </div>

      {showNew && <NewCatalogModal existingSlugs={rows.map(r => r.catalog_slug)} onClose={() => setShowNew(false)} onSave={onCreate} />}
      {linkFor && <CatalogLinkModal catalog={linkFor} onClose={() => setLinkFor(null)} />}
      {showReport && <CatalogViewReport onClose={() => setShowReport(false)} />}

      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>{t('ชื่อแคตตาล็อก')}</th>
                  <th>{t('ลิงก์ (slug)')}</th>
                  <th>{t('สถานะ')}</th>
                  <th style={{ textAlign: 'right' }}>{t('รูปที่แสดง')}</th>
                  <th style={{ textAlign: 'right' }}>{t('เปิดดู')}</th>
                  <th>{t('แก้ไขล่าสุด')}</th>
                  <th>{t('การจัดการ')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.id}>
                    <td style={{ width: 56 }}>
                      {c.cover_image_url
                        ? <img src={c.cover_image_url} alt="" loading="lazy"
                            style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
                        : <div style={{ width: 46, height: 46, borderRadius: 4, background: 'var(--gray-bg)', border: '1px dashed var(--border)' }} />}
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--navy)', cursor: 'pointer' }} onClick={() => onOpen(c.id)}>
                      {c.catalog_name}
                      {c.description && <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>{c.description}</div>}
                    </td>
                    <td style={{ fontSize: 12, color: isTempSlug(c.catalog_slug) ? '#c05621' : 'var(--text-light)' }}>
                      /catalog/{c.catalog_slug}
                      {isTempSlug(c.catalog_slug) && <div style={{ fontSize: 11 }}>{t('ลิงก์ชั่วคราว — ยังไม่ได้ตั้ง')}</div>}
                    </td>
                    <td><StatusBadge status={c.status} t={t} /></td>
                    <td style={{ textAlign: 'right' }}>{counts.get(c.id) || 0}</td>
                    <td style={{ textAlign: 'right' }}>{views.get(c.id) || 0}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-light)' }}>
                      {c.updated_at ? new Date(c.updated_at).toLocaleDateString('th-TH') : '-'}
                      {c.updated_by_name && <div style={{ fontSize: 11 }}>{c.updated_by_name}</div>}
                    </td>
                    <td className="td-actions">
                      <button className="btn btn-outline btn-xs" onClick={() => onOpen(c.id)}>{t(canManage ? 'แก้ไข' : 'ดู')}</button>
                      {canManage && <button className="btn btn-outline btn-xs" onClick={() => onCopy(c)}>{t('คัดลอก')}</button>}
                      <button className="btn btn-outline btn-xs" onClick={() => setLinkFor(c)}>{t('คัดลอกลิงก์')}</button>
                      {canManage && (
                        <button className={`btn btn-xs ${c.status === 'published' ? 'btn-secondary' : 'btn-success'}`} onClick={() => togglePublish(c)}>
                          {t(c.status === 'published' ? 'ยกเลิกเผยแพร่' : 'เผยแพร่')}
                        </button>
                      )}
                      {(perm?.isAdmin || (canManage && c.created_by === perm?.userId)) &&
                        <button className="btn btn-danger btn-xs" onClick={() => onDelete(c)}>{t('ลบ')}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <div>{loading ? t('กำลังโหลด...') : t('ยังไม่มีแคตตาล็อก')}</div>
              {!loading && canManage && (
                <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 6 }}>
                  {t('กด "สร้างแคตตาล็อก" แล้วอัปโหลดรูป Artwork ที่กราฟิกทำไว้ได้เลย')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
