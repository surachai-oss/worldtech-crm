import { useEffect, useRef, useState } from 'react'

// dropdown เลือกตัวเลือกที่พิมพ์ค้นหาได้ — ใช้แทน <select> ธรรมดาตอนตัวเลือกมีเยอะ (เช่น รายชื่อบริษัท/สินค้า) กันต้องเลื่อนหา
export default function SearchableSelect({ options, value, onChange, placeholder = '-- เลือก --', getOptionLabel, getOptionValue = (o) => o.id, disabled }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const selected = options.find(o => getOptionValue(o) === value)
  const q = query.trim().toLowerCase()
  const filtered = q ? options.filter(o => getOptionLabel(o).toLowerCase().includes(q)) : options

  const pick = (o) => { onChange(getOptionValue(o)); setQuery(''); setOpen(false) }
  const clear = () => { onChange(''); setQuery(''); setOpen(false) }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        className="form-control"
        value={open ? query : (selected ? getOptionLabel(selected) : '')}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => { setQuery(''); setOpen(true) }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />
      {open && !disabled && (
        <div className="card searchable-select-menu" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 220, overflow: 'auto', marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,.18)' }}>
          {value && <div className="searchable-option" style={{ color: 'var(--text-light)' }} onMouseDown={clear}>-- ไม่เลือก --</div>}
          {filtered.length
            ? filtered.map(o => (
              <div key={getOptionValue(o)} className="searchable-option" onMouseDown={() => pick(o)}>
                {getOptionLabel(o)}
              </div>
            ))
            : <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-light)' }}>ไม่พบรายการที่ตรงกัน</div>}
        </div>
      )}
    </div>
  )
}
