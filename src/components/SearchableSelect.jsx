import { useEffect, useRef, useState } from 'react'
import { useLanguage } from './LanguageContext'

// dropdown เลือกตัวเลือกที่พิมพ์ค้นหาได้ — ใช้แทน <select> ธรรมดาตอนตัวเลือกมีเยอะ (เช่น รายชื่อบริษัท/สินค้า) กันต้องเลื่อนหา
// ใส่ freeText + onFreeTextChange เพื่อเปิดโหมดพิมพ์ข้อความเองได้ในช่องเดียวกัน (ใช้กับรายการใบเสนอราคาที่แก้ชื่อที่พิมพ์ได้ ไม่ต้องมีอีกช่องแยก)
//
// โหมดพิมพ์เองเคยมีกับดัก: เลือกสินค้าไปแล้วพิมพ์ทับ ชื่อรายการเปลี่ยนแต่สินค้าที่ผูกไว้ยังเป็นตัวเดิม
// และไม่มีอะไรบอกบนหน้าจอ บรรทัด "ค่าขนส่ง" จึงลากต้นทุนของสินค้าที่ผูกค้างไว้เข้าไปคิด Margin ด้วย
// เคยลองโชว์ป้ายใต้ช่องว่าผูกกับสินค้าตัวไหน แต่มันขึ้นทุกบรรทัดจนรก และข้อความยาว
// ดันตารางกว้างจนล้นกรอบโมดัล จึงย้ายการกันพลาดไปไว้ตอนกดบันทึกแทน (ดู itemProductLink.js)
// ซึ่งเด้งเฉพาะตอนเจอปัญหาจริง ไม่รบกวนตอนกรอกปกติ

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
      {open && !disabled && (
        <div className="card searchable-select-menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 260, overflow: 'auto', marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,.18)' }}>
          {value && <div className="searchable-option" style={{ color: 'var(--text-light)' }} onMouseDown={clear}>{t('-- ไม่เลือก --')}</div>}
          {filtered.length
            ? filtered.map(o => (
              // ชื่อยาวโดนตัดด้วย ... ที่ CSS — ใส่ title ไว้ให้เอาเมาส์ไปวางแล้วอ่านชื่อเต็มได้
              <div key={getOptionValue(o)} className="searchable-option" title={getOptionLabel(o)} onMouseDown={() => pick(o)}>
                {getOptionLabel(o)}
              </div>
            ))
            : <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-light)' }}>{t(editable ? 'ไม่พบสินค้าที่ตรงกัน — จะใช้ข้อความนี้เป็นชื่อรายการที่พิมพ์เอง' : 'ไม่พบรายการที่ตรงกัน')}</div>}
        </div>
      )}
    </div>
  )
}
