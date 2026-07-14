import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMyNotifications, fetchUnreadNotificationCount, markNotificationRead, markAllNotificationsRead } from '../lib/api'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

const POLL_MS = 30000

// เสียงเตือน "ติ๊ง" สั้นๆ สังเคราะห์ด้วย Web Audio API — ไม่ต้องใช้ไฟล์เสียงแนบมาในโปรเจกต์
function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
    osc.onended = () => ctx.close()
  } catch {
    // เบราว์เซอร์บล็อกเสียงถ้ายังไม่มี interaction — ปล่อยผ่านเงียบๆ ไม่กระทบการแจ้งเตือนหลัก
  }
}

function timeAgo(ts, lang) {
  const diffSec = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (lang === 'en') {
    if (diffSec < 60) return 'just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`
    return `${Math.floor(diffSec / 86400)} day(s) ago`
  }
  if (diffSec < 60) return 'เมื่อสักครู่'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} นาทีที่แล้ว`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} ชั่วโมงที่แล้ว`
  return `${Math.floor(diffSec / 86400)} วันที่แล้ว`
}

// กระดิ่งแจ้งเตือนมุมบน — โพลนับที่ยังไม่อ่านทุก 30 วิ, กดเปิดค่อยโหลดรายการ (ไม่โพลรายการเต็มถี่เกินไป)
export default function NotificationBell({ onNav }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [unread, setUnread] = useState(0)
  const prevUnreadRef = useRef(null) // null = ยังไม่เคยโหลด (กันเสียงดังตอนเปิดแอปครั้งแรก)

  const loadCount = useCallback(() => {
    fetchUnreadNotificationCount().then(n => {
      if (prevUnreadRef.current !== null && n > prevUnreadRef.current) playChime()
      prevUnreadRef.current = n
      setUnread(n)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    loadCount()
    const timerId = setInterval(loadCount, POLL_MS)
    return () => clearInterval(timerId)
  }, [loadCount])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      try { setRows(await fetchMyNotifications()) }
      catch (e) { toast(lang === 'en' ? 'Failed to load notifications: ' + e.message : 'โหลดการแจ้งเตือนไม่สำเร็จ: ' + e.message, 'error') }
    }
  }

  const onClickItem = async (n) => {
    if (!n.read_at) {
      markNotificationRead(n.id).catch(() => {})
      setUnread(u => { const next = Math.max(0, u - 1); prevUnreadRef.current = next; return next })
      setRows(rs => rs.map(r => r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r))
    }
    setOpen(false)
    if (n.link_view) onNav(n.link_view)
  }

  const markAll = async (e) => {
    e.stopPropagation()
    markAllNotificationsRead().catch(() => {})
    prevUnreadRef.current = 0
    setUnread(0)
    setRows(rs => rs.map(r => ({ ...r, read_at: r.read_at || new Date().toISOString() })))
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn btn-outline btn-sm"
        onClick={toggle}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{ position: 'relative' }}
      >
        {t('แจ้งเตือน')}
        {unread > 0 && (
          <span className="badge badge-red" style={{ position: 'absolute', top: -6, right: -6, fontSize: 10, padding: '1px 5px', lineHeight: 1.4 }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="search-results" style={{ left: 'auto', right: 0, width: 320 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
            <b style={{ fontSize: 13 }}>{t('การแจ้งเตือน')}</b>
            {unread > 0 && <button className="btn btn-outline btn-xs" onMouseDown={markAll}>{t('อ่านทั้งหมด')}</button>}
          </div>
          {rows.length ? rows.map(n => (
            <div key={n.id} className="search-item" onMouseDown={() => onClickItem(n)} style={{ opacity: n.read_at ? 0.55 : 1, cursor: 'pointer' }}>
              <div>
                <div className="search-item-label">{n.title}</div>
                <div className="search-item-sub">{n.body}</div>
                <div style={{ fontSize: 10, color: 'var(--text-light)', marginTop: 2 }}>{timeAgo(n.created_at, lang)}</div>
              </div>
            </div>
          )) : <div style={{ padding: '12px 14px', color: 'var(--text-light)', fontSize: 13 }}>{t('ไม่มีการแจ้งเตือน')}</div>}
        </div>
      )}
    </div>
  )
}
