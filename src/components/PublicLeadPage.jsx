import { useState } from 'react'
import { submitPublicLead } from '../lib/api'
import '../App.css'

// หน้าฟอร์มลีดสาธารณะ — ไม่ต้อง login เอาลิงก์ไปแปะใน Facebook Ads/เว็บไซต์ได้เลย (เช่น /lead?src=facebook)
// ที่มา (source) อ่านจาก query param ให้อัตโนมัติ ไม่ต้องให้ลูกค้ากรอกเอง

const POSITION_OPTIONS = ['เจ้าของกิจการ', 'ฝ่ายจัดซื้อ', 'พนักงานขาย', 'บุคคลทั่วไป']

const BUSINESS_TYPE_OTHER = 'อื่นๆ โปรดระบุ'
const BUSINESS_TYPE_OPTIONS = [
  'ตัวแทนจำหน่าย เช่น ร้านค้าปลีกเครื่องใช้ไฟฟ้า',
  'ธุรกิจอสังหาริมทรัพย์ เช่น หอพัก / คอนโด / อพาร์ทเม้นท์',
  'กลุ่มโรงแรม / รีสอร์ท / โฮสเทล',
  'สำนักงาน / ออฟฟิศ / หน่วยงานราชการ',
  'ธุรกิจของพรีเมียม / ของสมนาคุณ / จัดอีเวนต์',
  'ร้านอาหาร / คาเฟ่',
  BUSINESS_TYPE_OTHER
]

const APPLIANCE_OPTIONS = ['ตู้เย็น', 'ตู้แช่แข็ง', 'เครื่องชงกาแฟ', 'ทีวี', 'เครื่องฟอกอากาศ', 'เตาอบ', 'เครื่องผสมอาหาร']

const PURCHASE_REASON_OPTIONS = ['สำหรับใช้เอง', 'สำหรับธุรกิจ']

function FieldSection({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary, #1b315e)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  )
}

export default function PublicLeadPage() {
  const source = new URLSearchParams(window.location.search).get('src') || ''
  const [f, setF] = useState({
    full_name: '', phone: '', email: '', subject: '',
    position: '', business_type: '', businessTypeOther: '', appliance_interest: [], purchase_reason: '', message: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const toggleAppliance = (value) => setF(s => ({
    ...s,
    appliance_interest: s.appliance_interest.includes(value)
      ? s.appliance_interest.filter(v => v !== value)
      : [...s.appliance_interest, value]
  }))

  const isOtherBusiness = f.business_type === BUSINESS_TYPE_OTHER

  const submit = async (e) => {
    e.preventDefault()
    if (!f.subject.trim() || !f.full_name.trim() || !f.phone.trim()) { setError('กรุณากรอกหัวข้อ ชื่อ และเบอร์โทรศัพท์'); return }
    if (isOtherBusiness && !f.businessTypeOther.trim()) { setError('กรุณาระบุประเภทธุรกิจ'); return }
    setSubmitting(true)
    setError('')
    try {
      const business_type = isOtherBusiness ? f.businessTypeOther.trim() : (f.business_type || null)
      await submitPublicLead({
        subject: f.subject, full_name: f.full_name, phone: f.phone, email: f.email, message: f.message, source,
        position: f.position || null, business_type, appliance_interest: f.appliance_interest, purchase_reason: f.purchase_reason || null
      })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 460, width: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
        <div style={{ background: '#1b315e', color: '#fff', padding: '28px 24px', textAlign: 'center' }}>
          <img src="/worldtech-logo.png" alt="Worldtech" style={{ height: 40, marginBottom: 10 }} />
          <div style={{ fontSize: 13, fontWeight: 600, opacity: .95 }}>บริษัท เวิลด์เทค อีเล็คโทรนิค จำกัด</div>
          <div style={{ fontSize: 11, opacity: .7, marginTop: 2 }}>ผู้จัดจำหน่ายเครื่องใช้ไฟฟ้าสำหรับธุรกิจและองค์กร</div>
        </div>
        <div style={{ padding: 24 }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--success)' }}>✓</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>ได้รับข้อมูลแล้ว</div>
              <div style={{ fontSize: 13, color: 'var(--text-light)' }}>เซลล์จะติดต่อกลับโดยเร็วที่สุด</div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <FieldSection title="ข้อมูลติดต่อ">
                <div className="form-group">
                  <label className="form-label required">ชื่อ-นามสกุล</label>
                  <input className="form-control" value={f.full_name} onChange={set('full_name')} placeholder="เช่น สมชาย ใจดี" />
                </div>
                <div className="form-group">
                  <label className="form-label required">เบอร์โทรศัพท์</label>
                  <input className="form-control" value={f.phone} onChange={set('phone')} placeholder="08x-xxx-xxxx" />
                </div>
                <div className="form-group">
                  <label className="form-label">อีเมล</label>
                  <input className="form-control" type="email" value={f.email} onChange={set('email')} placeholder="ไม่บังคับ" />
                </div>
              </FieldSection>

              <FieldSection title="เรื่องที่ต้องการติดต่อ">
                <div className="form-group">
                  <label className="form-label required">หัวข้อที่ต้องการติดต่อ</label>
                  <input className="form-control" value={f.subject} onChange={set('subject')} placeholder="เช่น สอบถามราคาเครื่องฟอกอากาศ" />
                </div>
              </FieldSection>

              <FieldSection title="ข้อมูลเพิ่มเติม (ช่วยให้เซลล์ติดต่อกลับได้ตรงจุดขึ้น)">
                <div className="form-group">
                  <label className="form-label">ตำแหน่ง</label>
                  <select className="form-control" value={f.position} onChange={set('position')}>
                    <option value="">-- เลือก --</option>
                    {POSITION_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">ประเภทธุรกิจ</label>
                  <select className="form-control" value={f.business_type} onChange={set('business_type')}>
                    <option value="">-- เลือก --</option>
                    {BUSINESS_TYPE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  {isOtherBusiness && (
                    <input className="form-control" style={{ marginTop: 8 }} value={f.businessTypeOther} onChange={set('businessTypeOther')} placeholder="ระบุประเภทธุรกิจของคุณ" />
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">ประเภทเครื่องใช้ไฟฟ้าที่สนใจ (เลือกได้หลายข้อ)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                    {APPLIANCE_OPTIONS.map(v => (
                      <label key={v} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={f.appliance_interest.includes(v)} onChange={() => toggleAppliance(v)} /> {v}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">เหตุผลในการซื้อ</label>
                  <select className="form-control" value={f.purchase_reason} onChange={set('purchase_reason')}>
                    <option value="">-- เลือก --</option>
                    {PURCHASE_REASON_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">ข้อความเพิ่มเติม</label>
                  <textarea className="form-control" rows={2} value={f.message} onChange={set('message')} placeholder="ไม่บังคับ" />
                </div>
              </FieldSection>

              {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button className="btn btn-primary" type="submit" disabled={submitting} style={{ minWidth: 200, padding: '10px 32px' }}>
                  {submitting ? 'กำลังส่ง...' : 'ส่งข้อมูล'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-light)', textAlign: 'center', marginTop: 14 }}>
                หรือติดต่อเราโดยตรงทาง LINE: <b>@worldtechthailand</b>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
