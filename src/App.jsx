import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import * as api from './lib/api'
import { UiProvider, useUi } from './components/UiContext'
import { LanguageProvider, useLanguage } from './components/LanguageContext'
import Sidebar from './components/Sidebar'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Companies from './components/Companies'
import CompanyDetail from './components/CompanyDetail'
import Deals from './components/Deals'
import Tasks from './components/Tasks'
import Quotations from './components/Quotations'
import Orders from './components/Orders'
import Users from './components/Users'
import Products from './components/Products'
import Leads from './components/Leads'
import FinanceReview from './components/FinanceReview'
import AccountingDocuments from './components/AccountingDocuments'
import NotificationBell from './components/NotificationBell'
import { PicklistsProvider } from './components/PicklistsContext'
import { CompanyModal, ContactModal, DealModal, ActivityModal, TaskModal, QuotationModal, LeadModal } from './components/Modals'
import OrderModal from './components/OrderModal'
import { renderQuotationPdfBlob, loadQuotationPdfItems } from './lib/printQuotation'
import './App.css'

const TITLES = {
  dashboard: 'แดชบอร์ด', companies: 'บริษัทลูกค้า', 'company-detail': 'รายละเอียดบริษัท',
  deals: 'ดีลการขาย', tasks: 'งาน Follow-up', quotations: 'ใบเสนอราคา', orders: 'ออเดอร์',
  users: 'ผู้ใช้งาน', products: 'สินค้า', leads: 'ผู้ติดต่อ',
  'finance-review': 'ตรวจสอบยอดโอน', 'accounting-documents': 'เอกสารบัญชี'
}

