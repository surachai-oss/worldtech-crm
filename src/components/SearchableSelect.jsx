import { useEffect, useRef, useState } from 'react'
import { useLanguage } from './LanguageContext'

// dropdown เลือกตัวเลือกที่พิมพ์ค้นหาได้ — ใช้แทน <select> ธรรมดาตอนตัวเลือกมีเยอะ (เช่น รายชื่อบริษัท/สินค้า) กันต้องเลื่อนหา
// ใส่ freeText + onFreeTextChange เพื่อเปิดโหมดพิมพ์ข้อความเองได้ในช่องเดียวกัน (ใช้กับรายการใบเสนอราคาที่แก้ชื่อที่พิมพ์ได้ ไม่ต้องมีอีกช่องแยก)
//
// โหมดพิมพ์เองเคยมีกับดัก: เลือกสินค้าไปแล้วพิมพ์ทับ ชื่อรายการเปลี่ยนแต่สินค้าที่ผูกไว้ยังเป็นตัวเดิม
// และไม่มีอะไรบอกบนหน้าจอ บรรทัด "ค่าขนส่ง" จึงลากต้นทุนของสินค้าที่ผูกค้างไว้เข้าไปคิด Margin ด้วย
// แก้โดยโชว์ป้ายบอกเสมอว่าบรรทัดนี้ผูกกับสินค้าตัวไหน กดกากบาทเพื่อปลดได้ และถ้าชื่อที่พิมพ์
// ไม่เข้าพวกกับชื่อสินค้าเลย ป้ายจะเปลี่ยนเป็นสีส้มพร้อมเตือน

// ชื่อที่พิมพ์ "เข้าพวก" กับสินค้าที่ผูกไว้ไหม — เทียบหยาบๆ พอให้จับเคสที่ผิดชัดๆ อย่าง "ค่าขนส่ง" ผูกกับไส้กรอง
// ไม่ได้เข้มงวดถึงขั้นต้องตรงเป๊ะ เพราะแก้ชื่อสินค้านิดหน่อยตอนเสนอราคาเป็นเรื่องปกติ
const looksRelated = (text, label) => {
  const a = (text || '').trim().toLowerCase()
  const b = (label || '').trim().toLowerCase()
  if (!a || !b) return true
  if (a.length < 3) return true
  return b.includes(a) || a.includes(b) || b.split(/[\s-]+/).filter(w => w.length >= 3).some(w => a.includes(w))
}
export default function SearchableSelect({ options, value, onChange, placeholder = '-- เลือก --', getOptionLabel, getOptionValue = (o) => o.id, disabled, freeText, onFreeTextChange }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const editable = onFreeTextChange !== undefined

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = options.find(o => getOptionValue(o) === value)
  const displayValue = editable ? (freeText || '') : (selected ? getOptionLabel(selected) : '')
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter(o => getOptionLabel(o).toLowerCase().includes(q)) : options

  const related = !editable || !selected || looksRelated(displayValue, getOptionLabel(selected))
  const pick = (o) => { onChange(getOptionValue(o)); setQuery(''); setOpen(false) }
  const clear = () => { onChange(''); setQuery(''); setOpen(false) }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className="form-control"
        value={open ? query : displayValue}
        onChange={e => {
          const v = e.target.value
          setQuery(v)
          if (editable) onFreeTextChange(v)
          if (!open) setOpen(true)
        }}
        onFocus={e => { setQuery(editable ? displayValue : ''); setOpen(true); if (editable) e.target.select() }}
        placeholder={t(placeholder)}
        disabled={disabled}
        autoComplete="off"
      />
      {/* ป้ายบอกว่าบรรทัดนี้ผูกกับสินค้าตัวไหนอยู่ — โชว์เฉพาะโหมดพิมพ์เองที่เคยทำให้ผูกค้างโดยไม่รู้ตัว */}
      {editable && selected && !open && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '3px 7px', borderRadius: 6,
          fontSize: 11, lineHeight: 1.4,
          background: related ? 'var(--gray-bg)' : '#fffaf0',
          border: `1px solid ${related ? 'var(--border)' : '#f0c36d'}`,
          color: related ? 'var(--text-light)' : '#c05621',
        }}>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {related
              ? `${t('ผูกกับสินค้า')}: ${getOptionLabel(selected)}`
              : `${t('ชื่อรายการไม่ตรงกับสินค้าที่ผูกไว้')}: ${getOptionLabel(selected)} — ${t('ถ้าไม่ได้ขายสินค้าตัวนี้ ให้กดกากบาทปลดออก ไม่งั้นต้นทุนของสินค้าตัวนี้จะถูกนำไปคิดกำไร')}`}
          </span>
          <button type="button" title={t('ปลดการผูกสินค้า ให้เป็นรายการที่พิมพ์ชื่อเอง')}
            onClick={() => onChange('')}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>
      )}
      {open && !disabled && (
        <div className="card searchable-select-menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 260, overflow: 'auto', marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,.18)' }}>
          {value && <div className="searchable-option" style={{ color: 'var(--text-light)' }} onMouseDown={clear}>{t('-- ไม่เลือก --')}</div>}
          {filtered.length
            ? filtered.map(o => (
              <div key={getOptionValue(o)} className="searchable-option" onMouseDown={() => pick(o)}>
                {getOptionLabel(o)}
              </div>
            ))
            : <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-light)' }}>{t(editable ? 'ไม่พบสินค้าที่ตรงกัน — จะใช้ข้อความนี้เป็นชื่อรายการที่พิมพ์เอง' : 'ไม่พบรายการที่ตรงกัน')}</div>}
        </div>
      )}
    </div>
  )
}
