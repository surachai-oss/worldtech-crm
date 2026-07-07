import { useEffect, useState } from 'react'
import { fmtCurrency, fmtDate, fmtFileSize, isOverdue, isDueToday, stageBadgeClass, statusBadgeClass, quotBadgeClass, activityColor } from '../lib/format'
import { listAttachments, uploadAttachment, deleteAttachment, getAttachmentUrl } from '../lib/api'
import { printQuotation } from '../lib/printQuotation'
import { canEdit, canDelete, canManageChild } from '../lib/permissions'
import { useUi } from './UiContext'
import EditableSelect from './EditableSelect'
import SignedQuotationControl from './SignedQuotationControl'

const TABS = [
  ['info', 'ข้อมูลบริษัท'], ['contacts', 'ผู้ติดต่อ'], ['deals', 'ดีล'],
  ['activities', 'กิจกรรม'], ['tasks', 'งาน'], ['quotations', 'ใบเสนอราคา'], ['attachments', 'เอกสารแนบ']
]

export default function CompanyDetail({ company, contacts, deals, activities, tasks, quotations, settings, perm, currentUserName, onBack, actions }) {
  const [tab, setTab] = useState('info')
  if (!company) return null

  const counts = { contacts: contacts.length, deals: deals.length, activities: activities.length, tasks: tasks.length, quotations: quotations.length }
  const pendingTasks = tasks.filter(t => t.status !== 'เสร็จสิ้น').length
  const canEditCompany = canEdit(company, perm)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-outline btn-sm" onClick={onBack}>กลับ</button>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>{company.name}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className={`badge ${statusBadgeClass(company.status)}`}>{company.status}</span>
                <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{company.industry}</span>
                {company.phone && <span style={{ fontSize: 12 }}>{company.phone}</span>}
                {company.email && <span style={{ fontSize: 12 }}>{company.email}</span>}
                {company.website && <a href={company.website} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>เว็บไซต์</a>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-outline btn-sm" onClick={() => actions.addActivity(company.id)}>+ บันทึกการติดต่อ</button>
              <button className="btn btn-outline btn-sm" onClick={() => actions.addTask(company.id)}>+ เพิ่มงาน</button>
              {canEditCompany && <button className="btn btn-primary btn-sm" onClick={() => actions.editCompany(company)}>แก้ไข</button>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <Stat n={counts.contacts} label="ผู้ติดต่อ" />
            <Stat n={counts.deals} label="ดีล" />
            <Stat n={counts.activities} label="กิจกรรม" />
            <Stat n={pendingTasks} label="งานค้าง" />
          </div>
        </div>
      </div>

      <div className="detail-tabs">
        {TABS.map(([id, label]) => (
          <div key={id} className={`detail-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}{counts[id] !== undefined ? ` (${counts[id]})` : ''}
          </div>
        ))}
      </div>

      {tab === 'info' && <InfoTab company={company} />}
      {tab === 'contacts' && <ContactsTab contacts={contacts} perm={perm} company={company} onAdd={() => actions.addContact(company.id)} onEdit={(c) => actions.editContact(company.id, c)} onDelete={actions.deleteContact} />}
      {tab === 'deals' && <DealsTab deals={deals} quotations={quotations} perm={perm} onAdd={() => actions.addDeal(company.id)} onEdit={actions.editDeal} onDelete={actions.deleteDeal} onCreateQuotation={actions.createQuotationFromDeal} />}
      {tab === 'activities' && <ActivitiesTab activities={activities} perm={perm} company={company} onAdd={() => actions.addActivity(company.id)} onDelete={actions.deleteActivity} />}
      {tab === 'tasks' && <TasksTab tasks={tasks} perm={perm} onAdd={() => actions.addTask(company.id)} onEdit={actions.editTask} onComplete={actions.completeTask} onDelete={actions.deleteTask} />}
      {tab === 'quotations' && <QuotationsTab quotations={quotations} deals={deals} company={company} perm={perm} settings={settings} onAdd={() => actions.addQuotation(company.id)} onEdit={actions.editQuotation} onStatusChange={actions.quotStatus} onDelete={actions.deleteQuotation} onRefresh={actions.refreshData} onCreateDeal={actions.createDealFromQuotation} />}
      {tab === 'attachments' && <AttachmentsTab company={company} perm={perm} currentUserName={currentUserName} />}
    </div>
  )
}

function Stat({ n, label }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--navy)' }}>{n}</div>
      <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{label}</div>
    </div>
  )
}

function InfoTab({ company }) {
  const rows = [
    ['ที่อยู่', company.address], ['ผู้รับผิดชอบ', company.owner],
    ['วันที่สร้าง', fmtDate(company.created_at)], ['อัปเดตล่าสุด', fmtDate(company.updated_at)],
    ['หมายเหตุ', company.note]
  ].filter(r => r[1])
  return (
    <div className="card"><div className="card-body">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-light)', marginBottom: 2 }}>{k}</div>
            <div style={{ fontSize: 13 }}>{v || '-'}</div>
          </div>
        ))}
      </div>
    </div></div>
  )
}

function ContactsTab({ contacts, perm, company, onAdd, onEdit, onDelete }) {
  const manageable = canManageChild(company, perm)
  return (
    <>
      <div className="section-header"><div className="section-title">ผู้ติดต่อ</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ เพิ่ม</button></div>
      <div className="card"><div className="table-wrap">
        {contacts.length ? (
          <table>
            <thead><tr><th>ชื่อ</th><th>ตำแหน่ง</th><th>โทรศัพท์</th><th>อีเมล</th><th>Line</th><th>การจัดการ</th></tr></thead>
            <tbody>{contacts.map(c => (
              <tr key={c.id}>
                <td><div style={{ fontWeight: 500 }}>{c.full_name}</div><div style={{ fontSize: 11, color: 'var(--text-light)' }}>{c.department}</div></td>
                <td style={{ fontSize: 12 }}>{c.position || '-'}</td>
                <td style={{ fontSize: 12 }}>{c.phone || '-'}</td>
                <td style={{ fontSize: 12 }}>{c.email || '-'}</td>
                <td style={{ fontSize: 12 }}>{c.line_id || '-'}</td>
                <td className="td-actions">
                  {manageable && <button className="btn btn-outline btn-xs" onClick={() => onEdit(c)}>แก้ไข</button>}
                  {manageable && <button className="btn btn-danger btn-xs" onClick={() => onDelete(c.id)}>ลบ</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="empty-state"><div>ยังไม่มีผู้ติดต่อ</div></div>}
      </div></div>
    </>
  )
}

function DealsTab({ deals, quotations, perm, onAdd, onEdit, onDelete, onCreateQuotation }) {
  return (
    <>
      <div className="section-header"><div className="section-title">ดีลการขาย</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ เพิ่มดีล</button></div>
      <div className="card"><div className="table-wrap">
        {deals.length ? (
          <table>
            <thead><tr><th>ชื่อดีล</th><th>Stage</th><th>มูลค่า</th><th>วันปิดดีล</th><th>ผู้รับผิดชอบ</th><th>การจัดการ</th></tr></thead>
            <tbody>{deals.map(d => {
              const qCount = quotations.filter(q => q.deal_id === d.id).length
              return (
                <tr key={d.id}>
                  <td style={{ fontWeight: 500 }}>{d.name}{qCount > 0 && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>ออกใบเสนอราคาแล้ว {qCount} ใบ</div>}</td>
                  <td><span className={`badge ${stageBadgeClass(d.stage)}`}>{d.stage}</span></td>
                  <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{fmtCurrency(d.value)}</td>
                  <td style={{ fontSize: 12 }}>{fmtDate(d.close_date)}</td>
                  <td style={{ fontSize: 12 }}>{d.owner || '-'}</td>
                  <td className="td-actions">
                    {canEdit(d, perm) && <button className="btn btn-outline btn-xs" onClick={() => onEdit(d)}>แก้ไข</button>}
                    {canEdit(d, perm) && <button className="btn btn-secondary btn-xs" onClick={() => onCreateQuotation(d)}>ออกใบเสนอราคา</button>}
                    {canDelete(d, perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(d.id)}>ลบ</button>}
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        ) : <div className="empty-state"><div>ยังไม่มีดีล</div></div>}
      </div></div>
    </>
  )
}

function ActivitiesTab({ activities, perm, company, onAdd, onDelete }) {
  const manageable = canManageChild(company, perm)
  const sorted = [...activities].sort((a, b) => new Date(b.activity_date) - new Date(a.activity_date))
  return (
    <>
      <div className="section-header"><div className="section-title">ประวัติการติดต่อ</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ บันทึก</button></div>
      <div className="card"><div className="card-body">
        <div className="activity-feed">
          {sorted.length ? sorted.map(a => (
            <div className="activity-item" key={a.id}>
              <div className="activity-icon" style={{ background: activityColor(a.type) }} />
              <div className="activity-content">
                <div className="activity-title">{a.subject}</div>
                <div className="activity-meta"><span>{a.type}</span><span>{fmtDate(a.activity_date)}</span><span>โดย {a.recorded_by}</span></div>
                {a.detail && <div className="activity-detail">{a.detail}</div>}
              </div>
              {manageable && <button className="btn btn-danger btn-xs" onClick={() => onDelete(a.id)}>ลบ</button>}
            </div>
          )) : <div className="empty-state"><div>ยังไม่มีกิจกรรม</div></div>}
        </div>
      </div></div>
    </>
  )
}

function TasksTab({ tasks, perm, onAdd, onEdit, onComplete, onDelete }) {
  return (
    <>
      <div className="section-header"><div className="section-title">งาน Follow-up</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ เพิ่มงาน</button></div>
      <div className="card"><div className="table-wrap">
        {tasks.length ? (
          <table>
            <thead><tr><th>งาน</th><th>ลำดับ</th><th>วันครบกำหนด</th><th>สถานะ</th><th>การจัดการ</th></tr></thead>
            <tbody>{tasks.map(t => {
              const ov = t.status !== 'เสร็จสิ้น' && isOverdue(t.due_date)
              return (
                <tr key={t.id} style={{ background: ov ? '#fff5f5' : undefined }}>
                  <td><div style={{ fontWeight: 500 }}>{t.subject}</div>{t.note && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{t.note}</div>}</td>
                  <td>{t.priority || '-'}</td>
                  <td className={ov ? 'overdue' : isDueToday(t.due_date) ? 'due-today' : ''} style={{ fontSize: 12 }}>{fmtDate(t.due_date)}</td>
                  <td><span className={`badge ${statusBadgeClass(t.status)}`}>{t.status}</span></td>
                  <td className="td-actions">
                    {t.status !== 'เสร็จสิ้น' && canEdit(t, perm) && <button className="btn btn-success btn-xs" onClick={() => onComplete(t.id)}>เสร็จ</button>}
                    {canEdit(t, perm) && <button className="btn btn-outline btn-xs" onClick={() => onEdit(t)}>แก้ไข</button>}
                    {canDelete(t, perm) && <button className="btn btn-danger btn-xs" onClick={() => onDelete(t.id)}>ลบ</button>}
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        ) : <div className="empty-state"><div>ยังไม่มีงาน</div></div>}
      </div></div>
    </>
  )
}

function QuotationsTab({ quotations, deals, company, perm, settings, onAdd, onEdit, onStatusChange, onDelete, onRefresh, onCreateDeal }) {
  const manageable = canManageChild(company, perm)
  return (
    <>
      <div className="section-header"><div className="section-title">ใบเสนอราคา</div><button className="btn btn-primary btn-sm" onClick={onAdd}>+ สร้างใบเสนอราคา</button></div>
      <div className="card"><div className="table-wrap">
        {quotations.length ? (
          <table>
            <thead><tr><th>เลขที่</th><th>หัวข้อ</th><th>มูลค่า</th><th>สถานะ</th><th>วันที่</th><th>การจัดการ</th></tr></thead>
            <tbody>{quotations.map(q => {
              const fromDeal = q.deal_id ? deals.find(d => d.id === q.deal_id) : null
              return (
                <tr key={q.id}>
                  <td style={{ fontWeight: 600, color: 'var(--navy)' }}>{q.quot_no}</td>
                  <td>{q.subject}{fromDeal && <div style={{ fontSize: 11, color: 'var(--text-light)' }}>จากดีล: {fromDeal.name}</div>}</td>
                  <td style={{ fontWeight: 600 }}>{fmtCurrency(q.value)}</td>
                  <td><span className={`badge ${quotBadgeClass(q.status)}`}>{q.status}</span></td>
                  <td style={{ fontSize: 12 }}>{fmtDate(q.quot_date)}</td>
                  <td className="td-actions">
                    {manageable && (
                      <EditableSelect listKey="quot_statuses" value={q.status} onChange={v => onStatusChange(q.id, v)} isAdmin={perm.isAdmin} style={{ display: 'inline-flex', width: 160 }} />
                    )}
                    {manageable && <button className="btn btn-outline btn-xs" onClick={() => onEdit(q)}>แก้ไข</button>}
                    {manageable && !q.deal_id && <button className="btn btn-secondary btn-xs" onClick={() => onCreateDeal(q)}>สร้างดีล</button>}
                    <button className="btn btn-secondary btn-xs" onClick={() => printQuotation(q, company, settings)}>PDF</button>
                    <SignedQuotationControl quotation={q} manageable={manageable} onChanged={onRefresh} />
                    {manageable && <button className="btn btn-danger btn-xs" onClick={() => onDelete(q.id)}>ลบ</button>}
                  </td>
                </tr>
              )
            })}</tbody>
          </table>
        ) : <div className="empty-state"><div>ยังไม่มีใบเสนอราคา</div></div>}
      </div></div>
    </>
  )
}

function AttachmentsTab({ company, perm, currentUserName }) {
  const { toast, confirm } = useUi()
  const manageable = canManageChild(company, perm)
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    setLoading(true)
    try { setFiles(await listAttachments(company.id)) }
    catch (e) { toast('โหลดเอกสารแนบไม่สำเร็จ: ' + e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [company.id])

  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      await uploadAttachment(company.id, file, currentUserName)
      toast('แนบไฟล์สำเร็จ', 'success')
      await load()
    } catch (err) { toast('แนบไฟล์ไม่สำเร็จ: ' + err.message, 'error') }
    finally { setUploading(false) }
  }

  const onDownload = async (f) => {
    try {
      const url = await getAttachmentUrl(f.file_path)
      window.open(url, '_blank')
    } catch (e) { toast('เปิดไฟล์ไม่สำเร็จ: ' + e.message, 'error') }
  }

  const onDeleteFile = async (f) => {
    if (!(await confirm('ลบไฟล์นี้?'))) return
    try {
      await deleteAttachment(f.id, f.file_path)
      toast('ลบไฟล์สำเร็จ', 'success')
      await load()
    } catch (e) { toast('ลบไฟล์ไม่สำเร็จ: ' + e.message, 'error') }
  }

  return (
    <>
      <div className="section-header">
        <div className="section-title">เอกสารแนบ</div>
        {manageable && (
          <label className="btn btn-primary btn-sm" style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
            {uploading ? 'กำลังอัปโหลด...' : '+ แนบไฟล์'}
            <input type="file" style={{ display: 'none' }} onChange={onFileChange} disabled={uploading} />
          </label>
        )}
      </div>
      <div className="card"><div className="table-wrap">
        {files.length ? (
          <table>
            <thead><tr><th>ไฟล์</th><th>ขนาด</th><th>อัปโหลดโดย</th><th>วันที่</th><th>การจัดการ</th></tr></thead>
            <tbody>{files.map(f => (
              <tr key={f.id}>
                <td style={{ fontWeight: 500 }}>{f.file_name}</td>
                <td style={{ fontSize: 12 }}>{fmtFileSize(f.file_size)}</td>
                <td style={{ fontSize: 12 }}>{f.uploaded_by || '-'}</td>
                <td style={{ fontSize: 12 }}>{fmtDate(f.created_at)}</td>
                <td className="td-actions">
                  <button className="btn btn-outline btn-xs" onClick={() => onDownload(f)}>ดาวน์โหลด</button>
                  {manageable && <button className="btn btn-danger btn-xs" onClick={() => onDeleteFile(f)}>ลบ</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="empty-state"><div>{loading ? 'กำลังโหลด...' : 'ยังไม่มีเอกสารแนบ'}</div></div>}
      </div></div>
    </>
  )
}
