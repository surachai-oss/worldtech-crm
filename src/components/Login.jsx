import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useLanguage } from './LanguageContext'

export default function Login() {
  const { lang, setLang, t } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setErr(error.message)
  }

  return (
    <div className="login-screen">
      <form className="login-box" onSubmit={submit}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 12 }}>
          <button type="button" className={`btn btn-xs ${lang === 'th' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setLang('th')}>ไทย</button>
          <button type="button" className={`btn btn-xs ${lang === 'en' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setLang('en')}>EN</button>
        </div>
        <div className="brand">Worldtech B2B CRM</div>
        <div className="brand-sub">{t('เข้าสู่ระบบด้วยบัญชีที่ได้รับสิทธิ์')}</div>
        <div className="form-group">
          <label className="form-label required">{t('อีเมล')}</label>
          <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label required">{t('รหัสผ่าน')}</label>
          <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          {loading ? t('กำลังเข้าสู่ระบบ...') : t('เข้าสู่ระบบ')}
        </button>
        {err && <div className="login-error">{err}</div>}
      </form>
    </div>
  )
}
