import { useState } from 'react'
import { submitPublicLead } from '../lib/api'
import '../App.css'

// หน้าฟอร์มลีดสาธารณะ — ไม่ต้อง login เอาลิงก์ไปแปะใน Facebook Ads/เว็บไซต์ได้เลย (เช่น /lead?src=facebook)
// ที่มา (source) อ่านจาก query param ให้อัตโนมัติ ไม่ต้องให้ลูกค้ากรอกเอง
export default function PublicLeadPage() {
  const source = new URLSearchParams(window.location.search).get('src') || ''
  const [f, setF] = useState({ full_name: '', phone: '', email: '', interested_product: '', message: '' })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!f.full_name.trim() || !f.phone.trim()) { setError('กรุณากรอกชื่อและเบอร์โทรศัพท์'); return }
    setSubmitting(true)
    setError('')
    try {
      await submitPublicLead({ ...f, source })
      setDone(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f9', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
        <div style={{ background: '#1b315e', color: '#fff', padding: '20px 24px', textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Worldtech</div>
          <div style={{ fontSize: 13, opacity: .85, marginTop: 4 }}>สนใจสินค้า? กรอกข้อมูลไว้ เดี๋ยวเซลล์ติดต่อกลับ</div>
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
              <div className="form-group">
                <label className="form-label">สนใจสินค้า / รุ่นไหน</label>
                <input className="form-control" value={f.interested_product} onChange={set('interested_product')} placeholder="เช่น เครื่องฟอกอากาศ, พัดลมอุตสาหกรรม" />
              </div>
              <div className="form-group">
                <label className="form-label">ข้อความเพิ่มเติม</label>
                <textarea className="form-control" rows={2} value={f.message} onChange={set('message')} placeholder="ไม่บังคับ" />
              </div>
              {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
                {submitting ? 'กำลังส่ง...' : 'ส่งข้อมูล'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
