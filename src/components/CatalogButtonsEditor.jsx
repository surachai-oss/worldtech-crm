import { useEffect, useRef, useState } from 'react'
import {
  listCatalogButtons, addCatalogButton, updateCatalogButton, deleteCatalogButton,
  reorderCatalogButtons, uploadCatalogButtonImage, CATALOG_BUTTON_KINDS,
} from '../lib/api'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// ตัวจัดการปุ่มติดต่อ ใช้ได้ทั้งชุดกลาง (catalogId = null) และชุดของแคตตาล็อกเดียว
// ทุกอย่างของปุ่มแก้ได้จากหน้าจอ — ข้อความ ปลายทาง สี รูป ลำดับ
// ตั้งใจไม่ผูกกับ LINE หรือช่องทางใดช่องทางหนึ่ง วันที่เปลี่ยนช่องทางจะได้ไม่ต้องแก้โค้ด

const PRESETS = [
  { name: 'LINE',     bg: '#06C755', fg: '#FFFFFF' },
  { name: 'น้ำเงิน',  bg: '#1B76FF', fg: '#FFFFFF' },
  { name: 'ส้ม',      bg: '#F9631F', fg: '#FFFFFF' },
  { name: 'เหลือง',   bg: '#FFDD42', fg: '#15233B' },
  { name: 'ขาว/ขอบ',  bg: '#FFFFFF', fg: '#1B76FF' },
]

const BLANK = { label: '', kind: 'link', url: '', image_url: '', image_path: '', bg_color: '#1B76FF', text_color: '#FFFFFF' }

