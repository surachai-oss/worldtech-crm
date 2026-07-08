import { JWT } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'

// อัปโหลด/เขียนทับไฟล์ใน Google Drive (สร้าง/หาโฟลเดอร์ตาม folderPath ที่ส่งมาไล่ทีละชั้นใต้โฟลเดอร์หลัก) — ต้อง login ก่อนถึงจะเรียกได้
// โฟลเดอร์หลักเลือกจาก purpose: 'company-doc' ใช้ GOOGLE_DRIVE_COMPANY_DOCS_FOLDER_ID, อย่างอื่น (ใบเสนอราคา) ใช้ GOOGLE_DRIVE_ROOT_FOLDER_ID
// ต้องเป็น Google Shared Drive เท่านั้น (Service Account ไม่มีโควต้าพื้นที่ของตัวเอง) แชร์สิทธิ์ Content Manager ให้ Service Account ไว้ (ดูขั้นตอนตั้งค่าใน README)
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'

// รับได้ทั้ง JSON ตรงๆ หรือ Base64 ของ JSON (แนะนำให้ใช้ Base64 เพราะ private_key มี \n ฝังอยู่ วาง JSON ตรงๆ ผ่านช่อง env var มักเพี้ยน)
function parseServiceAccountKey(raw) {
  const trimmed = String(raw).trim()
  try { return JSON.parse(trimmed) } catch { /* ลอง base64 ต่อ */ }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8')
    return JSON.parse(decoded)
  } catch { /* ตกไป throw ข้างล่างพร้อม diagnostic ที่ไม่หลุด secret */ }
  // แสดงความยาว + ตัวอักษรหัว-ท้ายเพื่อ debug โดยไม่โชว์ private_key (อยู่กลางไฟล์ ไม่ใช่หัว/ท้าย)
  throw new Error(`GOOGLE_SERVICE_ACCOUNT_KEY ไม่ใช่ JSON หรือ Base64 ของ JSON ที่ถูกต้อง (ยาว ${trimmed.length} ตัวอักษร ขึ้นต้นด้วย "${trimmed.slice(0, 12)}" ลงท้ายด้วย "${trimmed.slice(-12)}")`)
}

async function getAccessToken() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า GOOGLE_SERVICE_ACCOUNT_KEY (ดู README)')
  const key = parseServiceAccountKey(keyJson)
  const client = new JWT({ email: key.client_email, key: key.private_key, scopes: ['https://www.googleapis.com/auth/drive'] })
  const { token } = await client.getAccessToken()
  return token
}

function escapeQ(s) {
  return String(s).replace(/'/g, "\\'")
}

async function driveFetch(url, token, init) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error?.message || `Drive API error (${res.status})`)
  return json
}

// ต้องเติม supportsAllDrives/includeItemsFromAllDrives ทุกคำขอ ไม่งั้น Drive API จะมองไม่เห็น/สร้างไฟล์ใน Shared Drive ไม่ได้
// (Service Account ไม่มีโควต้าพื้นที่ของตัวเอง ต้องใช้ Shared Drive เท่านั้น ดู README)
async function findFolder(name, parentId, token) {
  const q = `name='${escapeQ(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const json = await driveFetch(`${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, token)
  return json.files?.[0]?.id || null
}

async function createFolder(name, parentId, token) {
  const json = await driveFetch(`${DRIVE_FILES_URL}?supportsAllDrives=true`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  })
  return json.id
}

async function findOrCreateFolder(name, parentId, token) {
  return (await findFolder(name, parentId, token)) || (await createFolder(name, parentId, token))
}

async function findFile(name, parentId, token) {
  const q = `name='${escapeQ(name)}' and '${parentId}' in parents and trashed=false`
  const json = await driveFetch(`${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`, token)
  return json.files?.[0]?.id || null
}

async function updateFileContent(fileId, buffer, mimeType, token) {
  const json = await driveFetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media&supportsAllDrives=true`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': mimeType },
    body: buffer
  })
  return json.id
}

async function createFile(name, parentId, buffer, mimeType, token) {
  const boundary = 'drive-upload-' + Math.random().toString(16).slice(2)
  const metadata = JSON.stringify({ name, parents: [parentId] })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`)
  ])
  const json = await driveFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true`, token, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  })
  return json.id
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY (ดู README)' }, 500)

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'ไม่พบสิทธิ์เข้าใช้งาน' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !callerData?.user) return json({ error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, 401)

  let body
  try { body = await req.json() } catch { return json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400) }

  const { fileBase64, mimeType, fileName, folderPath, existingFileId, purpose } = body || {}
  if (!fileBase64 || !fileName || !Array.isArray(folderPath) || !folderPath.length) {
    return json({ error: 'ข้อมูลไม่ครบ (fileBase64/fileName/folderPath)' }, 400)
  }

  // แยกโฟลเดอร์หลักตามประเภทงาน — ใบเสนอราคากับเอกสารแนบบริษัทเก็บคนละโฟลเดอร์บน Drive
  const rootEnvName = purpose === 'company-doc' ? 'GOOGLE_DRIVE_COMPANY_DOCS_FOLDER_ID' : 'GOOGLE_DRIVE_ROOT_FOLDER_ID'
  const rootFolderId = process.env[rootEnvName]
  if (!rootFolderId) return json({ error: `เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า ${rootEnvName} (ดู README)` }, 500)

  try {
    const accessToken = await getAccessToken()
    let parentId = rootFolderId
    for (const segment of folderPath) {
      parentId = await findOrCreateFolder(String(segment), parentId, accessToken)
    }

    const buffer = Buffer.from(fileBase64, 'base64')
    const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_')
    const type = mimeType || 'application/pdf'

    let fileId = existingFileId
    if (fileId) {
      await updateFileContent(fileId, buffer, type, accessToken)
    } else {
      fileId = await findFile(safeName, parentId, accessToken)
      if (fileId) await updateFileContent(fileId, buffer, type, accessToken)
      else fileId = await createFile(safeName, parentId, buffer, type, accessToken)
    }

    return json({ fileId })
  } catch (e) {
    console.error('upload-drive-file failed:', e.message, e.stack)
    return json({ error: e.message || 'อัปโหลดขึ้น Google Drive ไม่สำเร็จ' }, 500)
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