function AppInner({ session }) {
  const { toast, confirm } = useUi()
  const { t } = useLanguage()
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
  const isFinance = profile?.role === 'finance'
  const perm = { userId: session.user.id, isAdmin, isFinance }

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
      try {
        const p = await api.getMyProfile(session.user.id)
        setProfile(p)
        // ฝ่ายบัญชีไม่มีเมนู "แดชบอร์ด" ให้เห็นแล้ว (ดู Sidebar.jsx) ต้องเปลี่ยนหน้าเริ่มต้นไม่ให้ไปโผล่ที่แดชบอร์ดตอน login
        if (p?.role === 'finance') setView('finance-review')
      }
      catch (e) { toast('โหลดข้อมูลผู้ใช้งานไม่สำเร็จ: ' + e.message, 'error') }
      setLoading(false)
    })()
  }, [])

  const nav = (v, companyId) => {
    setView(v)
    if (v === 'company-detail') setCurrentCompanyId(companyId)
  }

  const currentUser = { id: session.user.id, name: session.user.user_metadata?.name || session.user.email?.split('@')[0], email: session.user.email }

  const searchResults = useMemo(() => api.searchAll(data, searchQ), [data, searchQ])

  const closeModal = () => setModal(null)

  // ===== Generic wrapped mutations =====
  async function run(fn, successMsg) {
    try {
      const result = await fn()
      toast(successMsg, 'success')
      await reload()
      setReloadKey(k => k + 1)
      return result
    } catch (e) {
      toast('เกิดข้อผิดพลาด: ' + e.message, 'error')
      return null
    }
  }

  const actions = {
    editCompany: (c) => setModal({ type: 'company', payload: { initial: c } }),
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
    // บันทึกการติดต่อจากหน้า "ผู้ติดต่อ" — ผูกกับลีดโดยตรง (lead_id) ไม่บังคับต้องมีบริษัท เพราะบางลีดยังไม่ถูกแปลงเป็นลูกค้า
    logLeadActivity: (lead) => setModal({ type: 'activity', payload: { lead } }),
    deleteActivity: async (id) => {
      if (!(await confirm('ลบบันทึกการติดต่อนี้?'))) return
      await run(() => api.deleteActivity(id), 'ลบสำเร็จ')
    },
    addTask: (companyId) => setModal({ type: 'task', payload: { defaultCompanyId: companyId } }),
    editTask: (t) => setModal({ type: 'task', payload: { initial: t } }),
    completeTask: async (id) => { await run(() => api.completeTask(id), 'งานเสร็จสิ้น') },
    deleteTask: async (id) => {
      if (!(await confirm('ลบงานนี้?'))) return
      await run(() => api.deleteTask(id), 'ลบสำเร็จ')
    },
    addQuotation: (companyId) => setModal({ type: 'quotation', payload: { defaultCompanyId: companyId } }),
    editQuotation: (q) => setModal({ type: 'quotation', payload: { initial: q } }),
    quotStatus: async (id, status) => { await run(() => api.updateQuotationStatus(id, status), 'อัปเดตสถานะสำเร็จ') },
    quotPaymentStatus: async (id, payment_status) => { await run(() => api.updateQuotationPaymentStatus(id, payment_status), 'อัปเดตสถานะการชำระสำเร็จ') },
    deleteQuotation: async (id) => {
      if (!(await confirm('ลบใบเสนอราคานี้?'))) return
      await run(() => api.deleteQuotation(id), 'ลบสำเร็จ')
    },
    // ก็อปรายการสินค้า+บริษัทจากดีลไปตั้งต้นใบเสนอราคาใหม่ กันเซลล์ต้องกรอกซ้ำ — ผูก deal_id ไว้ให้เลย แก้ต่อในใบเสนอราคาได้อิสระไม่กระทบดีลเดิม
    createQuotationFromDeal: async (deal) => {
      try {
        const rows = await api.listDealItems(deal.id)
        const items = rows.map(r => ({ product_id: r.product_id || '', description: r.description || r.product?.name || '', quantity: r.quantity, unit_price: r.unit_price }))
        setModal({ type: 'quotation', payload: { initial: { company_id: deal.company_id, subject: deal.name, deal_id: deal.id, items } } })
      } catch (e) { toast('โหลดรายการสินค้าของดีลไม่สำเร็จ: ' + e.message, 'error') }
    },
    // ก็อปรายการสินค้า+บริษัทจากใบเสนอราคาไปตั้งต้นดีลใหม่ — ผูกกลับไปที่ deal_id ของใบเสนอราคานี้หลังบันทึกดีลสำเร็จ (ดู saveDeal)
    createDealFromQuotation: async (quot) => {
      try {
        const rows = await api.listQuotationItems(quot.id)
        const items = rows.map(r => ({ product_id: r.product_id || '', description: r.description || '', quantity: r.quantity, unit_price: r.unit_price }))
        setModal({ type: 'deal', payload: { initial: { company_id: quot.company_id, name: quot.subject, items }, linkQuotationId: quot.id } })
      } catch (e) { toast('โหลดรายการสินค้าของใบเสนอราคาไม่สำเร็จ: ' + e.message, 'error') }
    },
    // ลูกค้าเก่ากลับมาซื้อของเดิมซ้ำ — ก็อปรายการสินค้า/บริษัท/เงื่อนไขจากใบเสนอราคาเดิมมาตั้งต้นใบใหม่ ไม่ต้องพิมพ์ซ้ำ
    // ไม่ก็อป id/เลขที่/สถานะ/วันที่/การชำระ/deal_id เพราะเป็นข้อมูลของใบเดิมที่ใบใหม่ต้องเริ่มสดใหม่ (ได้ค่า default จาก QuotationModal เอง)
    copyQuotation: async (quot) => {
      try {
        const rows = await api.listQuotationItems(quot.id)
        const items = rows.map(r => ({ product_id: r.product_id || '', description: r.description || '', quantity: r.quantity, unit_price: r.unit_price }))
        setModal({ type: 'quotation', payload: { initial: {
          company_id: quot.company_id, subject: quot.subject, note: quot.note, sale_phone: quot.sale_phone,
          proposer_name: quot.proposer_name, credit_term: quot.credit_term || '', items
        } } })
        toast('คัดลอกข้อมูลแล้ว ตรวจสอบก่อนบันทึก', 'success')
      } catch (e) { toast('คัดลอกใบเสนอราคาไม่สำเร็จ: ' + e.message, 'error') }
    },
    leadStatus: async (id, status) => { await run(() => api.updateLead(id, { status }), 'อัปเดตสถานะสำเร็จ') },
    // เซลล์กรอกผู้ติดต่อเองตอนลูกค้าทักมาเอง หรือได้นามบัตรมาจากงานอีเวนต์ (ไม่ผ่านฟอร์มสาธารณะ)
    addLead: () => setModal({ type: 'lead', payload: {} }),
    deleteLead: async (id) => {
      if (!(await confirm('ลบลีดนี้?'))) return
      await run(() => api.deleteLead(id), 'ลบสำเร็จ')
    },
    // ก็อปชื่อ/เบอร์/อีเมลจากลีดไปตั้งต้นลูกค้าใหม่ ตั้งเป็นบุคคลธรรมดาโดย default (เซลล์แก้เป็นนิติบุคคลได้ถ้าจริงๆเป็นบริษัท) — ผูกกลับไปที่ลีดต้นทางหลังบันทึกสำเร็จ (ดู saveCompany)
    convertLeadToCompany: (lead) => {
      setModal({
        type: 'company',
        payload: {
          initial: { name: lead.full_name, customer_type: 'บุคคลธรรมดา', phone: lead.phone || '', email: lead.email || '', note: lead.message || '' },
          linkLeadId: lead.id
        }
      })
    },
    refreshData: reload,

    // ===== Payment Verification (คำขอตรวจยอด) =====
    // สร้าง/แก้ไข/ส่งให้บัญชี/ลบฉบับร่าง ทำที่ปุ่ม "ขอตรวจยอด" ในหน้าออเดอร์ทั้งหมดแล้ว (OrderPaymentModal เรียก api.js ตรงๆ ไม่ผ่าน action ตรงนี้)
    // ฝ่ายบัญชีตัดสินผลตรวจ (ส่ง reviewerName ไปเก็บ + เขียน audit log)
    // อนุมัติ: บัญชีระบุชื่อผู้อนุมัติ (ลายเซ็น) + เลขอ้างอิงบัญชีได้เอง (ดู ReviewModal)
    approvePayment: async (pr, { remark, approverName, financeRefNo } = {}) => { await run(() => api.approvePaymentRequest(pr.id, { remark, reviewerName: approverName || currentUser.name, financeRefNo }), 'อนุมัติแล้ว') },
    needInfoPayment: async (pr, remark) => { await run(() => api.requestMorePaymentInfo(pr.id, { remark, reviewerName: currentUser.name }), 'ส่งกลับให้แก้ไขแล้ว') },
    mismatchPayment: async (pr, remark) => { await run(() => api.markPaymentMismatch(pr.id, { remark, reviewerName: currentUser.name }), 'ทำเครื่องหมายยอดไม่ตรงแล้ว') },
    rejectPayment: async (pr, remark) => { await run(() => api.rejectPaymentRequest(pr.id, { remark, reviewerName: currentUser.name }), 'ปฏิเสธคำขอแล้ว') },

    // ===== Orders (รันเลขออเดอร์เพื่อเปิดบิลในระบบบัญชีอื่น) =====
    addOrder: () => setModal({ type: 'order', payload: {} }),
    cancelOrder: async (order, reason) => {
      await run(() => api.cancelOrder(order.id, reason, currentUser.name), 'ยกเลิกออเดอร์แล้ว')
    },
  }

  const saveCompany = async (f, files = []) => {
    // ถ้าลูกค้านี้ถูกสร้างจากปุ่ม "สร้างเป็นลูกค้า" ในหน้าลีด ต้องผูก converted_company_id กลับไปที่ลีดต้นทางหลังสร้างสำเร็จ
    const linkLeadId = modal?.payload?.linkLeadId
    closeModal()
    if (!f.name?.trim()) { toast('กรุณากรอกชื่อบริษัท', 'error'); return }
    try {
      const company = f.id
        ? await api.updateCompany(f.id, f)
        : await api.addCompany({ ...f, created_by: session.user.id })
      if (files.length) {
        const attachments = await Promise.all(files.map(file => api.uploadAttachment(company.id, file, currentUser.name)))
        attachments.forEach((attachment, i) => {
          api.uploadAttachmentToDrive(company, attachment, files[i]).catch(err => toast('มิเรอร์ไฟล์ขึ้น Google Drive ไม่สำเร็จ: ' + err.message, 'error'))
        })
      }
      if (!f.id && linkLeadId) {
        await api.updateLead(linkLeadId, { converted_company_id: company.id, status: 'ปิดเป็นลูกค้าแล้ว' })
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
  const saveDeal = async (f, items = []) => {
    // ถ้าดีลนี้ถูกสร้างจากปุ่ม "สร้างดีล" ในใบเสนอราคา ต้องผูก deal_id กลับไปที่ใบเสนอราคาต้นทางหลังสร้างสำเร็จ
    const linkQuotationId = modal?.payload?.linkQuotationId
    closeModal()
    if (!f.name?.trim()) { toast('กรุณากรอกชื่อดีล', 'error'); return }
    if (!f.company_id) { toast('กรุณาเลือกบริษัท', 'error'); return }
    if (f.id) {
      await run(() => api.updateDealWithItems(f.id, f, items), 'อัปเดตดีลสำเร็จ')
    } else {
      await run(async () => {
        const deal = await api.addDealWithItems({ ...f, created_by: session.user.id }, items)
        if (linkQuotationId) await api.updateQuotation(linkQuotationId, { deal_id: deal.id })
      }, 'เพิ่มดีลสำเร็จ')
    }
  }
  const saveActivity = async (f) => {
    closeModal()
    if (!f.subject?.trim()) { toast('กรุณากรอกหัวข้อ', 'error'); return }
    // ผูกได้ทั้งกับบริษัท (ทางเดิม) หรือกับลีดโดยตรง (บันทึกจากหน้าผู้ติดต่อ ก่อนแปลงเป็นลูกค้า) — ต้องมีอย่างน้อยหนึ่งอย่าง
    if (!f.company_id && !f.lead_id) { toast('กรุณาเลือกบริษัท', 'error'); return }
    await run(() => api.addActivity(f), 'บันทึกสำเร็จ')
  }
  const saveTask = async (f) => {
    closeModal()
    if (!f.subject?.trim()) { toast('กรุณากรอกหัวข้องาน', 'error'); return }
    if (f.id) await run(() => api.updateTask(f.id, f), 'อัปเดตสำเร็จ')
    else await run(() => api.addTask({ ...f, created_by: session.user.id }), 'เพิ่มงานสำเร็จ')
  }
  const saveLead = async (f) => {
    closeModal()
    if (!f.subject?.trim()) { toast('กรุณากรอกหัวข้อ', 'error'); return }
    if (!f.full_name?.trim()) { toast('กรุณากรอกชื่อ-นามสกุล', 'error'); return }
    if (!f.phone?.trim()) { toast('กรุณากรอกเบอร์โทรศัพท์', 'error'); return }
    if (f.id) await run(() => api.updateLead(f.id, f), 'อัปเดตสำเร็จ')
    else await run(() => api.addLead(f), 'เพิ่มผู้ติดต่อสำเร็จ')
  }
  const saveOrder = async (fields, items) => {
    closeModal()
    const order = await run(() => api.addOrderWithItems(fields, items), 'สร้างออเดอร์สำเร็จ')
    if (order) toast(`เลขที่ออเดอร์: ${order.order_no}`, 'success')
  }
  // อัปโหลดสำเนา PDF ของใบเสนอราคาขึ้น Google Drive อัตโนมัติหลังบันทึก — ทำเป็น background ไม่บล็อกผู้ใช้ ถ้าพลาดแค่เตือน ไม่กระทบข้อมูลที่บันทึกไปแล้วใน Supabase
  const mirrorQuotationToDrive = async (quot) => {
    try {
      const company = data.companies.find(c => c.id === quot.company_id)
      const items = await loadQuotationPdfItems(quot.id)
      const pdfBlob = await renderQuotationPdfBlob(quot, company, settings, items)
      await api.uploadQuotationPdfToDrive(quot, pdfBlob)
    } catch (e) {
      toast('อัปโหลดสำเนาขึ้น Google Drive ไม่สำเร็จ: ' + e.message, 'error')
    }
  }

  const saveQuotation = async (f, items = []) => {
    closeModal()
    if (!f.subject?.trim()) { toast('กรุณากรอกหัวข้อ', 'error'); return }
    if (!f.company_id) { toast('กรุณาเลือกบริษัท', 'error'); return }
    const quot = f.id
      ? await run(() => api.updateQuotationWithItems(f.id, f, items), 'อัปเดตใบเสนอราคาสำเร็จ')
      : await run(() => api.addQuotationWithItems(f, items), 'สร้างใบเสนอราคาสำเร็จ')
    if (quot) mirrorQuotationToDrive(quot)
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="logo-big">Worldtech</div>
        <div className="logo-sub">B2B CRM System</div>
        <div className="spinner" />
      </div>
    )
  }

  const currentCompany = data.companies.find(c => c.id === currentCompanyId)
  const addBtnMap = {
    companies: () => actions.editCompany(null),
    deals: () => actions.addDeal(null),
    tasks: () => actions.addTask(null),
    quotations: () => actions.addQuotation(null),
  }

  return (
    <div id="app">
      <Sidebar activeView={view} onNav={nav} user={currentUser} isAdmin={isAdmin} isFinance={isFinance} onLogout={() => supabase.auth.signOut()} />
      <div className="main-content">
        <div className="topbar">
          <div className="topbar-title">{t(TITLES[view])}</div>
          <div className="search-wrap">
            <input className="search-input" placeholder={t('ค้นหา...')} value={searchQ}
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
          <NotificationBell onNav={nav} />
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
          {view === 'leads' && (
            <Leads perm={perm} reloadKey={reloadKey} onNavCompany={(id) => nav('company-detail', id)} onAdd={actions.addLead} onCreateCompany={actions.convertLeadToCompany} onStatusChange={actions.leadStatus} onDelete={actions.deleteLead} onLogActivity={actions.logLeadActivity} />
          )}
          {view === 'deals' && (
            <Deals perm={perm} deals={data.deals} companies={data.companies} quotations={data.quotations} onAdd={() => actions.addDeal(null)} onAddStage={actions.addDealStage} onEdit={actions.editDeal} onDelete={actions.deleteDeal} onMoveStage={actions.moveDealStage} onCreateQuotation={actions.createQuotationFromDeal} />
          )}
          {view === 'tasks' && (
            <Tasks perm={perm} reloadKey={reloadKey} onNavCompany={(id) => nav('company-detail', id)} onAdd={() => actions.addTask(null)} onEdit={actions.editTask} onComplete={actions.completeTask} onDelete={actions.deleteTask} />
          )}
          {view === 'quotations' && (
            <Quotations perm={perm} reloadKey={reloadKey} settings={settings} deals={data.deals} onAdd={() => actions.addQuotation(null)} onEdit={actions.editQuotation} onCopy={actions.copyQuotation} onStatusChange={actions.quotStatus} onPaymentStatusChange={actions.quotPaymentStatus} onDelete={actions.deleteQuotation} onCreateDeal={actions.createDealFromQuotation} />
          )}
          {view === 'orders' && (
            <Orders reloadKey={reloadKey} companies={data.companies} perm={perm} currentUser={currentUser} settings={settings} onAdd={actions.addOrder} onCancel={actions.cancelOrder} />
          )}
          {view === 'users' && isAdmin && <Users currentUserId={session.user.id} accessToken={session.access_token} />}
          {view === 'products' && <Products perm={perm} />}
          {view === 'finance-review' && (isFinance || isAdmin) && (
            <FinanceReview reloadKey={reloadKey} currentUserName={currentUser.name} onApprove={actions.approvePayment} onNeedInfo={actions.needInfoPayment} onMismatch={actions.mismatchPayment} onReject={actions.rejectPayment} />
          )}
          {view === 'accounting-documents' && (isFinance || isAdmin) && (
            <AccountingDocuments reloadKey={reloadKey} currentUserName={currentUser.name} />
          )}
        </div>
      </div>

      {modal?.type === 'company' && <CompanyModal initial={modal.payload?.initial} isAdmin={isAdmin} onClose={closeModal} onSave={saveCompany} />}
      {modal?.type === 'contact' && <ContactModal initial={modal.payload?.initial} companies={data.companies} defaultCompanyId={modal.payload?.defaultCompanyId} onClose={closeModal} onSave={saveContact} />}
      {modal?.type === 'deal' && <DealModal initial={modal.payload?.initial} companies={data.companies} defaultCompanyId={modal.payload?.defaultCompanyId} defaultStage={modal.payload?.defaultStage} isAdmin={isAdmin} onClose={closeModal} onSave={saveDeal} />}
      {modal?.type === 'activity' && <ActivityModal companies={data.companies} contacts={data.contacts} defaultCompanyId={modal.payload?.defaultCompanyId} lead={modal.payload?.lead} currentUserName={currentUser.name} isAdmin={isAdmin} onClose={closeModal} onSave={saveActivity} />}
      {modal?.type === 'task' && <TaskModal initial={modal.payload?.initial} companies={data.companies} defaultCompanyId={modal.payload?.defaultCompanyId} currentUserName={currentUser.name} isAdmin={isAdmin} onClose={closeModal} onSave={saveTask} />}
      {modal?.type === 'quotation' && <QuotationModal initial={modal.payload?.initial} companies={data.companies} defaultCompanyId={modal.payload?.defaultCompanyId} currentUserName={currentUser.name} isAdmin={isAdmin} onClose={closeModal} onSave={saveQuotation} />}
      {modal?.type === 'lead' && <LeadModal initial={modal.payload?.initial} isAdmin={isAdmin} onClose={closeModal} onSave={saveLead} />}
      {modal?.type === 'order' && <OrderModal companies={data.companies} quotations={data.quotations} currentUser={currentUser} onClose={closeModal} onSave={saveOrder} />}
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
        <div className="logo-big">Worldtech</div>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <LanguageProvider>
      <UiProvider>
        {session ? (
          <PicklistsProvider>
            <AppInner session={session} />
          </PicklistsProvider>
        ) : <Login />}
      </UiProvider>
    </LanguageProvider>
  )
}
