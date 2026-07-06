import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import * as api from './lib/api'
import { UiProvider, useUi } from './components/UiContext'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Companies from './components/Companies'
import CompanyDetail from './components/CompanyDetail'
import Contacts from './components/Contacts'
import Deals from './components/Deals'
import Activities from './components/Activities'
import Tasks from './components/Tasks'
import Quotations from './components/Quotations'
import Users from './components/Users'
import { PicklistsProvider } from './components/PicklistsContext'
import { CompanyModal, ContactModal, DealModal, ActivityModal, TaskModal, QuotationModal } from './components/Modals'
import './App.css'

const TITLES = {
  dashboard: 'แดชบอร์ด', companies: 'บริษัทลูกค้า', 'company-detail': 'รายละเอียดบริษัท',
  contacts: 'ผู้ติดต่อ', deals: 'ดีลการขาย', activities: 'ประวัติการติดต่อ', tasks: 'งาน Follow-up', quotations: 'ใบเสนอราคา',
  users: 'ผู้ใช้งาน'
}

function AppInner({ session }) {
  const { toast, confirm } = useUi()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({ companies: [], contacts: [], deals: [], activities: [], tasks: [], quotations: [] })
  const [settings, setSettings] = useState({})
  const [profile, setProfile] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [view, setView] = useState('dashboard')
  const [currentCompanyId, setCurrentCompanyId] = useState(null)
  const [modal, setModal] = useState(null) // { type, payload }
  const [searchQ, setSearchQ] = useState('')
  const [showResults, setShowResults] = useState(false)

  const isAdmin = profile?.role === 'admin'
  const perm = { userId: session.user.id, isAdmin }

  const reload = async () => {
    try {
      const d = await api.getAllData()
      setData(d)
    } catch (e) {
      toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error')
    }
  }

  useEffect(() => {
    (async () => {
      await reload()
      const { data: s } = await supabase.from('settings').select('*')
      const map = {}
        ; (s || []).forEach(r => { map[r.key] = r.value })
      setSettings(map)
      try { setProfile(await api.getMyProfile(session.user.id)) }
      catch (e) { toast('โหลดข้อมูลผู้ใช้งานไม่สำเร็จ: ' + e.message, 'error') }
      setLoading(false)
    })()
  }, [])

  const nav = (v, companyId) => {
    setView(v)
    if (v === 'company-detail') setCurrentCompanyId(companyId)
  }

  const currentUser = { name: session.user.user_metadata?.name || session.user.email?.split('@')[0], email: session.user.email }

  const searchResults = useMemo(() => api.searchAll(data, searchQ), [data, searchQ])

  const closeModal = () => setModal(null)

  // ===== Generic wrapped mutations =====
  async function run(fn, successMsg) {
    try {
      await fn()
      toast(successMsg, 'success')
      await reload()
      setReloadKey(k => k + 1)
    } catch (e) {
      toast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }

  const actions = {
    editCompany: (c) => setModal({ type: 'company', payload: c }),
    deleteCompany: async (id) => {
      if (!(await confirm('ลบบริษัทนี้? ข้อมูลจะถูกลบถาวร'))) return
      await run(() => api.deleteCompany(id), 'ลบสำเร็จ')
      if (view === 'company-detail') nav('companies')
    },
    addContact: (companyId) => setModal({ type: 'contact', payload: { defaultCompanyId: companyId } }),
    editContact: (companyId, c) => setModal({ type: 'contact', payload: { initial: c, defaultCompanyId: companyId } }),
    deleteContact: async (id) => {
      if (!(await confirm('ลบผู้ติดต่อนี้?'))) return
      await run(() => api.deleteContact(id), 'ลบสำเร็จ')
    },
    addDeal: (companyId) => setModal({ type: 'deal', payload: { defaultCompanyId: companyId } }),
    addDealStage: (stage) => setModal({ type: 'deal', payload: { defaultStage: stage } }),
    editDeal: (d) => setModal({ type: 'deal', payload: { initial: d } }),
    deleteDeal: async (id) => {
      if (!(await confirm('ลบดีลนี้?'))) return
      await run(() => api.deleteDeal(id), 'ลบสำเร็จ')
    },
    moveDealStage: async (id, stage) => {
      await run(() => api.updateDealStage(id, stage), 'เปลี่ยน Stage สำเร็จ')
    },
    addActivity: (companyId) => setModal({ type: 'activity', payload: { defaultCompanyId: companyId } }),
    deleteActivity: async (id) => {
      if (!(await confirm('ลบบันทึกการติดต่อนี้?'))) return
      await run(() => api.deleteActivity(id), 'ลบสำเร็จ')
    },
    addTask: (companyId) => setModal({ type: 'task', payload: { defaultCompanyId: companyId } }),
    editTask: (t) => setModal({ type: 'task', payload: { initial: t } }),
    completeTask: async (id) => { await run(() => api.completeTask(id), 'งานเสร็จสิ้น ✓') },
    deleteTask: async (id) => {
      if (!(await confirm('ลบงานนี้?'))) return
      await run(() => api.deleteTask(id), 'ลบสำเร็จ')
    },
    addQuotation: (companyId) => setModal({ type: 'quotation', payload: { defaultCompanyId: companyId } }),
    quotStatus: async (id, status) => { await run(() => api.updateQuotationStatus(id, status), 'อัปเดตสถานะสำเร็จ') },
    deleteQuotation: async (id) => {
      if (!(await confirm('ลบใบเสนอราคานี้?'))) return
      await run(() => api.deleteQuotation(id), 'ลบสำเร็จ')
    },
  }

  const saveCompany = async (f, files = []) => {
    closeModal()
    if (!f.name?.trim()) { toast('กรุณากรอกชื่อบริษัท', 'error'); return }
    try {
      const company = f.id
        ? await api.updateCompany(f.id, f)
        : await api.addCompany({ ...f, created_by: session.user.id })
      if (files.length) {
        await Promise.all(files.map(file => api.uploadAttachment(company.id, file, currentUser.name)))
      }
      toast(f.id ? 'อัปเดตสำเร็จ' : 'เพิ่มบริษัทสำเร็จ', 'success')
      await reload()
      setReloadKey(k => k + 1)
    } catch (e) {
      toast('เกิดข้อผิดพลาด: ' + e.message, 'error')
    }
  }
  const saveContact = async (f) => {
    closeModal()
    if (!f.full_name?.trim()) { toast('กรุณากรอกชื่อ', 'error'); return }
    if (!f.company_id) { toast('กรุณาเลือกบริษัท', 'error'); return }
    if (f.id) await run(() => api.updateContact(f.id, f), 'อัปเดตสำเร็จ')
    else await run(() => api.addContact(f), 'เพิ่มผู้ติดต่อสำเร็จ')
  }
  const saveDeal = async (f) => {
    closeModal()
    if (!f.name?.trim()) { toast('กรุณากรอกชื่อดีล', 'error'); return }
    if (!f.company_id) { toast('กรุณาเลือกบริษัท', 'error'); return }
    if (f.id) await run(() => api.updateDeal(f.id, f), 'อัปเดตดีลสำเร็จ')
    else await run(() => api.addDeal({ ...f, created_by: session.user.id }), 'เพิ่มดีลสำเร็จ')
  }
  const saveActivity = async (f) => {
    closeModal()
    if (!f.subject?.trim()) { toast('กรุณากรอกหัวข้อ', 'error'); return }
    if (!f.company_id) { toast('กรุณาเลือกบริษัท', 'error'); return }
    await run(() => api.addActivity(f), 'บันทึกสำเร็จ')
  }
  const saveTask = async (f) => {
    closeModal()
    if (!f.subject?.trim()) { toast('กรุณากรอกหัวข้องาน', 'error'); return }
    if (f.id) await run(() => api.updateTask(f.id, f), 'อัปเดตสำเร็จ')
    else await run(() => api.addTask({ ...f, created_by: session.user.id }), 'เพิ่มงานสำเร็จ')
  }
  const saveQuotation = async (f) => {
    closeModal()
    if (!f.subject?.trim()) { toast('กรุณากรอกหัวข้อ', 'error'); return }
    if (!f.company_id) { toast('กรุณาเลือกบริษัท', 'error'); return }
    try {
      const r = await api.addQuotation(f)
      toast('สร้างใบเสนอราคา ' + r.quot_no + ' สำเร็จ', 'success')
      await reload()
    } catch (e) { toast('เกิดข้อผิดพลาด: ' + e.message, 'error') }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="logo-big">⚡ Worldtech</div>
        <div className="logo-sub">B2B CRM System</div>
        <div className="spinner" />
      </div>
    )
  }

  const currentCompany = data.companies.find(c => c.id === currentCompanyId)
  const addBtnMap = {
    companies: () => actions.editCompany(null),
    contacts: () => actions.addContact(null),
    deals: () => actions.addDeal(null),
    activities: () => actions.addActivity(null),
    tasks: () => actions.addTask(null),
    quotations: () => actions.addQuotation(null),
  }

  return (
    <div id="app">
      <Sidebar activeView={view} onNav={nav} user={currentUser} isAdmin={isAdmin} onLogout={() => supabase.auth.signOut()} />
      <div className="main-content">
        <div className="topbar">
          <div className="topbar-title">{TITLES[view]}</div>
          <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input className="search-input" placeholder="ค้นหา..." value={searchQ}
              onChange={e => { setSearchQ(e.target.value); setShowResults(e.target.value.length >= 2) }}
              onBlur={() => setTimeout(() => setShowResults(false), 150)} />
            {showResults && (
              <div className="search-results">
                {searchResults.length ? searchResults.map((item, i) => (
                  <div className="search-item" key={i} onMouseDown={() => {
                    setSearchQ(''); setShowResults(false)
                    if (item.type === 'company') nav('company-detail', item.id)
                    else if (item.type === 'contact') nav('company-detail', item.id)
                    else if (item.type === 'deal') nav('deals')
                  }}>
                    <span className={`badge ${item.type === 'company' ? 'badge-navy' : item.type === 'contact' ? 'badge-blue' : 'badge-yellow'}`} style={{ fontSize: 10 }}>
                      {item.type === 'company' ? 'บริษัท' : item.type === 'contact' ? 'ผู้ติดต่อ' : 'ดีล'}
                    </span>
                    <div><div className="search-item-label">{item.label}</div><div className="search-item-sub">{item.sub}</div></div>
                  </div>
                )) : <div style={{ padding: '12px 14px', color: 'var(--text-light)', fontSize: 13 }}>ไม่พบผลลัพธ์</div>}
              </div>
            )}
          </div>
          {addBtnMap[view] && <button className="btn btn-primary btn-sm" onClick={addBtnMap[view]}>+ เพิ่มใหม่</button>}
        </div>

        <div className="content-area">
          {view === 'dashboard' && <Dashboard data={data} onNav={nav} />}
          {view === 'companies' && (
            <Companies perm={perm} reloadKey={reloadKey} onOpen={(id) => nav('company-detail', id)} onEdit={actions.editCompany} onDelete={actions.deleteCompany} />
          )}
          {view === 'company-detail' && currentCompany && (
            <CompanyDetail
              company={currentCompany}
              contacts={data.contacts.filter(c => c.company_id === currentCompanyId)}
              deals={data.deals.filter(d => d.company_id === currentCompanyId)}
              activities={data.activities.filter(a => a.company_id === currentCompanyId)}
              tasks={data.tasks.filter(t => t.company_id === currentCompanyId)}
              quotations={data.quotations.filter(q => q.company_id === currentCompanyId)}
              settings={settings}
              perm={perm}
              currentUserName={currentUser.name}
              onBack={() => nav('companies')}
              actions={actions}
            />
          )}
          {view === 'contacts' && (
            <Contacts perm={perm} reloadKey={reloadKey} onNavCompany={(id) => nav('company-detail', id)} onEdit={(c) => actions.editContact(c?.company_id, c)} onDelete={actions.deleteContact} />
          )}
          {view === 'deals' && (
            <Deals perm={perm} deals={data.deals} companies={data.companies} onAdd={() => actions.addDeal(null)} onAddStage={actions.addDealStage} onEdit={actions.editDeal} onMoveStage={actions.moveDealStage} />
          )}
          {view === 'activities' && (
            <Activities perm={perm} reloadKey={reloadKey} onNavCompany={(id) => nav('company-detail', id)} onAdd={() => actions.addActivity(null)} onDelete={actions.deleteActivity} />
          )}
          {view === 'tasks' && (
            <Tasks perm={perm} reloadKey={reloadKey} onNavCompany={(id) => nav('company-detail', id)} onAdd={() => actions.addTask(null)} onEdit={actions.editTask} onComplete={actions.completeTask} onDelete={actions.deleteTask} />
          )}
          {view === 'quotations' && (
            <Quotations perm={perm} reloadKey={reloadKey} settings={settings} onAdd={() => actions.addQuotation(null)} onStatusChange={actions.quotStatus} onDelete={actions.deleteQuotation} />
          )}
          {view === 'users' && isAdmin && <Users currentUserId={session.user.id} accessToken={session.access_token} />}
        </div>
      </div>

      {modal?.type === 'company' && <CompanyModal initial={modal.payload} isAdmin={isAdmin} onClose={closeModal} onSave={saveCompany} />}
      {modal?.type === 'contact' && <ContactModal initial={modal.payload?.initial} companies={data.companies} defaultCompanyId={modal.payload?.defaultCompanyId} onClose={closeModal} onSave={saveContact} />}
      {modal?.type === 'deal' && <DealModal initial={modal.payload?.initial} companies={data.companies} defaultCompanyId={modal.payload?.defaultCompanyId} defaultStage={modal.payload?.defaultStage} isAdmin={isAdmin} onClose={closeModal} onSave={saveDeal} />}
      {modal?.type === 'activity' && <ActivityModal companies={data.companies} contacts={data.contacts} defaultCompanyId={modal.payload?.defaultCompanyId} currentUserName={currentUser.name} isAdmin={isAdmin} onClose={closeModal} onSave={saveActivity} />}
      {modal?.type === 'task' && <TaskModal initial={modal.payload?.initial} companies={data.companies} defaultCompanyId={modal.payload?.defaultCompanyId} currentUserName={currentUser.name} isAdmin={isAdmin} onClose={closeModal} onSave={saveTask} />}
      {modal?.type === 'quotation' && <QuotationModal companies={data.companies} defaultCompanyId={modal.payload?.defaultCompanyId} isAdmin={isAdmin} onClose={closeModal} onSave={saveQuotation} />}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined) // undefined = loading, null = logged out

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return (
      <div className="loading-screen">
        <div className="logo-big">⚡ Worldtech</div>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <UiProvider>
      {session ? (
        <PicklistsProvider>
          <AppInner session={session} />
        </PicklistsProvider>
      ) : <Login />}
    </UiProvider>
  )
}
