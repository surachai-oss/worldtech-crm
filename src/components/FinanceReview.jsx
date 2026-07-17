import { useEffect, useState } from 'react'
import { fetchPaymentRequests, listPaymentItems, getPaymentSlipUrl, PAYMENT_STATUS_LIST, PAYMENT_METHOD_OTHER } from '../lib/api'
import { exportPaymentRequestsToExcel } from '../lib/importExport'
import { fmtCurrency, fmtDate, paymentStatusLabel, paymentBadgeClass } from '../lib/format'
import { useUi } from './UiContext'
import { useLanguage } from './LanguageContext'

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

// ป็อปอัปให้บัญชีดูรายละเอียด + สลิป + รายการสินค้า แล้วเลือกผลตรวจ (อนุมัติ/ขอข้อมูลเพิ่ม/ยอดไม่ตรง/ปฏิเสธ)
// ตอนอนุมัติ: บังคับระบุชื่อผู้อนุมัติ (ลายเซ็น) + ใส่ Ref No. ได้ (ไม่บังคับ)
function ReviewModal({ pr, currentUserName, onClose, onApprove, onNeedInfo, onMismatch, onReject }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [items, setItems] = useState(null)
  const [remark, setRemark] = useState('')
  const [approverName, setApproverName] = useState(currentUserName || '')
  // เติมค่าจาก pr.finance_ref_no ถ้าเคยกรอกไว้แล้ว (เช่น กดอนุมัติไปแล้วกลับมาเปิดดูอีกครั้ง) กันดูเหมือนค่าที่กรอกไว้หายไป
  const [financeRefNo, setFinanceRefNo] = useState(pr.finance_ref_no || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => { listPaymentItems(pr.id).then(setItems).catch(() => setItems([])) }, [pr.id])

  const viewSlip = async () => {
    if (!pr.slip_file_url) { toast('ไม่มีสลิปแนบ', 'info'); return }
    try { window.open(await getPaymentSlipUrl(pr.slip_file_url), '_blank') }
    catch (e) { toast('เปิดสลิปไม่สำเร็จ: ' + e.message, 'error') }
  }

  // needRemark = ต้องกรอกหมายเหตุ (ทุกปุ่มยกเว้นอนุมัติ)
  const act = async (fn, needRemark) => {
    if (needRemark && !remark.trim()) { toast('กรุณากรอกหมายเหตุ', 'error'); return }
    setBusy(true)
    try { await fn(pr, remark.trim()); onClose() }
    catch (e) { toast('ทำรายการไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const approve = async () => {
    if (!approverName.trim()) { toast('กรุณาระบุชื่อผู้อนุมัติ', 'error'); return }
    setBusy(true)
    try { await onApprove(pr, { remark: remark.trim(), approverName: approverName.trim(), financeRefNo: financeRefNo.trim() }); onClose() }
    catch (e) { toast('อนุมัติไม่สำเร็จ: ' + e.message, 'error'); setBusy(false) }
  }

  const Row = ({ label, value }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--text-light)' }}>{label}</span><span style={{ fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
  const total = Number(pr.total_amount) || 0
  const exVat = round2(total / 1.07)
  const vat = round2(total - exVat)

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <div className="modal-title">{t('ตรวจสอบยอดโอน')} · {pr.pr_no}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <Row label={t('วันที่คำขอ')} value={fmtDate(pr.request_date || pr.created_at)} />
          <Row label={t('ลูกค้า')} value={pr.customer_name || pr.company?.name || '-'} />
          <Row label={t('ประเภทลูกค้า')} value={pr.credit_type || '-'} />
          <Row label={t('ประเภทการชำระ')} value={pr.payment_type || '-'} />
          <Row label={t('วิธีการชำระ')} value={(pr.payment_method === PAYMENT_METHOD_OTHER ? pr.payment_method_other : pr.payment_method) || '-'} />
          {pr.cod_tracking_no && <Row label="Tracking" value={pr.cod_tracking_no} />}
          <Row label={t('เลขที่ PO')} value={pr.po_reference || '-'} />
          <Row label={t('เลขที่ออเดอร์')} value={pr.order?.order_no || pr.order_no || '-'} />
          <Row label={t('ยอดไม่รวม VAT')} value={fmtCurrency(exVat)} />
          <Row label="VAT 7%" value={fmtCurrency(vat)} />
          <Row label={t('ยอดรวมทั้งสิ้น')} value={<b>{fmtCurrency(total)}</b>} />
          <Row label={t('ผู้ขอ')} value={pr.requested_by_name || '-'} />

          <div style={{ margin: '12px 0' }}>
            <button className="btn btn-outline btn-sm" onClick={viewSlip} disabled={!pr.slip_file_url}>{pr.slip_file_url ? t('ดูสลิปการโอน') : t('ไม่มีสลิปแนบ')}</button>
            <span style={{ fontSize: 12, color: 'var(--text-light)', marginLeft: 10 }}>{t('เทียบยอดโอน/ธนาคาร/วันเวลาจากสลิปจริง')}</span>
          </div>

          <div className="table-wrap">
            <table>
              <thead><tr><th>{lang === 'en' ? 'Product/Item' : 'สินค้า/รายการ'}</th><th style={{ textAlign: 'center' }}>{t('จำนวน')}</th><th style={{ textAlign: 'right' }}>{t('ราคา/หน่วย')}</th><th style={{ textAlign: 'right' }}>{t('รวม')}</th></tr></thead>
              <tbody>
                {items === null ? <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16, color: 'var(--text-light)' }}>{t('กำลังโหลด...')}</td></tr>
                  : items.length ? items.map(it => (
                    <tr key={it.id}>
                      <td>{it.product_name || it.sku || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{fmtCurrency(it.unit_price)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(it.line_total)}</td>
                    </tr>
                  )) : <tr><td colSpan={4} style={{ textAlign: 'center', padding: 16, color: 'var(--text-light)' }}>{t('ไม่มีรายการสินค้า')}</td></tr>}
              </tbody>
            </table>
          </div>

          {pr.remark && <div style={{ fontSize: 12, color: 'var(--text-light)', marginTop: 10 }}>{t('หมายเหตุจากเซลล์')}: {pr.remark}</div>}

          <div className="form-row" style={{ marginTop: 12 }}>
            <div className="form-group">
              <label className="form-label required">{t('ชื่อผู้อนุมัติ (ลายเซ็น)')}</label>
              <input className="form-control" value={approverName} onChange={e => setApproverName(e.target.value)} placeholder={t('ชื่อผู้ตรวจ/อนุมัติ')} />
            </div>
            <div className="form-group">
              <label className="form-label">Ref No.</label>
              <input className="form-control" value={financeRefNo} onChange={e => setFinanceRefNo(e.target.value)} placeholder={t('ไม่บังคับ')} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">{t('หมายเหตุจากบัญชี (บังคับกรอก ยกเว้นตอนอนุมัติ)')}</label>
            <textarea className="form-control" rows={2} value={remark} onChange={e => setRemark(e.target.value)} placeholder={lang === 'en' ? 'e.g. slip unclear / short by 500 / transfer not received' : 'เช่น สลิปไม่ชัด / ยอดขาด 500 / ไม่พบยอดเข้า'} />
          </div>
        </div>
        <div className="modal-footer" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>{t('ปิด')}</button>
          <button className="btn btn-danger" onClick={() => act(onReject, true)} disabled={busy}>{t('ปฏิเสธ')}</button>
          <button className="btn btn-outline" onClick={() => act(onMismatch, true)} disabled={busy} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>{t('ยอดไม่ตรง')}</button>
          <button className="btn btn-secondary" onClick={() => act(onNeedInfo, true)} disabled={busy}>{t('ขอข้อมูลเพิ่ม')}</button>
          <button className="btn btn-success" onClick={approve} disabled={busy}>{t('อนุมัติ')}</button>
        </div>
      </div>
    </div>
  )
}

