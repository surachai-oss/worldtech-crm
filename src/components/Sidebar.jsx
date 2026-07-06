const NAV = [
  { section: 'หลัก', items: [{ id: 'dashboard', icon: '📊', label: 'แดชบอร์ด' }] },
  { section: 'ข้อมูลลูกค้า', items: [{ id: 'companies', icon: '🏢', label: 'บริษัทลูกค้า' }, { id: 'contacts', icon: '👥', label: 'ผู้ติดต่อ' }] },
  { section: 'การขาย', items: [{ id: 'deals', icon: '🤝', label: 'ดีลการขาย' }, { id: 'quotations', icon: '📋', label: 'ใบเสนอราคา' }] },
  { section: 'ติดตาม', items: [{ id: 'activities', icon: '📝', label: 'ประวัติการติดต่อ' }, { id: 'tasks', icon: '✅', label: 'งาน Follow-up' }] },
]
const ADMIN_SECTION = { section: 'ผู้ดูแลระบบ', items: [
  { id: 'users', icon: '👤', label: 'ผู้ใช้งาน' },
] }

export default function Sidebar({ activeView, onNav, user, isAdmin, onLogout }) {
  const name = user?.name || 'ผู้ใช้งาน'
  const sections = isAdmin ? [...NAV, ADMIN_SECTION] : NAV
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="brand">⚡ Worldtech</div>
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
              <span className="icon">{it.icon}</span><span>{it.label}</span>
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
          <button className="btn btn-outline btn-xs" onClick={onLogout} title="ออกจากระบบ">↩</button>
        </div>
      </div>
    </aside>
  )
}
