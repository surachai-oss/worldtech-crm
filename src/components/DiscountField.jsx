import { useLanguage } from './LanguageContext'

// ส่วนลดท้ายบิล — เลือกเปอร์เซ็นต์หรือจำนวนเงินคงที่ แล้วกรอกค่า ใช้ร่วมกันในดีล/ใบเสนอราคา/ออเดอร์ (ดู computeDealTotals ใน api.js)
export default function DiscountField({ type, value, onChangeType, onChangeValue }) {
  const { t } = useLanguage()
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className={`btn btn-sm ${type === 'เปอร์เซ็นต์' ? 'btn-primary' : 'btn-outline'}`} onClick={() => onChangeType('เปอร์เซ็นต์')}>{t('เปอร์เซ็นต์')}</button>
      <button type="button" className={`btn btn-sm ${type === 'จำนวนเงิน' ? 'btn-primary' : 'btn-outline'}`} onClick={() => onChangeType('จำนวนเงิน')}>{t('จำนวนเงิน')}</button>
      <input className="form-control" type="number" min="0" value={value || ''} onChange={e => onChangeValue(e.target.value)} style={{ maxWidth: 140 }} placeholder="0" disabled={!type} />
      {type && <button type="button" className="btn btn-outline btn-sm" onClick={() => { onChangeType(''); onChangeValue(0) }}>{t('ล้าง')}</button>}
    </div>
  )
}