export default function FinanceReview({ reloadKey, currentUserName, perm, onApprove, onNeedInfo, onMismatch, onReject, onDelete }) {
  const { toast } = useUi()
  const { t, lang } = useLanguage()
  const [status, setStatus] = useState('') // ค่าเริ่มต้นแสดงทุกสถานะ
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [review, setReview] = useState(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchPaymentRequests({ status, dateFrom: fromDate, dateTo: toDate })
      .then(r => { if (alive) setRows(r) })
      .catch(e => { if (alive) toast('โหลดข้อมูลไม่สำเร็จ: ' + e.message, 'error') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [status, fromDate, toDate, reloadKey, toast])

  const exportExcel = () => {
    if (!rows.length) { toast('ไม่มีข้อมูลให้ส่งออก', 'info'); return }
    exportPaymentRequestsToExcel(rows, 'ตรวจสอบยอดโอน.xlsx').catch(e => toast('ส่งออกไม่สำเร็จ: ' + e.message, 'error'))
  }

  return (
    <div className="list-view">
      <div className="section-header">
        <div className="section-title">{t('ตรวจสอบยอดโอน')} <span style={{ fontSize: 13, color: 'var(--text-light)', fontWeight: 400 }}>({rows.length} {t('รายการ')})</span></div>
        <button className="btn btn-outline" onClick={exportExcel}>{t('ส่งออกข้อมูล')}</button>
      </div>
      <div className="filter-bar">
        <select className="filter-select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">{t('ทุกสถานะ')}</option>
          {PAYMENT_STATUS_LIST.map(s => <option key={s} value={s}>{paymentStatusLabel(s)}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input className="filter-input" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} title={lang === 'en' ? 'Request date from' : 'วันที่คำขอ ตั้งแต่'} />
          <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{t('ถึง')}</span>
          <input className="filter-input" type="date" value={toDate} onChange={e => setToDate(e.target.value)} title={lang === 'en' ? 'Request date to' : 'วันที่คำขอ ถึง'} />
          {(fromDate || toDate) && <button className="btn btn-outline btn-sm" onClick={() => { setFromDate(''); setToDate('') }}>{t('ล้าง')}</button>}
        </div>
      </div>
      {review && <ReviewModal pr={review} currentUserName={currentUserName} onClose={() => setReview(null)} onApprove={onApprove} onNeedInfo={onNeedInfo} onMismatch={onMismatch} onReject={onReject} />}
      <div className="card list-card">
        <div className="table-wrap">
          {rows.length ? (
            <table>
              <thead><tr><th>{t('เลขคำขอ')}</th><th>{t('วันที่')}</th><th>{t('ลูกค้า')}</th><th>{t('ประเภทลูกค้า')}</th><th>{t('วิธีการชำระ')}</th><th>{t('ยอดรวม')}</th><th>{t('สถานะ')}</th><th>{t('ผู้ขอ')}</th><th>{t('การจัดการ')}</th></tr></thead>
              <tbody>
                {rows.map(pr => (
                  <tr key={pr.id}>
                    <td style={{ fontWeight: 600, color: 'var(--navy)' }}>
                      {pr.pr_no}
                      {(pr.order?.order_no || pr.order_no) && <div style={{ fontSize: 11, color: 'var(--text-light)', fontWeight: 400 }}>{lang === 'en' ? 'Order' : 'ออเดอร์'}: {pr.order?.order_no || pr.order_no}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(pr.request_date || pr.created_at)}</td>
                    <td>{pr.customer_name || pr.company?.name || '-'}</td>
                    <td style={{ fontSize: 12 }}>{pr.credit_type ? <span className={`badge ${pr.credit_type.startsWith('ลูกค้าเครดิต') ? 'badge-orange' : 'badge-green'}`}>{pr.credit_type}</span> : '-'}</td>
                    <td style={{ fontSize: 12 }}>{(pr.payment_method === PAYMENT_METHOD_OTHER ? pr.payment_method_other : pr.payment_method) || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{fmtCurrency(pr.total_amount)}</td>
                    <td><span className={`badge ${paymentBadgeClass(pr.status)}`}>{paymentStatusLabel(pr.status)}</span></td>
                    <td style={{ fontSize: 12 }}>{pr.requested_by_name || '-'}</td>
                    <td className="td-actions">
                      <button className="btn btn-secondary btn-xs" onClick={() => setReview(pr)}>{t('ตรวจสอบ')}</button>
                      {perm?.isAdmin && <button className="btn btn-danger btn-xs" onClick={() => onDelete(pr.id)}>{t('ลบ')}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <div className="empty-state"><div>{loading ? t('กำลังโหลด...') : t('ไม่มีรายการในสถานะนี้')}</div></div>}
        </div>
      </div>
    </div>
  )
}
