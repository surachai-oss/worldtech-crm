import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import PublicLeadPage from './components/PublicLeadPage.jsx'
import { LanguageProvider } from './components/LanguageContext'

// /lead ไม่ต้อง login — เป็นฟอร์มสาธารณะสำหรับแปะลิงก์ใน Facebook/เว็บไซต์ ไม่ผ่านหน้า Login ของแอปหลัก
const isPublicLeadPage = window.location.pathname.startsWith('/lead')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPublicLeadPage ? <LanguageProvider><PublicLeadPage /></LanguageProvider> : <App />}
  </StrictMode>,
)
