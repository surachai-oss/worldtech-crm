import { createClient } from '@supabase/supabase-js'

// อ่านแคตตาล็อกให้หน้าสาธารณะ /catalog/:slug — ลูกค้าไม่ต้อง login
// ใช้ Service Role Key แทนการเปิด RLS ให้ anon เหมือนฟอร์มลีดสาธารณะ (ดู submit-lead.js)
// ข้อดีคือ "ฟังก์ชันนี้" เป็นคนตัดสินว่าคอลัมน์ไหนออกไปข้างนอกได้ ไม่ใช่ policy ที่แก้ทีเดียวหลุดทั้งตาราง
// สิ่งที่ไม่เคยส่งออก: id ภายใน, created_by/updated_by, ชื่อผู้ใช้ในระบบ, สถานะร่าง, ยอดวิว
// ช่องติดต่อถูกถอดออกจากหน้าลูกค้าแล้ว จึงไม่ดึงคอลัมน์นั้นมาด้วย (คอลัมน์ยังอยู่ในตารางเฉยๆ)

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export default async (req) => {
  const url = new URL(req.url)
  const slug = (url.searchParams.get('slug') || '').trim().toLowerCase()
  if (!slug || slug.length > 120 || !SLUG_RE.test(slug)) return json({ state: 'not_found' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return json({ state: 'error', error: 'server not configured' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: cat, error } = await admin
    .from('catalogs')
    .select('id, catalog_name, catalog_slug, description, cover_image_url, status, updated_at')
    .eq('catalog_slug', slug)
    .maybeSingle()

  if (error) return json({ state: 'error' }, 500)
  if (!cat) return json({ state: 'not_found' })
  // draft/hidden/archived ทุกแบบตอบเหมือนกันหมด ไม่บอกคนนอกว่าสถานะจริงคืออะไร
  if (cat.status !== 'published') return json({ state: 'not_published' })

  const { data: imgs } = await admin
    .from('catalog_images')
    .select('image_url, caption, display_order')
    .eq('catalog_id', cat.id)
    .eq('is_visible', true)
    .eq('is_deleted', false)
    .order('display_order', { ascending: true })

  return json({
    state: 'ok',
    catalog: {
      name: cat.catalog_name,
      slug: cat.catalog_slug,
      description: cat.description || '',
      cover_image_url: cat.cover_image_url || '',
      updated_at: cat.updated_at,
    },
    images: (imgs || []).map(i => ({ url: i.image_url, caption: i.caption || '' })),
  })
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // แคชสั้นๆ ที่ CDN — ลูกค้าหลายคนเปิดลิงก์เดียวกันพร้อมกันตอนเซลล์เพิ่งส่งใน LINE
      // 60 วิ ทำให้แก้แคตตาล็อกแล้วเห็นผลเกือบทันที แต่ยังกัน cold start รัวๆ ได้
      'cache-control': 'public, max-age=0, must-revalidate',
      'netlify-cdn-cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  })
}
