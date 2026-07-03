# Worldtech B2B CRM (React + Supabase)

เวอร์ชัน rebuild จาก Google Apps Script เดิม ให้ deploy บน Netlify ได้

## โครงสร้าง
- **Frontend:** React + Vite (ธีมสี Navy/Yellow เดิม)
- **Backend/Database:** Supabase (Postgres + Auth)
- **PDF ใบเสนอราคา:** สร้างผ่าน browser print dialog (บันทึกเป็น PDF ได้ทันที ไม่ต้องพึ่ง Google Docs)

## ขั้นตอนติดตั้ง

### 1. สร้าง Supabase Project
1. ไปที่ https://supabase.com สร้างโปรเจกต์ใหม่ (ฟรีได้)
2. เปิด **SQL Editor** → New query → คัดลอกทั้งหมดจาก `supabase/schema.sql` มาวาง → Run
3. ไปที่ **Authentication > Users** → เพิ่มผู้ใช้งาน (อีเมล/รหัสผ่าน) สำหรับพนักงานที่จะเข้าระบบ
   - หรือเปิด **Authentication > Providers** ตั้งค่า sign-up ถ้าต้องการให้สมัครเองได้
4. ไปที่ **Project Settings > API** คัดลอกค่า:
   - `Project URL` → ใช้เป็น `VITE_SUPABASE_URL`
   - `anon public` key → ใช้เป็น `VITE_SUPABASE_ANON_KEY`

### 2. ตั้งค่าโปรเจกต์ในเครื่อง
```bash
npm install
cp .env.example .env
# แก้ .env ใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY ของคุณ
npm run dev
```
เปิด http://localhost:5173 แล้ว login ด้วยบัญชีที่สร้างไว้ในขั้นตอนที่ 1.3

### 3. ตั้งค่าข้อมูลบริษัท (สำหรับหัวใบเสนอราคา PDF) — ไม่บังคับ
ใน Supabase SQL Editor รัน:
```sql
insert into settings (key, value) values
  ('COMPANY_NAME', 'บริษัทของคุณ จำกัด'),
  ('COMPANY_ADDRESS', 'ที่อยู่บริษัท'),
  ('COMPANY_PHONE', '02-xxx-xxxx'),
  ('COMPANY_EMAIL', 'contact@yourcompany.com')
on conflict (key) do update set value = excluded.value;
```

## Deploy ขึ้น Netlify

### วิธีที่ 1: ผ่านเว็บ Netlify (ง่ายที่สุด)
1. Push โค้ดทั้งโฟลเดอร์นี้ขึ้น GitHub repo
2. ที่ Netlify → **Add new site > Import an existing project** → เลือก repo
3. Build command: `npm run build`, Publish directory: `dist` (ตั้งไว้ให้แล้วใน `netlify.toml`)
4. ไปที่ **Site settings > Environment variables** เพิ่ม:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy

### วิธีที่ 2: Netlify CLI
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set VITE_SUPABASE_URL "https://xxxx.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "your-anon-key"
netlify deploy --prod
```

## ย้ายข้อมูลเดิมจาก Google Sheets
ถ้ามีข้อมูลอยู่ใน Google Sheet เดิมอยู่แล้ว:
1. Export แต่ละชีทเป็น CSV (File > Download > CSV)
2. ใน Supabase → Table Editor → เลือกตารางที่ตรงกัน (เช่น `companies`) → **Insert > Import data from CSV**
3. แม็ปคอลัมน์ให้ตรงกับชื่อฟิลด์ภาษาอังกฤษในตาราง (ดูชื่อคอลัมน์ได้จาก `supabase/schema.sql`)
4. ทำทีละตารางตามลำดับ: companies → contacts/deals → activities/tasks/quotations (เพราะมี foreign key อ้างถึงกัน)

## หมายเหตุ
- ฟีเจอร์อัปโหลดเอกสารแนบต่อบริษัท (เดิมใช้ Google Drive) ยังไม่ได้ทำในเวอร์ชันนี้ — แนะนำให้ใช้ Supabase Storage ถ้าต้องการฟีเจอร์นี้ต่อ (แจ้งได้)
- Row Level Security เปิดแบบ "authenticated ทำได้ทุกอย่าง" ไว้ก่อน ถ้าต้องการแยกสิทธิ์ตาม Role (Admin/Sale) แจ้งได้ จะเพิ่ม policy ให้
