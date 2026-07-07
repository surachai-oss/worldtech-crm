import { JWT } from 'google-auth-library'
import { createClient } from '@supabase/supabase-js'

// อัปโหลด/เขียนทับไฟล์ใน Google Drive (โฟลเดอร์ปี > เดือน ใต้โฟลเดอร์หลักที่ตั้งไว้) — ต้อง login ก่อนถึงจะเรียกได้
// ใช้ Google Service Account key ที่แชร์สิทธิ์ Editor ไว้กับโฟลเดอร์เป้าหมายแล้วเท่านั้น (ดูขั้นตอนตั้งค่าใน README)
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files'

async function getAccessToken() {
  const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyJson) throw new Error('เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า GOOGLE_SERVICE_ACCOUNT_KEY (ดู README)')
  let key
  try { key = JSON.parse(keyJson) } catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY ไม่ใช่ JSON ที่ถูกต้อง') }
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

async function findFolder(name, parentId, token) {
  const q = `name='${escapeQ(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  const json = await driveFetch(`${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)`, token)
  return json.files?.[0]?.id || null
}

async function createFolder(name, parentId, token) {
  const json = await driveFetch(DRIVE_FILES_URL, token, {
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
  const json = await driveFetch(`${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id,name)`, token)
  return json.files?.[0]?.id || null
}

async function updateFileContent(fileId, buffer, mimeType, token) {
  const json = await driveFetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, token, {
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
  const json = await driveFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, token, {
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
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  if (!supabaseUrl || !serviceKey) return json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY (ดู README)' }, 500)
  if (!rootFolderId) return json({ error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า GOOGLE_DRIVE_ROOT_FOLDER_ID (ดู README)' }, 500)

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'ไม่พบสิทธิ์เข้าใช้งาน' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token)
  if (callerErr || !callerData?.user) return json({ error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, 401)

  let body
  try { body = await req.json() } catch { return json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400) }

  const { fileBase64, mimeType, fileName, year, month, monthNameTh, existingFileId } = body || {}
  if (!fileBase64 || !fileName || !year || !month) return json({ error: 'ข้อมูลไม่ครบ (fileBase64/fileName/year/month)' }, 400)

  try {
    const accessToken = await getAccessToken()
    const yearFolderId = await findOrCreateFolder(String(year), rootFolderId, accessToken)
    const monthFolderName = `${String(month).padStart(2, '0')} - ${monthNameTh || month}`
    const monthFolderId = await findOrCreateFolder(monthFolderName, yearFolderId, accessToken)

    const buffer = Buffer.from(fileBase64, 'base64')
    const safeName = String(fileName).replace(/[\\/:*?"<>|]/g, '_')
    const type = mimeType || 'application/pdf'

    let fileId = existingFileId
    if (fileId) {
      await updateFileContent(fileId, buffer, type, accessToken)
    } else {
      fileId = await findFile(safeName, monthFolderId, accessToken)
      if (fileId) await updateFileContent(fileId, buffer, type, accessToken)
      else fileId = await createFile(safeName, monthFolderId, buffer, type, accessToken)
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
