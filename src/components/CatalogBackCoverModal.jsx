import { useEffect, useState } from 'react'
import {
  saveCatalogOwnBackCover, resolveCatalogBackCover,
  uploadBackCoverLogo, lineHref,
  PRESETS, COLOR_FIELDS, ALIGN_LABELS, BLOCK_LABELS, TEXT_STYLES, LOGO_MIN, LOGO_MAX, newBlock,
} from '../lib/api'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'
import CatalogGalleryView from './CatalogGalleryView'

// หน้าตั้งค่าปกหลังของแคตตาล็อกแต่ละเล่ม — ผู้สร้างเล่มนั้นดูแลเอง ไม่มีการตั้งค่าส่วนกลางแล้ว
// เปิดครั้งแรกจะได้ค่าเริ่มต้นมาให้ แก้แล้วบันทึกจะผูกกับเล่มนี้เท่านั้น
//
// ปกหลังคือลำดับของบล็อก ผู้ออกแบบสลับลำดับ ซ่อน หรือเพิ่มบล็อกได้เอง
// ช่องชื่อและช่องหมายเลขโทรศัพท์ลบไม่ได้ เพราะข้อมูลต้องบันทึกเข้าหน้าผู้ติดต่อต่อได้

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
  caption: 'หน้าสินค้า (ภาพตัวอย่าง)',
}]

const CSS = `
.bc-sec{border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px;background:#fff}
.bc-sec-h{font-size:13px;font-weight:600;color:var(--navy);margin-bottom:4px}
.bc-sec-d{font-size:11.5px;color:var(--text-light);line-height:1.65;margin-bottom:12px}
.bc-blk{border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px;background:#fff}
.bc-blk.off{background:#fafbfc;opacity:.6}
.bc-blk-h{display:flex;align-items:center;gap:6px;margin-bottom:8px}
.bc-blk-t{flex:1;min-width:0;font-size:12px;font-weight:600;color:var(--navy)}
.bc-colors{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}
.bc-color{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--text-light)}
.bc-color input[type=color]{width:32px;height:26px;padding:0;border:1px solid var(--border);border-radius:5px;flex:none}
.bc-color input[type=text]{width:100%;min-width:0;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:5px;font-family:monospace}
`

function Section({ title, desc, children }) {
  return (
    <section className="bc-sec">
      <div className="bc-sec-h">{title}</div>
      {desc && <div className="bc-sec-d">{desc}</div>}
      {children}
    </section>
  )
}

