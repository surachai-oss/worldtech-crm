-- ============================================================
--  Worldtech B2B CRM — Supabase Schema
--  รันไฟล์นี้ใน Supabase SQL Editor (Project > SQL Editor > New query)
--  ไฟล์นี้ปลอดภัยที่จะรันซ้ำ (idempotent) — ถ้าเคยรันเวอร์ชันเก่าไปแล้ว
--  รันไฟล์นี้ทับได้เลยเพื่ออัปเดตเป็นเวอร์ชันล่าสุด (เพิ่ม attachments + role-based access)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ===== COMPANIES =====
create table if not exists companies (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  industry      text,
  phone         text,
  email         text,
  website       text,
  address       text,
  status        text default 'Active',
  owner         text,
  note          text,
  drive_folder  text,          -- ไม่ได้ใช้ Google Drive แล้ว เก็บไว้เผื่ออนาคต
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ===== CONTACTS =====
create table if not exists contacts (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid references companies(id) on delete cascade,
  full_name    text not null,
  position     text,
  department   text,
  phone        text,
  email        text,
  line_id      text,
  note         text,
  created_at   timestamptz default now()
);

-- ===== ACTIVITIES =====
create table if not exists activities (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid references companies(id) on delete cascade,
  contact_id   uuid references contacts(id) on delete set null,
  type         text not null,
  subject      text not null,
  detail       text,
  activity_date date default current_date,
  recorded_by  text,
  created_at   timestamptz default now()
);

-- ===== DEALS =====
create table if not exists deals (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid references companies(id) on delete cascade,
  name         text not null,
  stage        text default 'Lead',
  value        numeric default 0,
  close_date   date,
  owner        text,
  note         text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- follow_up_date = วันที่ต้องติดตามดีลนี้ต่อ, source = ที่มาของดีล (ไลน์/เทเลเซลล์/อีเมลล์ ฯลฯ จาก picklist "deal_sources")
alter table deals add column if not exists follow_up_date date;
alter table deals add column if not exists source text;

-- ===== PRODUCTS (รายการสินค้า สำหรับเลือกใส่ในรายการของดีล — รหัส+ชื่อเท่านั้น ไม่เก็บราคา กรอกราคาต่อหน่วยเองทุกครั้งตอนสร้างดีล) =====
create table if not exists products (
  id          uuid primary key default uuid_generate_v4(),
  code        text not null,
  name        text not null,
  created_at  timestamptz default now(),
  unique (code)
);

-- image_path = path ในไฟล์รูปสินค้า (bucket "product-images" — bucket นี้เป็น public ต่างจาก "attachments")
alter table products add column if not exists image_path text;

-- ===== DEAL ITEMS (รายการสินค้าในแต่ละดีล — ดีลหนึ่งมีได้หลายรายการ) =====
-- unit_price = ราคาต่อหน่วยที่กรอก (รวม VAT) — มูลค่ารวมของดีล (deals.value) คำนวณจากผลรวมรายการเหล่านี้ที่ฝั่ง frontend
create table if not exists deal_items (
  id           uuid primary key default uuid_generate_v4(),
  deal_id      uuid references deals(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  quantity     numeric not null default 1,
  unit_price   numeric not null default 0,
  sort_order   int default 0,
  created_at   timestamptz default now()
);

-- description = ชื่อรายการที่พิมพ์เอง (เผื่อไม่ได้เลือกสินค้าจากระบบ) — เพิ่มให้ตรงกับ quotation_items เป๊ะ
-- เพื่อให้คัดลอกรายการสินค้าไปมาระหว่างดีล/ใบเสนอราคาได้ตรงๆ ไม่มีข้อจำกัดเรื่องรูปแบบข้อมูลต่างกัน
alter table deal_items add column if not exists description text;

-- ===== TASKS =====
create table if not exists tasks (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid references companies(id) on delete cascade,
  deal_id      uuid references deals(id) on delete set null,
  subject      text not null,
  due_date     date,
  priority     text default 'ปกติ',
  status       text default 'รอดำเนินการ',
  owner        text,
  note         text,
  created_at   timestamptz default now()
);

-- ===== QUOTATIONS =====
create table if not exists quotations (
  id            uuid primary key default uuid_generate_v4(),
  deal_id       uuid references deals(id) on delete set null,
  company_id    uuid references companies(id) on delete cascade,
  quot_no       text unique,
  subject       text not null,
  value         numeric default 0,
  status        text default 'Draft',
  quot_date     date default current_date,
  expire_date   date,
  file_url      text,          -- path ในไฟล์แนบ (bucket "attachments") ของใบเสนอราคาที่ลูกค้าเซ็นกลับมา
  note          text,
  created_at    timestamptz default now()
);

-- product_id/quantity/unit_price บนตาราง quotations เอง (ใบเสนอราคามีได้แค่ 1 รายการ) — เก็บไว้เป็นข้อมูลเก่า
-- ไม่ใช้แล้วตั้งแต่เปลี่ยนมาใช้ตาราง quotation_items ด้านล่างที่รองรับหลายรายการต่อใบ (ดู migration ท้ายบล็อกนี้)
alter table quotations add column if not exists product_id uuid references products(id) on delete set null;
alter table quotations add column if not exists quantity numeric default 1;
alter table quotations add column if not exists unit_price numeric default 0;

-- signed_file_name = ชื่อไฟล์เดิมที่อัปโหลด (ใช้แสดงผล) คู่กับ file_url ที่เป็น path จริงใน storage
alter table quotations add column if not exists signed_file_name text;

-- sale_phone = เบอร์ติดต่อเซลล์ที่ออกใบเสนอราคานี้ ใช้แสดงในกล่องข้อมูลติดต่อตอนพิมพ์
alter table quotations add column if not exists sale_phone text;

-- proposer_name = ชื่อผู้เสนอราคา พิมพ์ไว้เหนือเส้นเซ็นชื่อตอนพิมพ์ กันต้องพิมพ์ออกมาเซ็นสดก่อนส่งลูกค้า
alter table quotations add column if not exists proposer_name text;

-- drive_file_id/drive_signed_file_id = Google Drive file id ของ PDF ใบเสนอราคา และไฟล์ที่ลูกค้าเซ็นกลับ (มิเรอร์คู่กับ Supabase Storage)
-- เก็บไว้เพื่ออัปโหลดซ้ำแล้วเขียนทับไฟล์เดิมได้ ไม่สร้างไฟล์ซ้ำซ้อนทุกครั้งที่บันทึก/แก้ไข
alter table quotations add column if not exists drive_file_id text;
alter table quotations add column if not exists drive_signed_file_id text;

-- payment_due_date = วันครบกำหนดชำระที่เซลล์กรอกเอง (ไม่คำนวณอัตโนมัติจาก companies.credit_term เพราะรอบจ่ายจริงของลูกค้าแต่ละรายอาจสั้น/ยาวกว่าเทอมเครดิตที่ตกลงกันไว้)
-- payment_status = สถานะตามเก็บเงิน จาก picklist "payment_statuses" — ใช้เตือนเซลล์ตอนถึงกำหนดในหน้าใบเสนอราคา กันลืมตามหลังปิดดีลส่งของแล้ว
alter table quotations add column if not exists payment_due_date date;
alter table quotations add column if not exists payment_status text default 'ยังไม่ชำระ';

-- credit_term บนใบเสนอราคาเอง (แยกจาก companies.credit_term) — เลือกได้ต่อใบว่าใบนี้เปิดแบบธรรมดาหรือเครดิต เผื่อลูกค้าเครดิตขอเป็นเงินสดครั้งนี้ หรือกลับกัน
-- เก็บค่าไว้ที่ใบเสนอราคาแทนที่จะอ้างอิงจาก companies.credit_term ตรงๆ เพราะเงื่อนไขบริษัทอาจเปลี่ยนทีหลัง แต่ใบเก่าต้องคงข้อมูล ณ วันที่ออกไว้ — ค่านี้พิมพ์โชว์ในใบเสนอราคาด้วย
alter table quotations add column if not exists credit_term text;

-- ===== QUOTATION ITEMS (รายการสินค้าในใบเสนอราคา — ใบเสนอราคาหนึ่งมีได้หลายรายการ เหมือนดีล) =====
-- description = ชื่อรายการที่แสดงจริง (เติมจากชื่อสินค้าเวลาเลือก แต่แก้ไขเองได้ เผื่อรายการที่ไม่มีในรายการสินค้า)
-- unit_price ถือว่ารวม VAT แล้วเหมือนกับดีล — quotations.value คำนวณจากผลรวมรายการเหล่านี้ที่ฝั่ง frontend
create table if not exists quotation_items (
  id            uuid primary key default uuid_generate_v4(),
  quotation_id  uuid references quotations(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  description   text,
  quantity      numeric not null default 1,
  unit_price    numeric not null default 0,
  sort_order    int default 0,
  created_at    timestamptz default now()
);

-- ย้ายข้อมูลรายการเดียวเดิม (จากคอลัมน์ product_id/quantity/unit_price บน quotations) เข้าตาราง quotation_items
-- ทำครั้งเดียวต่อใบ (เช็คว่ายังไม่มีรายการอยู่ก่อน) รันซ้ำได้ปลอดภัยไม่ซ้ำข้อมูล
insert into quotation_items (quotation_id, product_id, description, quantity, unit_price)
select q.id, q.product_id, q.subject, coalesce(q.quantity, 1), coalesce(q.unit_price, q.value, 0)
from quotations q
where q.product_id is not null
  and not exists (select 1 from quotation_items qi where qi.quotation_id = q.id);

-- ===== PAYMENT REQUESTS (คำขอตรวจยอดโอน — Sale สร้าง, Finance ตรวจ/อนุมัติ) =====
-- status ขับด้วย workflow ในโค้ด (ไม่ใช่ picklist ที่แก้เองได้): Draft → Pending Finance Review → (Need More Info / Payment Mismatch / Rejected / Approved to Create Order) → Order Created
create table if not exists payment_requests (
  id                   uuid primary key default uuid_generate_v4(),
  pr_no                text unique,        -- เลขคำขอ เช่น PR-000001 (gen_pr_no())
  company_id           uuid references companies(id) on delete set null,
  customer_name        text,               -- snapshot ชื่อลูกค้า ณ ตอนสร้าง
  deal_id              uuid references deals(id) on delete set null,
  quotation_id         uuid references quotations(id) on delete set null,
  po_reference         text,
  requested_by_name    text,               -- snapshot ชื่อ Sale ผู้สร้างคำขอ (คู่กับ created_by ที่เป็น uuid)
  requested_by_email   text,
  payment_type         text default 'ชำระเต็มจำนวน',   -- picklist payment_types
  expected_amount      numeric default 0,
  paid_amount          numeric default 0,
  difference_amount    numeric default 0,   -- คำนวณ paid - expected ที่ฝั่ง frontend
  difference_reason    text,
  bank_account         text,
  transfer_date        date,
  transfer_time        text,
  slip_file_url        text,               -- path ใน storage bucket "attachments"
  slip_drive_file_id   text,
  status               text default 'Draft',
  finance_reviewer_id  uuid references auth.users(id),
  finance_reviewer_name text,
  finance_reviewed_at  timestamptz,
  finance_remark       text,
  approval_ref_no      text,               -- gen_approval_ref_no() ตอน approve เช่น PAY-APP-000001
  order_no             text,
  order_created_at     timestamptz,
  order_created_by     text,
  remark               text,
  created_by           uuid references auth.users(id),
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- migration: ฟิลด์เพิ่มเติมของคำขอตรวจยอด (รันซ้ำได้ ปลอดภัย)
-- request_date   = วันที่ในเอกสารคำขอ (เซลล์เลือกได้ ไม่ผูกกับ created_at)
-- credit_type    = ประเภทลูกค้า ณ ตอนสร้าง ('ลูกค้าเครดิต ...' / 'ลูกค้าเงินสด') ดึงจากบริษัท/ใบเสนอราคา
-- total_amount   = ยอดรวมจากรายการสินค้า (รวม VAT แล้ว) — บัญชีเทียบกับสลิปจริงเอง จึงไม่เก็บยอดโอน/ผลต่าง
-- finance_ref_no = เลขอ้างอิงที่บัญชีกรอกเองตอนอนุมัติ ไว้แมทช์กับระบบบัญชีภายหลัง
alter table payment_requests add column if not exists request_date date default current_date;
alter table payment_requests add column if not exists credit_type text;
alter table payment_requests add column if not exists total_amount numeric default 0;
alter table payment_requests add column if not exists finance_ref_no text;
-- bill_no = เลขที่บิลของออเดอร์ที่เซลล์ต้องเปิดในระบบ กรอกเองแทนการผูก deal_id (ฟอร์มไม่ใช้ deal_id แล้ว แต่คงคอลัมน์เดิมไว้เผื่อข้อมูลเก่า)
alter table payment_requests add column if not exists bill_no text;

-- ===== PAYMENT ITEMS (รายการสินค้าในคำขอตรวจยอด) =====
create table if not exists payment_items (
  id                 uuid primary key default uuid_generate_v4(),
  payment_request_id uuid references payment_requests(id) on delete cascade,
  product_id         uuid references products(id) on delete set null,
  sku                text,
  product_name       text,
  quantity           numeric not null default 1,
  unit_price         numeric not null default 0,
  discount           numeric not null default 0,
  line_total         numeric not null default 0,
  remark             text,
  sort_order         int default 0,
  created_at         timestamptz default now()
);

-- ===== AUDIT LOGS (บันทึกทุก write action สำคัญ เช่น payment request submit/approve/reject) =====
create table if not exists audit_logs (
  id           uuid primary key default uuid_generate_v4(),
  entity_type  text not null,   -- เช่น 'payment_request'
  entity_id    uuid,
  action       text not null,   -- เช่น 'create','submit','approve','reject','need_info','mismatch','order_created'
  actor_id     uuid references auth.users(id),
  actor_name   text,
  detail       text,
  created_at   timestamptz default now()
);

-- ===== NOTIFICATIONS (แจ้งเตือนในระบบ — กระดิ่งมุมบน) =====
-- link_view = ชื่อ view ในแอปที่จะพาไปเมื่อกด (เช่น 'finance-review') — เขียนโดย Netlify Function ด้วย service role เท่านั้น (ข้าม RLS)
create table if not exists notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references auth.users(id) on delete cascade,
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  link_view   text,
  read_at     timestamptz,
  created_at  timestamptz default now()
);

-- ===== helper: เลขคำขอตรวจยอด + เลขอ้างอิงการอนุมัติ =====
create sequence if not exists pr_seq start 1;
create or replace function gen_pr_no() returns text as $$
declare n int;
begin n := nextval('pr_seq'); return 'PR-' || lpad(n::text, 6, '0'); end;
$$ language plpgsql;

create sequence if not exists pay_app_seq start 1;
create or replace function gen_approval_ref_no() returns text as $$
declare n int;
begin n := nextval('pay_app_seq'); return 'PAY-APP-' || lpad(n::text, 6, '0'); end;
$$ language plpgsql;

-- ===== LEADS (ลีดจากฟอร์มสาธารณะ เช่น Facebook/เว็บไซต์ — insert ผ่าน Netlify Function ด้วย service role key เท่านั้น ไม่เปิด RLS ให้ anon insert ตรงๆ) =====
create table if not exists leads (
  id                  uuid primary key default uuid_generate_v4(),
  full_name           text not null,
  phone               text not null,
  email               text,
  interested_product  text,       -- สินค้า/รุ่นที่สนใจ กรอกเป็นข้อความอิสระจากฟอร์มสาธารณะ
  message             text,       -- ข้อความเพิ่มเติมจากลูกค้า
  source              text,       -- ที่มา แท็กอัตโนมัติจาก query param ของลิงก์ฟอร์ม (เช่น facebook, website)
  status              text default 'ใหม่',
  converted_company_id uuid references companies(id) on delete set null, -- ผูกไปยังลูกค้าที่เซลล์กด "สร้างเป็นลูกค้า" แปลงมาจากลีดนี้
  created_at          timestamptz default now()
);

-- subject = หัวข้อสั้นๆ ว่าลูกค้ากรอกเข้ามาเรื่องอะไร (บังคับกรอกในฟอร์มสาธารณะ) เหมือนกับ subject ของดีล/ใบเสนอราคา
alter table leads add column if not exists subject text;

-- ฟิลด์คัดกรองลูกค้าเพิ่มเติมจากฟอร์มสาธารณะ (แทนที่ interested_product เดิมที่เป็นข้อความอิสระ — ยังเก็บคอลัมน์เดิมไว้เผื่อข้อมูลเก่า)
alter table leads add column if not exists position text;              -- ตำแหน่งผู้กรอก เช่น เจ้าของกิจการ/ฝ่ายจัดซื้อ
alter table leads add column if not exists business_type text;         -- ประเภทธุรกิจ เลือก "อื่นๆ โปรดระบุ" แล้วจะเก็บข้อความที่ลูกค้าพิมพ์เองแทน
alter table leads add column if not exists appliance_interest text[];  -- ประเภทเครื่องใช้ไฟฟ้าที่สนใจ เลือกได้หลายข้อ
alter table leads add column if not exists purchase_reason text;       -- เหตุผลในการซื้อ: สำหรับใช้เอง/สำหรับธุรกิจ

-- ===== SETTINGS =====
create table if not exists settings (
  key    text primary key,
  value  text
);

-- ===== LEAD SOURCES (ที่มาของลูกค้า — รายการที่ admin เพิ่ม/ลบได้เอง) =====
create table if not exists lead_sources (
  id          uuid primary key default uuid_generate_v4(),
  name        text unique not null,
  created_at  timestamptz default now()
);

insert into lead_sources (name) values
  ('เว็บไซต์'), ('Facebook'), ('Line'), ('แนะนำโดยลูกค้าเดิม'), ('งานอีเวนต์/ออกบูธ'), ('โทรเข้ามาเอง'), ('อื่นๆ')
on conflict (name) do nothing;

alter table companies add column if not exists lead_source text;
alter table companies add column if not exists tax_id text; -- เลขประจำตัวผู้เสียภาษี ใช้พิมพ์ในใบเสนอราคา

-- customer_type แยกลูกค้านิติบุคคล (ฟอร์มเต็ม) กับบุคคลธรรมดา (ฟอร์มย่อ ไม่บังคับอุตสาหกรรม/เว็บไซต์/เลขผู้เสียภาษี)
-- ยังใช้ตาราง companies เดียวกัน ไม่แยกตารางใหม่ เพื่อให้ deals/quotations เลือกลูกค้าประเภทไหนก็ได้จาก dropdown เดิม
alter table companies add column if not exists customer_type text default 'นิติบุคคล/บริษัท';

-- credit_term = เงื่อนไขเครดิตของลูกค้ารายนี้ จาก picklist "credit_terms" (ว่าง = ลูกค้าเงินสด ไม่ใช่เครดิต)
-- แค่จำแนกประเภทลูกค้าไว้เตือน ไม่ได้ใช้คำนวณวันครบกำหนดชำระอัตโนมัติ เพราะรอบจ่ายจริงกำหนดแยกต่อใบเสนอราคา (ดู quotations.payment_due_date)
alter table companies add column if not exists credit_term text;

-- ===== PICKLISTS (รายการ dropdown ที่แก้ไข/เพิ่ม/ลบได้เองทุกคนในระบบ แบบเดียวกับ dropdown list ใน Google Sheets) =====
-- แทนที่ CONSTANTS ที่เคยฮาร์ดโค้ดในโค้ดฝั่ง frontend — list_key คือชื่อรายการ, value คือตัวเลือกแต่ละอัน
create table if not exists picklists (
  id          uuid primary key default uuid_generate_v4(),
  list_key    text not null,
  value       text not null,
  sort_order  int default 0,
  created_at  timestamptz default now(),
  unique (list_key, value)
);

insert into picklists (list_key, value, sort_order)
select 'industries', v, i from unnest(array[
  'เทคโนโลยี', 'การผลิต', 'การค้าปลีก', 'การเงินและธนาคาร', 'สุขภาพและการแพทย์',
  'การศึกษา', 'อสังหาริมทรัพย์', 'โลจิสติกส์', 'อาหารและเครื่องดื่ม', 'พลังงาน',
  'สื่อและโฆษณา', 'ท่องเที่ยวและโรงแรม', 'ก่อสร้าง', 'เกษตรกรรม', 'อื่นๆ'
]) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'company_statuses', v, i from unnest(array['Active', 'Prospect', 'Inactive']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'deal_stages', v, i from unnest(array['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'activity_types', v, i from unnest(array['โทรศัพท์', 'อีเมล', 'ประชุม', 'Line', 'เยี่ยมชมลูกค้า', 'สาธิตสินค้า', 'อื่นๆ']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'task_priorities', v, i from unnest(array['ต่ำ', 'ปกติ', 'สูง', 'เร่งด่วน']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'task_statuses', v, i from unnest(array['รอดำเนินการ', 'กำลังดำเนินการ', 'เสร็จสิ้น', 'ยกเลิก']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'quot_statuses', v, i from unnest(array['Draft', 'Sent', 'Approved', 'Rejected', 'Expired']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'deal_sources', v, i from unnest(array['ไลน์', 'เทเลเซลล์', 'อีเมลล์', 'เว็บไซต์', 'Facebook', 'แนะนำโดยลูกค้าเดิม', 'งานอีเวนต์/ออกบูธ', 'อื่นๆ']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'customer_types', v, i from unnest(array['นิติบุคคล/บริษัท', 'บุคคลธรรมดา']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'lead_statuses', v, i from unnest(array['ใหม่', 'ติดต่อแล้ว', 'ปิดเป็นลูกค้าแล้ว', 'ไม่สนใจ']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'credit_terms', v, i from unnest(array['เครดิต 15 วัน', 'เครดิต 30 วัน', 'เครดิต 45 วัน', 'เครดิต 60 วัน']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'payment_statuses', v, i from unnest(array['ยังไม่ชำระ', 'ชำระแล้ว']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

insert into picklists (list_key, value, sort_order)
select 'payment_types', v, i from unnest(array['ชำระเต็มจำนวน', 'มัดจำ', 'ชำระบางส่วน', 'ชำระยอดคงเหลือ']) with ordinality as t(v, i)
on conflict (list_key, value) do nothing;

-- ย้ายรายการ "ที่มาลูกค้า" เดิม (ถ้าเคยเพิ่ม/ลบผ่านหน้าจัดการมาก่อน) เข้ามาอยู่ในระบบ picklists เดียวกัน
insert into picklists (list_key, value)
select 'lead_sources', name from lead_sources
on conflict (list_key, value) do nothing;

-- ===== ATTACHMENTS (เอกสารแนบต่อบริษัท, ไฟล์เก็บใน Supabase Storage bucket "attachments") =====
create table if not exists attachments (
  id           uuid primary key default uuid_generate_v4(),
  company_id   uuid references companies(id) on delete cascade,
  file_name    text not null,
  file_path    text not null,   -- path ภายใน storage bucket "attachments"
  file_size    bigint,
  mime_type    text,
  uploaded_by  text,
  created_at   timestamptz default now()
);

-- drive_file_id = Google Drive file id ของเอกสารแนบนี้ (มิเรอร์คู่กับ Supabase Storage) เก็บไว้เพื่ออัปโหลดซ้ำแล้วเขียนทับไฟล์เดิมได้
alter table attachments add column if not exists drive_file_id text;

-- ===== PROFILES (ข้อมูลผู้ใช้งาน + สิทธิ์ Admin/Sale/Finance) =====
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'sale' check (role in ('admin', 'sale')),
  created_at  timestamptz default now()
);

-- เพิ่มสิทธิ์ 'finance' (ฝ่ายบัญชี — ตรวจสอบยอดโอน) เข้ากับ check constraint เดิม
-- drop แล้ว add ใหม่ ปลอดภัยที่จะรันซ้ำ (constraint ชื่อ profiles_role_check ถูกตั้งอัตโนมัติจาก inline check ตอน create table)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'sale', 'finance'));

-- ===== helper: auto quotation number =====
create sequence if not exists quot_seq start 1;

create or replace function gen_quot_no() returns text as $$
declare
  n int;
begin
  n := nextval('quot_seq');
  return 'QT' || to_char(now(),'YYMM') || lpad(n::text,4,'0');
end;
$$ language plpgsql;

-- ===== updated_at triggers =====
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_companies_updated on companies;
create trigger trg_companies_updated before update on companies
  for each row execute function set_updated_at();

drop trigger if exists trg_deals_updated on deals;
create trigger trg_deals_updated before update on deals
  for each row execute function set_updated_at();

drop trigger if exists trg_payment_requests_updated on payment_requests;
create trigger trg_payment_requests_updated before update on payment_requests
  for each row execute function set_updated_at();

-- ===== ownership columns (สำหรับ role-based access) =====
-- created_by = ผู้สร้างเรคคอร์ด ใช้ตัดสินสิทธิ์ Sale ว่าเห็น/แก้ไขของตัวเองได้
-- ปล่อยเป็น NULL ได้สำหรับข้อมูลเก่า (ทุกคนจะเห็น/แก้ไขได้จนกว่าจะมีเจ้าของ)
-- แอปฝั่ง frontend จะเซ็ตค่านี้ให้อัตโนมัติตอนสร้างข้อมูลใหม่
alter table companies add column if not exists created_by uuid references auth.users(id);
alter table deals      add column if not exists created_by uuid references auth.users(id);
alter table tasks      add column if not exists created_by uuid references auth.users(id);

-- บังคับ created_by = ผู้สร้างจริงเสมอตอน insert (ฝั่ง client ส่งค่าอะไรมาก็ถูกเขียนทับ)
-- กัน user แก้ payload เองแล้วปลอมเป็นคนอื่น หรือปล่อยว่างเพื่อทำให้ข้อมูลเป็นสาธารณะ
create or replace function set_created_by() returns trigger as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_companies_created_by on companies;
create trigger trg_companies_created_by before insert on companies
  for each row execute function set_created_by();

drop trigger if exists trg_deals_created_by on deals;
create trigger trg_deals_created_by before insert on deals
  for each row execute function set_created_by();

drop trigger if exists trg_tasks_created_by on tasks;
create trigger trg_tasks_created_by before insert on tasks
  for each row execute function set_created_by();

drop trigger if exists trg_payment_requests_created_by on payment_requests;
create trigger trg_payment_requests_created_by before insert on payment_requests
  for each row execute function set_created_by();

-- ===== helper: is_admin() =====
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable set search_path = public;

grant execute on function is_admin() to authenticated;

-- ===== helper: is_finance() (ฝ่ายบัญชี — เห็นทุกคำขอตรวจยอดและอนุมัติได้) =====
create or replace function is_finance() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'finance'
  );
$$ language sql security definer stable set search_path = public;

grant execute on function is_finance() to authenticated;

-- ===== auto-create profile row เมื่อมีผู้ใช้งานใหม่ (สมัคร หรือ admin เพิ่มใน Supabase dashboard) =====
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'sale'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- สร้าง profile ให้ผู้ใช้งานที่มีอยู่แล้วก่อนรัน migration นี้ (ถ้ามี)
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)), 'sale'
from auth.users u
on conflict (id) do nothing;

-- ***** ขั้นตอนสำคัญ: ตั้งให้ตัวเองเป็น admin คนแรก (รันแยกหลัง migration) *****
-- update profiles set role = 'admin' where email = 'you@company.com';

-- ===== Storage bucket สำหรับไฟล์แนบ =====
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "attachments: authenticated read" on storage.objects;
create policy "attachments: authenticated read" on storage.objects
  for select using (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists "attachments: authenticated upload" on storage.objects;
create policy "attachments: authenticated upload" on storage.objects
  for insert with check (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists "attachments: authenticated delete" on storage.objects;
create policy "attachments: authenticated delete" on storage.objects
  for delete using (bucket_id = 'attachments' and auth.role() = 'authenticated');

-- ===== Storage bucket สำหรับรูปสินค้า (public — ต่างจาก attachments ที่เป็น private) =====
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product-images: public read" on storage.objects;
create policy "product-images: public read" on storage.objects
  for select using (bucket_id = 'product-images');

-- ทุกคนที่ login แล้วอัปโหลด/ลบรูปสินค้าได้ (เหมือน bucket "attachments") — ไม่ได้จำกัดแค่ admin
drop policy if exists "product-images: admin upload" on storage.objects;
drop policy if exists "product-images: authenticated upload" on storage.objects;
create policy "product-images: authenticated upload" on storage.objects
  for insert with check (bucket_id = 'product-images' and auth.role() = 'authenticated');

drop policy if exists "product-images: admin delete" on storage.objects;
drop policy if exists "product-images: authenticated delete" on storage.objects;
create policy "product-images: authenticated delete" on storage.objects
  for delete using (bucket_id = 'product-images' and auth.role() = 'authenticated');

-- ===== Row Level Security =====
alter table companies   enable row level security;
alter table contacts    enable row level security;
alter table activities  enable row level security;
alter table deals       enable row level security;
alter table tasks       enable row level security;
alter table quotations  enable row level security;
alter table settings    enable row level security;
alter table attachments enable row level security;
alter table profiles    enable row level security;
alter table lead_sources enable row level security;
alter table picklists   enable row level security;
alter table products    enable row level security;
alter table deal_items  enable row level security;
alter table quotation_items enable row level security;
alter table leads       enable row level security;
alter table payment_requests enable row level security;
alter table payment_items enable row level security;
alter table audit_logs   enable row level security;
alter table notifications enable row level security;

-- ลบ policy แบบเก่า "authenticated ทำได้ทุกอย่าง" (ถ้ามีจากเวอร์ชันก่อนหน้า)
drop policy if exists "allow all for authenticated" on companies;
drop policy if exists "allow all for authenticated" on contacts;
drop policy if exists "allow all for authenticated" on activities;
drop policy if exists "allow all for authenticated" on deals;
drop policy if exists "allow all for authenticated" on tasks;
drop policy if exists "allow all for authenticated" on quotations;
drop policy if exists "allow all for authenticated" on settings;

-- ----- companies: admin เห็น/แก้ไขทั้งหมด, sale เห็น/แก้ไขเฉพาะของตัวเอง + ข้อมูลเก่าที่ยังไม่มีเจ้าของ -----
drop policy if exists "companies select" on companies;
create policy "companies select" on companies for select using (
  is_admin() or created_by = auth.uid() or created_by is null
);
drop policy if exists "companies insert" on companies;
create policy "companies insert" on companies for insert with check (auth.role() = 'authenticated');
drop policy if exists "companies update" on companies;
create policy "companies update" on companies for update using (
  is_admin() or created_by = auth.uid() or created_by is null
) with check (
  is_admin() or created_by = auth.uid() or created_by is null
);
drop policy if exists "companies delete" on companies;
create policy "companies delete" on companies for delete using (
  is_admin() or created_by = auth.uid()
);

-- ----- deals: เหมือน companies -----
drop policy if exists "deals select" on deals;
create policy "deals select" on deals for select using (
  is_admin() or created_by = auth.uid() or created_by is null
);
drop policy if exists "deals insert" on deals;
create policy "deals insert" on deals for insert with check (auth.role() = 'authenticated');
drop policy if exists "deals update" on deals;
create policy "deals update" on deals for update using (
  is_admin() or created_by = auth.uid() or created_by is null
) with check (
  is_admin() or created_by = auth.uid() or created_by is null
);
drop policy if exists "deals delete" on deals;
create policy "deals delete" on deals for delete using (
  is_admin() or created_by = auth.uid()
);

-- ----- deal_items: สืบสิทธิ์จากดีลแม่ (deal_id) เหมือน contacts สืบจาก company -----
drop policy if exists "deal_items all" on deal_items;
create policy "deal_items all" on deal_items for all using (
  exists (select 1 from deals d where d.id = deal_items.deal_id
    and (is_admin() or d.created_by = auth.uid() or d.created_by is null))
) with check (
  exists (select 1 from deals d where d.id = deal_items.deal_id
    and (is_admin() or d.created_by = auth.uid() or d.created_by is null))
);

-- ----- tasks: เหมือน companies -----
drop policy if exists "tasks select" on tasks;
create policy "tasks select" on tasks for select using (
  is_admin() or created_by = auth.uid() or created_by is null
);
drop policy if exists "tasks insert" on tasks;
create policy "tasks insert" on tasks for insert with check (auth.role() = 'authenticated');
drop policy if exists "tasks update" on tasks;
create policy "tasks update" on tasks for update using (
  is_admin() or created_by = auth.uid() or created_by is null
) with check (
  is_admin() or created_by = auth.uid() or created_by is null
);
drop policy if exists "tasks delete" on tasks;
create policy "tasks delete" on tasks for delete using (
  is_admin() or created_by = auth.uid()
);

-- ----- contacts / activities / quotations / attachments: สืบสิทธิ์จากบริษัทแม่ (company_id) -----
drop policy if exists "contacts all" on contacts;
create policy "contacts all" on contacts for all using (
  exists (select 1 from companies c where c.id = contacts.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
) with check (
  exists (select 1 from companies c where c.id = contacts.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
);

drop policy if exists "activities all" on activities;
create policy "activities all" on activities for all using (
  exists (select 1 from companies c where c.id = activities.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
) with check (
  exists (select 1 from companies c where c.id = activities.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
);

drop policy if exists "quotations all" on quotations;
create policy "quotations all" on quotations for all using (
  exists (select 1 from companies c where c.id = quotations.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
) with check (
  exists (select 1 from companies c where c.id = quotations.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
);

-- ----- quotation_items: สืบสิทธิ์จากใบเสนอราคาแม่ -> บริษัทแม่ (สองชั้นเหมือน quotations เอง) -----
drop policy if exists "quotation_items all" on quotation_items;
create policy "quotation_items all" on quotation_items for all using (
  exists (select 1 from quotations q join companies c on c.id = q.company_id
    where q.id = quotation_items.quotation_id and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
) with check (
  exists (select 1 from quotations q join companies c on c.id = q.company_id
    where q.id = quotation_items.quotation_id and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
);

drop policy if exists "attachments all" on attachments;
create policy "attachments all" on attachments for all using (
  exists (select 1 from companies c where c.id = attachments.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
) with check (
  exists (select 1 from companies c where c.id = attachments.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
);

-- ----- settings: ทุกคนอ่านได้ (ใช้แสดงหัวใบเสนอราคา), แก้ไขได้เฉพาะ admin -----
drop policy if exists "settings select" on settings;
create policy "settings select" on settings for select using (auth.role() = 'authenticated');
drop policy if exists "settings write" on settings;
create policy "settings write" on settings for all using (is_admin()) with check (is_admin());

-- ----- lead_sources: ทุกคนอ่านได้ (ใช้เลือกในฟอร์ม), เพิ่ม/ลบได้เฉพาะ admin -----
-- (ตารางนี้เลิกใช้แล้ว แทนที่ด้วย picklists — เก็บไว้เผื่อมีข้อมูลเก่า ไม่ลบทิ้ง)
drop policy if exists "lead_sources select" on lead_sources;
create policy "lead_sources select" on lead_sources for select using (auth.role() = 'authenticated');
drop policy if exists "lead_sources write" on lead_sources;
create policy "lead_sources write" on lead_sources for all using (is_admin()) with check (is_admin());

-- ----- picklists: ทุกคนที่ login อ่านได้ (ใช้แสดงตัวเลือกใน dropdown), แก้ไข/เพิ่ม/ลบได้เฉพาะ admin -----
drop policy if exists "picklists all" on picklists;
drop policy if exists "picklists select" on picklists;
create policy "picklists select" on picklists for select using (auth.role() = 'authenticated');
drop policy if exists "picklists write" on picklists;
create policy "picklists write" on picklists for all using (is_admin()) with check (is_admin());

-- ----- products: ทุกคนที่ login แล้วอ่าน/เพิ่ม/แก้ไข/ลบได้หมด (ไม่ได้จำกัดแค่ admin เหมือน picklists) -----
drop policy if exists "products select" on products;
create policy "products select" on products for select using (auth.role() = 'authenticated');
drop policy if exists "products write" on products;
create policy "products write" on products for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----- profiles: เห็นของตัวเอง หรือ admin เห็นทั้งหมด, แก้ไข role ได้เฉพาะ admin -----
drop policy if exists "profiles select" on profiles;
create policy "profiles select" on profiles for select using (
  id = auth.uid() or is_admin()
);
drop policy if exists "profiles update" on profiles;
create policy "profiles update" on profiles for update using (
  is_admin()
) with check (
  is_admin()
);

-- ----- leads: ทุกคนที่ login แล้วอ่าน/เพิ่ม/แก้ไขได้ (ไม่มีเจ้าของเฉพาะคน เพราะเซลล์คนไหนก็ตามลีดต่อได้), ลบได้เฉพาะ admin -----
-- ไม่มี policy ให้ anon (คนนอกไม่ login) insert ตรงๆ เด็ดขาด — ฟอร์มสาธารณะต้องส่งผ่าน Netlify Function ที่ใช้ Service Role Key เขียนแทนเท่านั้น
drop policy if exists "leads select" on leads;
create policy "leads select" on leads for select using (auth.role() = 'authenticated');
drop policy if exists "leads insert" on leads;
create policy "leads insert" on leads for insert with check (auth.role() = 'authenticated');
drop policy if exists "leads update" on leads;
create policy "leads update" on leads for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "leads delete" on leads;
create policy "leads delete" on leads for delete using (is_admin());

-- ----- payment_requests: sale เห็น/แก้เฉพาะของตัวเอง, finance + admin เห็น/แก้ได้ทุกใบ (สำหรับตรวจยอด) -----
-- ระดับ RLS คุมแค่ว่าใครแตะแถวไหนได้ ส่วนกฎ workflow (แก้ไม่ได้หลัง Submit / ต้องมี remark ฯลฯ) บังคับที่ฝั่งแอปเหมือนโมดูลอื่นในระบบ
drop policy if exists "payment_requests select" on payment_requests;
create policy "payment_requests select" on payment_requests for select using (
  is_admin() or is_finance() or created_by = auth.uid() or created_by is null
);
drop policy if exists "payment_requests insert" on payment_requests;
create policy "payment_requests insert" on payment_requests for insert with check (auth.role() = 'authenticated');
drop policy if exists "payment_requests update" on payment_requests;
create policy "payment_requests update" on payment_requests for update using (
  is_admin() or is_finance() or created_by = auth.uid() or created_by is null
) with check (
  is_admin() or is_finance() or created_by = auth.uid() or created_by is null
);
drop policy if exists "payment_requests delete" on payment_requests;
create policy "payment_requests delete" on payment_requests for delete using (
  is_admin() or created_by = auth.uid()
);

-- ----- payment_items: สืบสิทธิ์จากคำขอตรวจยอดแม่ (payment_request_id) -----
drop policy if exists "payment_items all" on payment_items;
create policy "payment_items all" on payment_items for all using (
  exists (select 1 from payment_requests pr where pr.id = payment_items.payment_request_id
    and (is_admin() or is_finance() or pr.created_by = auth.uid() or pr.created_by is null))
) with check (
  exists (select 1 from payment_requests pr where pr.id = payment_items.payment_request_id
    and (is_admin() or is_finance() or pr.created_by = auth.uid() or pr.created_by is null))
);

-- ----- audit_logs: ทุกคนที่ login อ่าน/เขียนเพิ่มได้ แต่แก้/ลบไม่ได้ (ไม่มี policy update/delete = ถูกบล็อกโดยปริยาย) -----
drop policy if exists "audit_logs select" on audit_logs;
create policy "audit_logs select" on audit_logs for select using (auth.role() = 'authenticated');
drop policy if exists "audit_logs insert" on audit_logs;
create policy "audit_logs insert" on audit_logs for insert with check (auth.role() = 'authenticated');

-- ----- notifications: เห็น/แก้ (มาร์คอ่าน) ได้เฉพาะของตัวเอง — insert ทำผ่าน Netlify Function (service role) เป็นหลัก เพราะต้องส่งข้ามผู้ใช้ (Sale แจ้งบัญชี) -----
drop policy if exists "notifications select" on notifications;
create policy "notifications select" on notifications for select using (user_id = auth.uid());
drop policy if exists "notifications insert" on notifications;
create policy "notifications insert" on notifications for insert with check (auth.role() = 'authenticated');
drop policy if exists "notifications update" on notifications;
create policy "notifications update" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