function ButtonRow({ row, first, last, onPatch, onFlush, onDelete, onMove, busy }) {
  const { t } = useLanguage()
  const { toast } = useUi()
  const [uploading, setUploading] = useState(false)
  const kind = CATALOG_BUTTON_KINDS.find(k => k.value === row.kind) || CATALOG_BUTTON_KINDS[0]

  const pickImage = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const img = await uploadCatalogButtonImage(file)
      onPatch({ image_url: img.image_url, image_path: img.image_path }, true)
    } catch (e) { toast('อัปโหลดรูปไม่สำเร็จ: ' + e.message, 'error') }
    finally { setUploading(false) }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8, background: row.is_visible ? '#fff' : '#fafbfc' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {/* พรีวิวปุ่มจริงตรงนี้เลย เปลี่ยนสีแล้วเห็นทันทีว่าอ่านออกมั้ย */}
        <span style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          height: 38, borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '0 10px',
          background: row.bg_color, color: row.text_color,
          border: `1.5px solid ${row.bg_color.toUpperCase() === '#FFFFFF' ? row.text_color : row.bg_color}`,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        }}>
          {row.kind === 'image' && row.image_url && <img src={row.image_url} alt="" style={{ height: 24, width: 24, objectFit: 'cover', borderRadius: 4 }} />}
          {row.label || t('(ยังไม่ใส่ข้อความ)')}
        </span>
        <button className="btn btn-outline btn-xs" disabled={first || busy} onClick={() => onMove(-1)} title={t('เลื่อนขึ้น')}>↑</button>
        <button className="btn btn-outline btn-xs" disabled={last || busy} onClick={() => onMove(1)} title={t('เลื่อนลง')}>↓</button>
        <button className="btn btn-outline btn-xs" onClick={() => onPatch({ is_visible: !row.is_visible }, true)}>
          {t(row.is_visible ? 'ซ่อน' : 'แสดง')}
        </button>
        <button className="btn btn-danger btn-xs" onClick={onDelete}>{t('ลบ')}</button>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ marginBottom: 8 }}>
          <label className="form-label">{t('ข้อความบนปุ่ม')}</label>
          <input className="form-control" value={row.label} onChange={e => onPatch({ label: e.target.value })}
            onBlur={onFlush} placeholder={t('เช่น ทักแชท LINE')} />
        </div>
        <div className="form-group" style={{ marginBottom: 8 }}>
          <label className="form-label">{t('ชนิด')}</label>
          <select className="form-control" value={row.kind} onChange={e => onPatch({ kind: e.target.value }, true)}>
            {CATALOG_BUTTON_KINDS.map(k => <option key={k.value} value={k.value}>{t(k.label)}</option>)}
          </select>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 8 }}>
        <label className="form-label">{row.kind === 'image' ? t('ลิงก์ตอนกดรูป (ไม่ใส่ก็ได้)') : t('ปลายทาง')}</label>
        <input className="form-control" value={row.url || ''} onChange={e => onPatch({ url: e.target.value })}
          onBlur={onFlush} placeholder={kind.placeholder} />
      </div>

      {row.kind === 'image' && (
        <div className="form-group" style={{ marginBottom: 8 }}>
          <label className="form-label">{t('รูปที่จะโชว์ (เช่น QR code)')}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {row.image_url && <img src={row.image_url} alt="" style={{ width: 48, height: 48, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} />}
            <input className="form-control" type="file" accept="image/jpeg,image/png,image/webp"
              disabled={uploading} onChange={e => { pickImage(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          {uploading && <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>{t('กำลังอัปโหลด...')}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 11, color: 'var(--text-light)' }}>{t('สีพื้น')}
          <input type="color" value={row.bg_color} onChange={e => onPatch({ bg_color: e.target.value })} onBlur={onFlush}
            style={{ marginLeft: 6, verticalAlign: 'middle', width: 34, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 4 }} />
        </label>
        <label style={{ fontSize: 11, color: 'var(--text-light)' }}>{t('สีตัวอักษร')}
          <input type="color" value={row.text_color} onChange={e => onPatch({ text_color: e.target.value })} onBlur={onFlush}
            style={{ marginLeft: 6, verticalAlign: 'middle', width: 34, height: 24, padding: 0, border: '1px solid var(--border)', borderRadius: 4 }} />
        </label>
        {PRESETS.map(p => (
          <button key={p.name} className="btn btn-outline btn-xs"
            onClick={() => onPatch({ bg_color: p.bg, text_color: p.fg }, true)}>{t(p.name)}</button>
        ))}
      </div>
    </div>
  )
}

export default function CatalogButtonsEditor({ catalogId = null, onChanged }) {
  const { toast, confirm } = useUi()
  const { t } = useLanguage()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // สำเนาแถวล่าสุดแบบอ่านได้ทันที ไม่ต้องรอ React render (ใช้ตอนพิมพ์รัวๆ)
  const rowsRef = useRef([])
  const setLocal = (next) => { rowsRef.current = next; setRows(next) }

  const load = async () => {
    setLoading(true)
    try {
      const r = await listCatalogButtons(catalogId)
      rowsRef.current = r
      setRows(r)
    }
    catch (e) { toast('โหลดปุ่มไม่สำเร็จ: ' + e.message, 'error') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [catalogId]) // eslint-disable-line react-hooks/exhaustive-deps

  // แจ้งพาเรนต์ (พรีวิว) เฉพาะตอนค่านิ่งแล้ว ไม่ใช่ทุกตัวอักษร
  // ทุกครั้งที่แจ้ง CatalogBuilder จะ re-render ทั้งหน้า รวมพาเนลรูปที่อาจมีเป็นสิบๆ แถว
  // พิมพ์ทีละตัวแล้ววาดใหม่ทั้งหน้าทุกตัว คือสาเหตุที่ช่องกรอกหน่วงจนเหมือนค้าง
  const announce = (next) => { setLocal(next); onChanged?.(next) }

  const add = async () => {
    setBusy(true)
    try {
      const order = rowsRef.current.length ? Math.max(...rowsRef.current.map(r => r.display_order)) + 1 : 0
      const row = await addCatalogButton(catalogId, { ...BLANK, label: '', display_order: order })
      announce([...rowsRef.current, row])
    } catch (e) { toast('เพิ่มปุ่มไม่สำเร็จ: ' + e.message, 'error') }
    finally { setBusy(false) }
  }

  // แก้แล้วบันทึกให้เอง ไม่มีปุ่มบันทึกแยก — แต่ "ไม่ใช่ทุกตัวอักษร"
  // ถ้ายิง update ทุก keystroke ช่องกรอกจะหน่วงจนพิมพ์ไม่ทัน และถ้ามีคำขอไหนพลาด
  // load() จะดึงค่าเก่ากลับมาทับสิ่งที่เพิ่งพิมพ์ กลายเป็นเหมือนช่องกรอกค้าง
  // ช่องข้อความจึงหน่วงไว้ 700ms แล้วค่อยเขียน (หรือเขียนทันทีตอนคลิกออกจากช่อง)
  // ส่วนตัวเลือก/สี/ซ่อน-แสดง กดครั้งเดียวจบ เขียนทันทีได้เลย
  const pending = useRef(new Map())

  const flush = (id) => {
    const e = pending.current.get(id)
    if (!e) return
    clearTimeout(e.timer)
    pending.current.delete(id)
    onChanged?.(rowsRef.current)   // ค่านิ่งแล้ว ค่อยให้พรีวิวตามมา
    updateCatalogButton(id, e.patch).catch(err => {
      toast('บันทึกไม่สำเร็จ: ' + err.message, 'error'); load()
    })
  }

  const patch = (row, p, immediate = false) => {
    // อ่านจาก ref ไม่ใช่ state — พิมพ์เร็วๆ หลายตัวติดกันก่อน React จะ render รอบใหม่
    // ถ้าอิง state ตัวอักษรก่อนหน้าจะถูกทับหาย
    const next = rowsRef.current.map(r => (r.id === row.id ? { ...r, ...p } : r))
    if (immediate) announce(next)
    else setLocal(next)   // พิมพ์อยู่ — อัปเดตแค่ในตัวแก้ไข ยังไม่กวนพรีวิว
    const e = pending.current.get(row.id) || { patch: {}, timer: null }
    clearTimeout(e.timer)
    e.patch = { ...e.patch, ...p }
    pending.current.set(row.id, e)
    if (immediate) { flush(row.id); return }
    e.timer = setTimeout(() => flush(row.id), 700)
  }

  // ออกจากหน้าไปทั้งที่ยังมีตัวที่รอเขียนอยู่ = ต้องส่งให้จบ ไม่งั้นตัวอักษรท้ายๆ หาย
  useEffect(() => () => {
    pending.current.forEach((e, id) => {
      clearTimeout(e.timer)
      updateCatalogButton(id, e.patch).catch(() => {})
    })
    pending.current.clear()
  }, [])

  const remove = async (row) => {
    if (!(await confirm(`ลบปุ่ม "${row.label || 'ไม่มีชื่อ'}"?`))) return
    pending.current.delete(row.id)   // ไม่ต้องเขียนค่าที่ค้างอยู่ของแถวที่กำลังจะลบ
    try { await deleteCatalogButton(row); announce(rows.filter(r => r.id !== row.id)) }
    catch (e) { toast('ลบไม่สำเร็จ: ' + e.message, 'error') }
  }

  const move = async (index, delta) => {
    const to = index + delta
    if (to < 0 || to >= rows.length) return
    rows.forEach(r => flush(r.id))
    const next = [...rows]
    ;[next[index], next[to]] = [next[to], next[index]]
    announce(next)
    try { await reorderCatalogButtons(next.map(r => r.id)) }
    catch (e) { toast('จัดลำดับไม่สำเร็จ: ' + e.message, 'error'); load() }
  }

  if (loading) return <div style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('กำลังโหลด...')}</div>

  return (
    <div>
      {rows.map((row, i) => (
        <ButtonRow key={row.id} row={row} first={i === 0} last={i === rows.length - 1} busy={busy}
          onPatch={(p, now) => patch(row, p, now)} onFlush={() => flush(row.id)}
          onDelete={() => remove(row)} onMove={d => move(i, d)} />
      ))}
      {!rows.length && (
        <div style={{ fontSize: 12, color: 'var(--text-light)', marginBottom: 8 }}>
          {t('ยังไม่มีปุ่ม — เพิ่มได้ตามต้องการ จะเป็นลิงก์ เบอร์โทร อีเมล หรือรูป QR ก็ได้')}
        </div>
      )}
      <button className="btn btn-outline btn-sm" disabled={busy} onClick={add}>+ {t('เพิ่มปุ่ม')}</button>
    </div>
  )
}
