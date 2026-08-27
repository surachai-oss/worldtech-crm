import { useEffect, useState } from 'react'
import { fetchPublicCatalog, logCatalogView, submitCatalogLead } from '../lib/api'
import CatalogGalleryView, { CatalogStateMessage } from './CatalogGalleryView'
import '../App.css'

// หน้าแคตตาล็อกที่ลูกค้าเปิด — ไม่ต้อง login ไม่มี Sidebar ไม่มีอะไรของหลังบ้านโผล่
// ข้อมูลมาจาก Netlify Function ที่คัดคอลัมน์ไว้แล้ว หน้านี้จึงไม่มีทางแสดงต้นทุน/ลูกค้า/โน้ตภายใน
// slug อ่านจาก path, src อ่านจาก query string (?src=line) แล้วส่งไปนับยอดแบบยิงทิ้ง

function slugFromPath() {
  const raw = window.location.pathname.replace(/^\/catalog\/?/, '').replace(/\/+$/, '')
  // decodeURIComponent โยน error ถ้าเจอ % ที่ไม่ใช่ escape ที่ถูกต้อง — ลิงก์พังไม่ควรทำให้หน้าขาว
  try { return decodeURIComponent(raw).toLowerCase() } catch { return raw.toLowerCase() }
}

export default function PublicCatalogPage() {
  const [state, setState] = useState('loading')
  const [data, setData] = useState(null)

  useEffect(() => {
    const slug = slugFromPath()
    if (!slug) { setState('not_found'); return }

    let alive = true
    fetchPublicCatalog(slug)
      .then(res => {
        if (!alive) return
        setState(res.state)
        if (res.state === 'ok') {
          setData(res)
          document.title = `${res.catalog.name} | Worldtech`
          // นับยอดเฉพาะตอนเปิดได้จริง และไม่ await — log ล่มไม่ควรกระทบหน้าลูกค้า
          logCatalogView(slug, new URLSearchParams(window.location.search).get('src') || '')
        }
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [])

  if (state === 'loading') {
    return <CatalogStateMessage title="กำลังโหลดแคตตาล็อก..." detail="สักครู่นะครับ" />
  }
  if (state === 'not_found') {
    return <CatalogStateMessage
      title="ไม่พบแคตตาล็อกนี้"
      detail="ลิงก์อาจพิมพ์ไม่ครบหรือถูกเปลี่ยนไปแล้ว ลองขอลิงก์ใหม่จากทีมขายที่ส่งให้คุณได้เลย" />
  }
  if (state === 'not_published') {
    return <CatalogStateMessage
      title="แคตตาล็อกนี้ยังไม่เปิดให้เข้าชม"
      detail="ทีมงานกำลังจัดเตรียมอยู่ ติดต่อทีมขาย WORLDTECH เพื่อขอข้อมูลล่าสุดได้เลย" />
  }
  if (state !== 'ok' || !data) {
    return <CatalogStateMessage
      title="เปิดแคตตาล็อกไม่สำเร็จ"
      detail="ระบบขัดข้องชั่วคราว ลองรีเฟรชอีกครั้ง หรือติดต่อทีมขายที่ส่งลิงก์ให้คุณ" />
  }

  // ฟอร์มปกหลังส่งเข้าท่อลีดเดิม ลีดจะไปโผล่ที่หน้า "ผู้ติดต่อ" พร้อมชื่อเล่มที่เปิดมา
  const sendLead = (f) => submitCatalogLead({
    ...f, catalogName: data.catalog.name, catalogSlug: data.catalog.slug,
  })

  return (
    <CatalogGalleryView
      catalog={data.catalog} images={data.images}
      backCover={data.backCover} onSubmitLead={sendLead}
      logoSrc={data.catalog.logo_url || '/worldtech-logo.png'}
    />
  )
}
