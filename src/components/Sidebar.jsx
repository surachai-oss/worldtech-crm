import { useLanguage } from './LanguageContext'

// "ประวัติการติดต่อ" ไม่ใช่เมนูแยกแล้ว — ย้ายไปเป็นปุ่มต่อแถวในหน้า "ผู้ติดต่อ" แทน (ดู Leads.jsx) กันมีทางเข้าซ้ำ
const NAV = [
  { section: 'หลัก', items: [{ id: 'dashboard', label: 'แดชบอร์ด' }] },
  { section: 'ข้อมูลลูกค้า', items: [{ id: 'companies', label: 'บริษัทลูกค้า' }, { id: 'leads', label: 'ผู้ติดต่อ' }, { id: 'tasks', label: 'งานติดตาม' }] },
  { section: 'การขาย', items: [{ id: 'deals', label: 'ดีลการขาย' }, { id: 'quotations', label: 'ใบเสนอราคา' }, { id: 'orders', label: 'ออเดอร์' }] },
  { section: 'ข้อมูลสินค้า', items: [{ id: 'products', label: 'สินค้า' }] },
]
const ADMIN_SECTION = { section: 'ผู้ดูแลระบบ', items: [
  { id: 'users', label: 'ผู้ใช้งาน' },
] }

export default function Sidebar({ activeView, onNav, user, isAdmin, isFinance, onLogout }) {
  const { lang, setLang, t } = useLanguage()
  const name = user?.name || (lang === 'en' ? 'User' : 'ผู้ใช้งาน')
  // เมนู "ตรวจสอบยอดโอน"/"เอกสารบัญชี" ให้เห็นเฉพาะฝ่ายบัญชี/แอดมิน — เซลล์ทำ/ติดตามคำขอตรวจยอดที่หน้า "ออเดอร์" แทนแล้ว จึงไม่มีเมนูนี้ให้เห็นเลยถ้าไม่ใช่บัญชี/แอดมิน
  const financeItems = (isFinance || isAdmin) ? [{ id: 'finance-review', label: 'ตรวจสอบยอดโอน' }, { id: 'accounting-documents', label: 'เอกสารบัญชี' }] : []
  const financeSection = financeItems.length ? { section: 'การเงิน', items: financeItems } : null

  // ฝ่ายบัญชี (finance ที่ไม่ใช่ admin) ทำงานแค่ตรวจสอบยอดโอน/ออกเอกสารบัญชี + ดูข้อมูลบริษัทลูกค้าเพื่อเทียบข้อมูลกับเซลล์
  // ไม่ได้ทำแดชบอร์ด/ผู้ติดต่อ/การขาย/ติดตาม จึงเอาออกจากเมนูไปเลยกันสับสน ("บริษัทลูกค้า" ยังเห็นแต่ดูอย่างเดียว แก้ไข/ลบไม่ได้ — บังคับที่ permissions.js/RLS)
  const sections = (isFinance && !isAdmin)
    ? [
        { section: 'ข้อมูลลูกค้า', items: [{ id: 'companies', label: 'บริษัทลูกค้า' }] },
        ...(financeSection ? [financeSection] : []),
        NAV[3], // ข้อมูลสินค้า
      ]
    : [...NAV.slice(0, 3), ...(financeSection ? [financeSection] : []), ...NAV.slice(3), ...(isAdmin ? [ADMIN_SECTION] : [])]
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="brand">Worldtech</div>
        <div className="brand-sub">B2B CRM</div>
      </div>
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 12px' }}>
        <button
          className={`btn btn-xs ${lang === 'th' ? 'btn-primary' : 'btn-outline'}`}
          style={{ flex: 1 }}
          onClick={() => setLang('th')}
        >ไทย</button>
        <button
          className={`btn btn-xs ${lang === 'en' ? 'btn-primary' : 'btn-outline'}`}
          style={{ flex: 1 }}
          onClick={() => setLang('en')}
        >EN</button>
      </div>
      {sections.map(sec => (
        <div className="nav-section" key={sec.section}>
          <div className="nav-section-title">{t(sec.section)}</div>
          {sec.items.map(it => (
            <div
              key={it.id}
              className={`nav-item${activeView === it.id || (activeView === 'company-detail' && it.id === 'companies') ? ' active' : ''}`}
              onClick={() => onNav(it.id)}
            >
              <span>{t(it.label)}</span>
            </div>
          ))}
        </div>
      ))}
      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="user-avatar">{name.charAt(0).toUpperCase()}</div>
          <div style={{ flex: 1 }}>
            <div className="user-name">{name}</div>
            <div className="user-role">{user?.email || ''}</div>
          </div>
          <button className="btn btn-outline btn-xs" onClick={onLogout} title={t('ออกจากระบบ')}>{t('ออก')}</button>
        </div>
      </div>
    </aside>
  )
}
