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
   - ไฟล์นี้จะสร้างตารางทั้งหมด, Storage bucket `attachments` สำหรับเอกสารแนบ, และระบบสิทธิ์ Admin/Sale ให้อัตโนมัติ
   - ไฟล์รันซ้ำได้เสมอ (idempotent) ถ้าอัปเดตโปรเจกต์ในอนาคตให้รันไฟล์นี้ทับได้เลย
3. ไปที่ **Authentication > Users** → เพิ่มผู้ใช้งาน (อีเมล/รหัสผ่าน) สำหรับพนักงานที่จะเข้าระบบ
   - หรือเปิด **Authentication > Providers** ตั้งค่า sign-up ถ้าต้องการให้สมัครเองได้
   - ทุกบัญชีใหม่จะได้สิทธิ์ **"พนักงานขาย" (sale)** โดยอัตโนมัติ
4. ไปที่ **Project Settings > API** คัดลอกค่า:
   - `Project URL` → ใช้เป็น `VITE_SUPABASE_URL`
   - `anon public` key → ใช้เป็น `VITE_SUPABASE_ANON_KEY`
5. ตั้งให้ตัวเองเป็น **Admin คนแรก** — กลับไปที่ SQL Editor แล้วรัน:
   ```sql
   update profiles set role = 'admin' where email = 'you@company.com';
   ```
   (ต้อง login เข้าระบบอย่างน้อย 1 ครั้งก่อน เพื่อให้มีแถวใน `profiles` ให้อัปเดต) หลังจากนั้นเมนู "ผู้ใช้งาน" จะปรากฏใน Sidebar ให้จัดการสิทธิ์คนอื่นต่อได้จากในแอปเลย

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
   - `SUPABASE_SERVICE_ROLE_KEY` — คัดลอกจาก Supabase **Project Settings > API > service_role** (⚠️ **ห้ามใส่ prefix `VITE_`** ไม่งั้น Vite จะฝังคีย์นี้ไปกับโค้ดฝั่ง browser ซึ่งเท่ากับเปิดสิทธิ์สูงสุดให้ใครก็ได้ที่เปิด devtools ดู — ต้องเป็นตัวแปรฝั่ง server สำหรับ Netlify Function เท่านั้น) ใช้สำหรับฟีเจอร์ admin เพิ่มผู้ใช้งานจากในแอป
5. Deploy

### วิธีที่ 2: Netlify CLI
```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set VITE_SUPABASE_URL "https://xxxx.supabase.co"
netlify env:set VITE_SUPABASE_ANON_KEY "your-anon-key"
netlify env:set SUPABASE_SERVICE_ROLE_KEY "your-service-role-key"
netlify deploy --prod
```

### ทดสอบฟีเจอร์ "เพิ่มผู้ใช้งาน" ในเครื่อง
`npm run dev` (Vite) ไม่รัน Netlify Function ให้ ต้องใช้ Netlify CLI แทน:
```bash
npm install -g netlify-cli
netlify dev
```
แล้วตั้งค่า `SUPABASE_SERVICE_ROLE_KEY` ไว้ในไฟล์ `.env` ของเครื่อง (Netlify CLI จะอ่านจาก `.env` ให้ฟังก์ชันด้วย) หรือรันแล้ว deploy ขึ้น Netlify จริงเพื่อทดสอบก็ได้เช่นกัน

## ย้ายข้อมูลเดิมจาก Google Sheets
ถ้ามีข้อมูลอยู่ใน Google Sheet เดิมอยู่แล้ว:
1. Export แต่ละชีทเป็น CSV (File > Download > CSV)
2. ใน Supabase → Table Editor → เลือกตารางที่ตรงกัน (เช่น `companies`) → **Insert > Import data from CSV**
3. แม็ปคอลัมน์ให้ตรงกับชื่อฟิลด์ภาษาอังกฤษในตาราง (ดูชื่อคอลัมน์ได้จาก `supabase/schema.sql`)
4. ทำทีละตารางตามลำดับ: companies → contacts/deals → activities/tasks/quotations (เพราะมี foreign key อ้างถึงกัน)

## ฟีเจอร์ที่เพิ่มเข้ามา

### เอกสารแนบ (Attachments)
- แต่ละบริษัทมีแท็บ "เอกสารแนบ" ให้อัปโหลด/ดาวน์โหลด/ลบไฟล์ได้ (จำกัดไฟล์ละไม่เกิน 20MB)
- ไฟล์เก็บใน Supabase Storage bucket ชื่อ `attachments` (private bucket, เข้าถึงผ่าน signed URL อายุ 60 วินาทีเท่านั้น)

