import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PublicLeadPage from './components/PublicLeadPage.jsx'
import PublicCatalogPage from './components/PublicCatalogPage.jsx'
import { LanguageProvider } from './components/LanguageContext'

// /lead ไม่ต้อง login — เป็นฟอร์มสาธารณะสำหรับแปะลิงก์ใน Facebook/เว็บไซต์ ไม่ผ่านหน้า Login ของแอปหลัก
const path = window.location.pathname
const isPublicLeadPage = path.startsWith('/lead')
// /catalog/:slug ก็เป็นหน้าสาธารณะเหมือนกัน — ต้องมีสแลชปิดท้าย ไม่งั้นจะไปชนกับเมนู "แคตตาล็อกออนไลน์" ในหลังบ้าน
const isPublicCatalogPage = path.startsWith('/catalog/')

const publicPage = isPublicLeadPage ? <PublicLeadPage /> : isPublicCatalogPage ? <PublicCatalogPage /> : null

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {publicPage ? <LanguageProvider>{publicPage}</LanguageProvider> : <App />}
  </StrictMode>,
)