function Choice({ options, value, onPick }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(([v, label]) => (
        <button key={v} type="button"
          className={`btn btn-xs ${value === v ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => onPick(v)}>{label}</button>
      ))}
    </div>
  )
}

function BlockEditor({ block, first, last, locked, onPatch, onMove, onRemove }) {
  const { toast } = useUi()
  const [busy, setBusy] = useState(false)

  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    try { onPatch({ src: await uploadBackCoverLogo(file) }) }
    catch (e) { toast('อัปโหลดไม่สำเร็จ: ' + e.message, 'error') }
    finally { setBusy(false) }
  }

  return (
    <div className={`bc-blk${block.visible === false ? ' off' : ''}`}>
      <div className="bc-blk-h">
        <span className="bc-blk-t">{BLOCK_LABELS[block.type]}</span>
        <button className="btn btn-outline btn-xs" disabled={first} onClick={() => onMove(-1)} title="เลื่อนขึ้น">↑</button>
        <button className="btn btn-outline btn-xs" disabled={last} onClick={() => onMove(1)} title="เลื่อนลง">↓</button>
        <button className="btn btn-outline btn-xs" onClick={() => onPatch({ visible: block.visible === false })}>
          {block.visible === false ? 'แสดง' : 'ซ่อน'}
        </button>
        {!locked && <button className="btn btn-danger btn-xs" onClick={onRemove}>ลบ</button>}
      </div>

      {block.type === 'logo' && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 190px', minWidth: 0 }}>
            <label className="form-label">ไฟล์โลโก้</label>
            <input className="form-control" type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml"
              disabled={busy} onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
              {busy ? 'กำลังอัปโหลด...' : block.src ? 'ใช้ไฟล์ที่อัปโหลด' : 'ยังไม่ได้อัปโหลด จะใช้โลโก้บริษัท'}
              {block.src && <> · <button className="btn btn-outline btn-xs" onClick={() => onPatch({ src: '' })}>กลับไปใช้โลโก้บริษัท</button></>}
            </div>
          </div>
          <div style={{ width: 128 }}>
            <label className="form-label">ความสูง (พิกเซล)</label>
            <input className="form-control" type="number" min={LOGO_MIN} max={LOGO_MAX} value={block.size}
              onChange={e => onPatch({ size: e.target.value })}
              onBlur={e => onPatch({ size: Math.min(LOGO_MAX, Math.max(LOGO_MIN, Number(e.target.value) || 48)) })} />
          </div>
        </div>
      )}

      {block.type === 'text' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <Choice value={block.style} onPick={v => onPatch({ style: v })} options={Object.entries(TEXT_STYLES)} />
          </div>
          <textarea className="form-control" rows={2} value={block.text}
            onChange={e => onPatch({ text: e.target.value })} placeholder="ข้อความที่ลูกค้าเห็น" />
        </>
      )}

      {block.type === 'field' && (
        <>
          <input className="form-control" value={block.label} onChange={e => onPatch({ label: e.target.value })}
            placeholder="ข้อความในช่อง เช่น ชื่อผู้ติดต่อ" />
          <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
            {block.role === 'name' ? 'ช่องนี้บันทึกเป็นชื่อผู้ติดต่อ ลบไม่ได้'
              : block.role === 'phone' ? 'ช่องนี้บันทึกเป็นหมายเลขโทรศัพท์ ลบไม่ได้'
                : 'ข้อมูลจากช่องนี้จะแนบไปกับผู้ติดต่อในช่องหมายเหตุ'}
          </div>
        </>
      )}

      {block.type === 'submit' && (
        <input className="form-control" value={block.label} onChange={e => onPatch({ label: e.target.value })}
          placeholder="ข้อความบนปุ่ม" />
      )}

      {block.type === 'line' && (
        <>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 6 }}>
              <label className="form-label">ลิงก์หรือไอดี LINE</label>
              <input className="form-control" value={block.url} onChange={e => onPatch({ url: e.target.value })} placeholder="@worldtech" />
            </div>
            <div className="form-group" style={{ marginBottom: 6 }}>
              <label className="form-label">ข้อความที่แสดง</label>
              <input className="form-control" value={block.text} onChange={e => onPatch({ text: e.target.value })} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-light)', wordBreak: 'break-all' }}>
            {block.url ? `กดแล้วเปิด: ${lineHref(block.url)}` : 'ยังไม่ได้ใส่ลิงก์ ลิงก์นี้จะไม่แสดงบนปกหลัง'}
          </div>
        </>
      )}

      {block.type === 'phone' && (
        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">หมายเลขโทรศัพท์</label>
            <input className="form-control" value={block.number} onChange={e => onPatch({ number: e.target.value })} placeholder="02-000-0000" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">คำนำหน้า</label>
            <input className="form-control" value={block.text} onChange={e => onPatch({ text: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function CatalogBackCoverModal({ catalog, onClose, onSaved }) {
  const { toast } = useUi()
  const { t } = useLanguage()

  const [cfg, setCfg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    resolveCatalogBackCover(catalog)
      .then(r => { if (alive) setCfg(r.cfg) })
      .catch(e => { if (alive) toast('โหลดการตั้งค่าไม่สำเร็จ: ' + e.message, 'error') })
    return () => { alive = false }
  }, [catalog, toast])

  const editable = true
  const setColor = (k) => (v) => setCfg(c => ({ ...c, colors: { ...c.colors, [k]: v } }))

  const patchBlock = (id, p) =>
    setCfg(c => ({ ...c, blocks: c.blocks.map(b => (b.id === id ? { ...b, ...p } : b)) }))

  const moveBlock = (i, d) => setCfg(c => {
    const to = i + d
    if (to < 0 || to >= c.blocks.length) return c
    const blocks = [...c.blocks]
    ;[blocks[i], blocks[to]] = [blocks[to], blocks[i]]
    return { ...c, blocks }
  })

  const addBlock = (type) => setCfg(c => ({ ...c, blocks: [...c.blocks, newBlock(type)] }))
  const removeBlock = (id) => setCfg(c => ({ ...c, blocks: c.blocks.filter(b => b.id !== id) }))

  const save = async () => {
    setSaving(true)
    try {
      await saveCatalogOwnBackCover(catalog.id, cfg)
      toast('บันทึกปกหลังเรียบร้อยแล้ว', 'success')
      onSaved?.()
      onClose()
    } catch (e) {
      const msg = /row-level security|permission/i.test(e.message) ? 'ไม่มีสิทธิ์แก้ไขการตั้งค่านี้' : e.message
      toast('บันทึกไม่สำเร็จ: ' + msg, 'error')
    } finally { setSaving(false) }
  }

  const lockedIds = cfg
    ? cfg.blocks.filter(b => b.type === 'field' && (b.role === 'name' || b.role === 'phone')).map(b => b.id)
    : []

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 960, width: '96vw' }}>
        <style>{CSS}</style>
        <div className="modal-header">
          <div className="modal-title">
            ปกหลัง — {catalog.catalog_name}
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ maxHeight: '78vh', overflowY: 'auto', background: 'var(--gray-bg)' }}>
          {!cfg ? <div className="empty-state">{t('กำลังโหลด...')}</div> : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'flex-start' }}>

              <div style={{ flex: '1 1 380px', minWidth: 0 }}>
                <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, opacity: editable ? 1 : .55 }}>

                  <Section title="การแสดงผล" desc="เปิดหรือปิดปกหลังทั้งหน้า และกำหนดชุดสีกับการจัดวาง">
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
                      <input type="checkbox" checked={cfg.enabled}
                        onChange={e => setCfg(c => ({ ...c, enabled: e.target.checked }))} />
                      แสดงปกหลังท้ายแคตตาล็อก
                    </label>

                    <div className="form-group">
                      <label className="form-label">ชุดสีสำเร็จรูป</label>
                      <Choice value={null} onPick={k => setCfg(c => ({ ...c, colors: { ...PRESETS[k].colors } }))}
                        options={Object.entries(PRESETS).map(([k, v]) => [k, v.label])} />
                      <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 4 }}>
                        กดเพื่อเติมค่าสีทั้งชุด จากนั้นปรับแต่ละสีต่อได้
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">กำหนดสีเอง</label>
                      <div className="bc-colors">
                        {COLOR_FIELDS.map(([k, label]) => (
                          <label className="bc-color" key={k}>
                            <input type="color" value={cfg.colors[k]} onChange={e => setColor(k)(e.target.value)} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              {label}
                              <input type="text" value={cfg.colors[k]} onChange={e => setColor(k)(e.target.value)} />
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">การจัดวางข้อความ</label>
                      <Choice value={cfg.align} onPick={v => setCfg(c => ({ ...c, align: v }))}
                        options={Object.entries(ALIGN_LABELS).map(([k, v]) => [k, v])} />
                    </div>
                  </Section>

                  <Section title="เนื้อหาบนปกหลัง"
                    desc="เรียงลำดับด้วยปุ่มลูกศร ซ่อนบล็อกที่ยังไม่ใช้ หรือเพิ่มบล็อกใหม่ได้ตามต้องการ ลำดับบนหน้าจอคือลำดับที่ลูกค้าเห็น">
                    {cfg.blocks.map((b, i) => (
                      <BlockEditor key={b.id} block={b} first={i === 0} last={i === cfg.blocks.length - 1}
                        locked={lockedIds.includes(b.id)}
                        onPatch={p => patchBlock(b.id, p)} onMove={d => moveBlock(i, d)}
                        onRemove={() => removeBlock(b.id)} />
                    ))}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {['text', 'field', 'line', 'phone', 'logo', 'submit'].map(type => (
                        <button key={type} className="btn btn-outline btn-sm" onClick={() => addBlock(type)}>
                          + {BLOCK_LABELS[type]}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title="ข้อความหลังส่งข้อมูล" desc="หน้าที่ลูกค้าเห็นทันทีหลังกดส่งข้อมูลสำเร็จ">
                    <div className="form-group">
                      <label className="form-label">หัวข้อ</label>
                      <input className="form-control" value={cfg.done.title} maxLength={60}
                        onChange={e => setCfg(c => ({ ...c, done: { ...c.done, title: e.target.value } }))} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">รายละเอียด</label>
                      <textarea className="form-control" rows={2} value={cfg.done.text} maxLength={200}
                        onChange={e => setCfg(c => ({ ...c, done: { ...c.done, text: e.target.value } }))} />
                    </div>
                  </Section>
                </fieldset>
              </div>

              {/* ตัวอย่างใช้คอมโพเนนต์เดียวกับหน้าลูกค้าจริง onSubmitLead เป็นตัวจำลอง ไม่บันทึกข้อมูล */}
              <div style={{ flex: '1 1 300px', minWidth: 0, maxWidth: 330, position: 'sticky', top: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-light)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 8 }}>
                  ตัวอย่าง
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', height: 470, background: '#f5f7fa' }}>
                  <CatalogGalleryView
                    catalog={PREVIEW_CATALOG} images={PREVIEW_IMAGE}
                    backCover={{ ...cfg, enabled: true }}
                    onSubmitLead={async () => { throw new Error('เป็นตัวอย่าง ยังไม่บันทึกข้อมูลจริง') }}
                    mobile
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-light)', marginTop: 6, lineHeight: 1.65 }}>
                  กดปุ่ม › เพื่อเลื่อนไปยังปกหลัง ตัวอย่างจะเปลี่ยนตามที่แก้ไขทันที
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>ยกเลิก</button>
          <button className="btn btn-primary" disabled={!cfg || saving || !editable} onClick={save}>
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