### สิทธิ์การใช้งาน Admin / Sale
- ผู้ใช้งานใหม่ทุกคนเริ่มต้นเป็น **พนักงานขาย (sale)** อัตโนมัติ — เห็น/แก้ไข/ลบได้เฉพาะข้อมูล (บริษัท, ดีล, งาน) ที่ตัวเองสร้าง บวกกับข้อมูลเก่าที่ยังไม่มีเจ้าของ
- **ผู้ดูแลระบบ (admin)** เห็น/แก้ไข/ลบได้ทุกอย่าง และมีเมนู "ผู้ใช้งาน" ในการปรับสิทธิ์คนอื่น
- ผู้ติดต่อ/กิจกรรม/ใบเสนอราคา/เอกสารแนบ สืบสิทธิ์ตามบริษัทแม่ (ถ้าเห็นบริษัทได้ ก็จัดการของในบริษัทนั้นได้)
- สิทธิ์ถูกบังคับที่ระดับฐานข้อมูล (Row Level Security) เสมอ — ปุ่มที่ซ่อนในหน้าเว็บเป็นแค่ UX เท่านั้น
- Admin เพิ่มผู้ใช้งานใหม่จากในแอปได้เลยที่หน้า "ผู้ใช้งาน" → **+ เพิ่มผู้ใช้งาน** (กรอกอีเมล/ชื่อ/ตั้งรหัสผ่านให้เลย ยังไม่มีอีเมลแจ้งอัตโนมัติ ต้องคัดลอกรหัสผ่านไปแจ้งพนักงานเอง)
  - ฟีเจอร์นี้รันผ่าน Netlify Function ที่ใช้ **Service Role Key** (สิทธิ์สูงสุด ข้าม RLS ทั้งหมด) — คีย์นี้อยู่ฝั่ง server เท่านั้น ต้องตั้งค่าเพิ่มก่อนใช้งานได้ (ดูขั้นตอนด้านล่าง)

### Pagination
- หน้า บริษัทลูกค้า / ผู้ติดต่อ / ประวัติการติดต่อ / งาน Follow-up / ใบเสนอราคา โหลดข้อมูลทีละหน้า (20 รายการ) จากฐานข้อมูลโดยตรง แทนการโหลดทั้งหมดมาไว้ในเบราว์เซอร์
- Dashboard, ค้นหาส่วนกลาง, หน้ารายละเอียดบริษัท (แท็บย่อย) และ Kanban ดีล ยังใช้ข้อมูลชุดเต็มเหมือนเดิม เพราะต้องคำนวณสรุปข้ามทั้งระบบ — เหมาะกับข้อมูลระดับหลักพันรายการ ถ้าข้อมูลโตกว่านี้มากควรแยกไปคำนวณสรุปฝั่ง Postgres (view/RPC) แทน

### นำเข้าบริษัทลูกค้าจากไฟล์ + แนบเอกสารตอนสร้างบริษัท
- หน้า "บริษัทลูกค้า" มีปุ่ม **"📥 นำเข้าจากไฟล์"** — ดาวน์โหลด Template (.csv) กรอกข้อมูลใน Excel แล้วบันทึกเป็น .csv กลับมาอัปโหลด ระบบจะพรีวิวแถวที่ถูก/ผิดก่อนยืนยันนำเข้า (รองรับเฉพาะ .csv โดยตั้งใจ — ไลบรารี `xlsx` ที่มีบน npm มีช่องโหว่ความปลอดภัยที่ยังไม่มีแพตช์ เลยเลือกใช้ `papaparse` ที่ปลอดภัยกว่าแทน)
- ฟอร์มเพิ่ม/แก้ไขบริษัทมีช่องแนบเอกสาร (ภพ20, หนังสือรับรองบริษัท ฯลฯ) ได้เลยตอนสร้าง/แก้ไขบริษัท — ไฟล์จะถูกเก็บในระบบเอกสารแนบเดียวกับแท็บ "เอกสารแนบ"

### Dropdown แก้ไขได้เอง (Picklists)
- Dropdown ทุกตัวที่ใช้กรอกข้อมูล (อุตสาหกรรม, สถานะบริษัท, Stage ดีล, ประเภทกิจกรรม, ลำดับความสำคัญ/สถานะงาน, สถานะใบเสนอราคา, ที่มาลูกค้า) มีปุ่ม **✏️** ข้างๆ ให้เพิ่ม/ลบตัวเลือกได้ทันทีโดยไม่ต้องไปหน้าตั้งค่าแยก — คล้าย dropdown list ที่แก้ไขได้ใน Google Sheets
- **เฉพาะผู้ดูแลระบบ (admin)** เท่านั้นที่เห็นปุ่ม ✏️ และแก้ไข/เพิ่ม/ลบตัวเลือกได้ — พนักงานขายเลือกจากตัวเลือกที่มีอยู่ได้อย่างเดียว บังคับจริงที่ RLS policy `picklists write` (ทุกคน login แล้วยังอ่าน/เลือกตัวเลือกได้ปกติผ่าน `picklists select`)
- ⚠️ **ข้อควรระวัง:** ค่าบางตัวถูกผูกกับ logic ในโค้ดตรงๆ (`Closed Won`/`Closed Lost` ใช้คำนวณยอดดีลที่ปิดสำเร็จ, `เสร็จสิ้น` ใช้เช็คงานที่เสร็จแล้ว, `Active` ใช้นับบริษัท Active ใน Dashboard) ถ้าลบหรือเปลี่ยนชื่อค่าพวกนี้ ตัวเลขสรุปที่เกี่ยวข้องจะไม่ถูกต้องจนกว่าจะรีแฟกเตอร์โค้ดส่วนนั้นเพิ่ม (ตามที่ตกลงกันว่ายอมรับความเสี่ยงนี้ไว้ก่อน)
- รายการเริ่มต้นทั้งหมดถูก seed มาจากค่าเดิมที่เคยฮาร์ดโค้ดไว้ในโค้ด (ไม่มีอะไรหายไป) เก็บอยู่ในตาราง `picklists` ใหม่ — หน้า "ที่มาลูกค้า" เดิมถูกลบออกแล้ว เพราะปุ่ม ✏️ ทำหน้าที่แทนได้ในตัว
