import { useState } from 'react'
import { uploadSignedQuotation, deleteSignedQuotation, getAttachmentUrl, uploadSignedFileToDrive } from '../lib/api'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

// ปุ่มแนบ/ดาวน์โหลด/ลบไฟล์ใบเสนอราคาที่ลูกค้าเซ็นแล้วส่งกลับมา — ใช้ร่วมกันทั้งหน้ารายการใบเสนอราคาและแท็บในหน้าบริษัท
export default function SignedQuotationControl({ quotation, manageable, onChanged }) {
  const { toast, confirm } = useUi()
  const { t, lang } = useLanguage()
  const [busy, setBusy] = useState(false)

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      await uploadSignedQuotation(quotation.id, file)
      toast(t('แนบไฟล์เซ็นกลับสำเร็จ'), 'success')
      onChanged()
      // มิเรอร์ขึ้น Google Drive เป็น background — ไม่บล็อก ถ้าพลาดแค่เตือน ไม่กระทบไฟล์ที่แนบสำเร็จแล้วใน Supabase
      uploadSignedFileToDrive(quotation, file).catch(err => toast(lang === 'en' ? 'Failed to mirror file to Google Drive: ' + err.message : 'มิเรอร์ไฟล์ขึ้น Google Drive ไม่สำเร็จ: ' + err.message, 'error'))
    } catch (err) {
      toast(lang === 'en' ? 'Failed to attach file: ' + err.message : 'แนบไฟล์ไม่สำเร็จ: ' + err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const onDownload = async () => {
    try {
      const url = await getAttachmentUrl(quotation.file_url)
      window.open(url, '_blank')
    } catch (err) {
      toast(lang === 'en' ? 'Failed to open file: ' + err.message : 'เปิดไฟล์ไม่สำเร็จ: ' + err.message, 'error')
    }
  }

  const onDelete = async () => {
    if (!(await confirm(t('ลบไฟล์ใบเสนอราคาที่เซ็นกลับนี้?')))) return
    try {
      await deleteSignedQuotation(quotation.id, quotation.file_url)
      toast(t('ลบไฟล์สำเร็จ'), 'success')
      onChanged()
    } catch (err) {
      toast(lang === 'en' ? 'Failed to delete: ' + err.message : 'ลบไม่สำเร็จ: ' + err.message, 'error')
    }
  }

  if (quotation.file_url) {
    return (
      <span style={{ display: 'inline-flex', gap: 4 }}>
        <button className="btn btn-outline btn-xs" onClick={onDownload} title={quotation.signed_file_name || ''}>{t('ไฟล์เซ็นกลับ')}</button>
        {manageable && <button className="btn btn-danger btn-xs" onClick={onDelete}>{t('ลบไฟล์เซ็นกลับ')}</button>}
      </span>
    )
  }

  if (!manageable) return null

  return (
    <label className="btn btn-outline btn-xs" style={{ cursor: busy ? 'not-allowed' : 'pointer' }}>
      {busy ? t('กำลังอัปโหลด...') : t('แนบไฟล์เซ็นกลับ')}
      <input type="file" style={{ display: 'none' }} onChange={onUpload} disabled={busy} />
    </label>
  )
}
