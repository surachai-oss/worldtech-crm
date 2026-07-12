const NAV = [
  { section: 'หลัก', items: [{ id: 'dashboard', label: 'แดชบอร์ด' }] },
  { section: 'ข้อมูลลูกค้า', items: [{ id: 'companies', label: 'บริษัทลูกค้า' }, { id: 'leads', label: 'ผู้ติดต่อ' }] },
  { section: 'การขาย', items: [{ id: 'deals', label: 'ดีลการขาย' }, { id: 'quotations', label: 'ใบเสนอราคา' }, { id: 'orders', label: 'ออเดอร์' }] },
  { section: 'ข้อมูลสินค้า', items: [{ id: 'products', label: 'สินค้า' }] },
  { section: 'ติดตาม', items: [{ id: 'activities', label: 'ประวัติการติดต่อ' }, { id: 'tasks', label: 'งาน Follow-up' }] },
]
const ADMIN_SECTION = { section: 'ผู้ดูแลระบบ', items: [
  { id: 'users', label: 'ผู้ใช้งาน' },
] }

export default function Sidebar({ activeView, onNav, user, isAdmin, isFinance, onLogout }) {
  const name = user?.name || 'ผู้ใช้งาน'
  // เมนู "ตรวจสอบยอดโอน"/"เอกสารบัญชี" ให้เห็นเฉพาะฝ่ายบัญชี/แอดมิน — เซลล์ทำ/ติดตามคำขอตรวจยอดที่หน้า "ออเดอร์" แทนแล้ว จึงไม่มีเมนูนี้ให้เห็นเลยถ้าไม่ใช่บัญชี/แอดมิน
  const financeItems = (isFinance || isAdmin) ? [{ id: 'finance-review', label: 'ตรวจสอบยอดโอน' }, { id: 'accounting-documents', label: 'เอกสารบัญชี' }] : []
  const financeSection = financeItems.length ? { section: 'การเงิน', items: financeItems } : null
  const sections = [...NAV.slice(0, 3), ...(financeSection ? [financeSection] : []), ...NAV.slice(3), ...(isAdmin ? [ADMIN_SECTION] : [])]
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="brand">Worldtech</div>
        <div className="brand-sub">B2B CRM</div>
      </div>
      {sections.map(sec => (
        <div className="nav-section" key={sec.section}>
          <div className="nav-section-title">{sec.section}</div>
          {sec.items.map(it => (
            <div
              key={it.id}
              className={`nav-item${activeView === it.id || (activeView === 'company-detail' && it.id === 'companies') ? ' active' : ''}`}
              onClick={() => onNav(it.id)}
            >
              <span>{it.label}</span>
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
          <button className="btn btn-outline btn-xs" onClick={onLogout} title="ออกจากระบบ">ออก</button>
        </div>
      </div>
    </aside>
  )
}
