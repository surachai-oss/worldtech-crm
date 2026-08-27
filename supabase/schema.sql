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

-- ส่วนลดท้ายบิล — discount_type: 'เปอร์เซ็นต์' หรือ 'จำนวนเงิน', deals.value คือมูลค่าหลังหักส่วนลดแล้ว (คำนวณฝั่ง frontend)
alter table deals add column if not exists discount_type text;
alter table deals add column if not exists discount_value numeric default 0;

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

-- ส่วนลดท้ายบิล — discount_type: 'เปอร์เซ็นต์' หรือ 'จำนวนเงิน', quotations.value คือมูลค่าหลังหักส่วนลดแล้ว (คำนวณฝั่ง frontend)
alter table quotations add column if not exists discount_type text;
alter table quotations add column if not exists discount_value numeric default 0;

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

-- quotation_id บนงานติดตาม — ให้เซลล์ผูกงานติดตามกับใบเสนอราคาที่ส่งไปได้ (เช่น ติดตามว่าราคาที่เสนอผ่านหรือไม่ อยู่ขั้นตอนไหน)
alter table tasks add column if not exists quotation_id uuid references quotations(id) on delete set null;

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
  pr_no                text unique,        -- เลขคำขอ เช่น RE6907013 (gen_pr_no()) — รูปแบบเดิม PR-000001 เลิกใช้แล้ว
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
-- payment_method = วิธีการชำระ (โอนเงิน/เงินสด/เช็ค/บัตรเครดิต/เครดิตเทอม/อื่นๆ) เลือกหลังประเภทการชำระ — payment_method_other ใช้เมื่อเลือก "อื่นๆ โปรดระบุ"
alter table payment_requests add column if not exists payment_method text;
alter table payment_requests add column if not exists payment_method_other text;
-- cod_tracking_no = เลข tracking พัสดุ ใช้เมื่อ payment_method = "เก็บเงินปลายทาง" (ไม่มีสลิปโอนเงินให้แนบ เพราะลูกค้าจ่ายปลายทาง บัญชีตรวจสอบยอดเองตอนพัสดุถึง)
alter table payment_requests add column if not exists cod_tracking_no text;

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

-- ===== ORDERS (รันเลขออเดอร์จากใบเสนอราคา เพื่อเอาไปเปิดบิลต่อในระบบบัญชีอื่น) =====
-- เลขออเดอร์รูปแบบ WTE{ปี 2 หลัก}WT{เลขรัน 4 หลัก} เช่น WTE26WT0001 — รันแยกตามปี ขึ้นปีใหม่เริ่มนับ 0001 ใหม่ (ดู gen_order_no() + order_no_counters ด้านล่าง)
-- ออเดอร์ = snapshot ของใบเสนอราคา ณ ตอนเปิด (company/รายการสินค้า) + ที่อยู่จัดส่งที่เซลล์กรอกเพิ่ม — แก้ไขไม่ได้หลังบันทึก ยกเลิกได้อย่างเดียว (ดู trigger guard_orders_immutable)
create table if not exists orders (
  id                      uuid primary key default uuid_generate_v4(),
  order_no                text unique,
  quotation_id            uuid references quotations(id) on delete set null,
  quot_no                 text,     -- snapshot เลขที่ใบเสนอราคา ณ ตอนเปิดออเดอร์ (เผื่อใบเสนอราคาถูกลบ/แก้ไขทีหลัง)
  company_id              uuid references companies(id) on delete set null,
  customer_name           text,
  shipping_address        text not null,
  shipping_contact_name   text,
  shipping_contact_phone  text,
  value                   numeric default 0,
  sales_id                uuid references auth.users(id),
  sales_name              text,
  status                  text not null default 'Active' check (status in ('Active', 'Cancelled')),
  cancel_reason           text,
  created_at              timestamptz default now(),
  cancelled_at            timestamptz
);

-- migration: snapshot ข้อมูลบริษัท (เลขผู้เสียภาษี/ที่อยู่/เบอร์/อีเมล) ไว้ในออเดอร์ ให้บัญชีเอาไปออกใบแจ้งหนี้/ใบกำกับภาษีทีหลังได้โดยไม่ต้องย้อนไปดูที่ใบเสนอราคา + หมายเหตุ
alter table orders add column if not exists company_tax_id text;
alter table orders add column if not exists company_address text;
alter table orders add column if not exists company_phone text;
alter table orders add column if not exists company_email text;
alter table orders add column if not exists remark text;

-- ที่อยู่จัดส่งแบบแยกช่อง — เดิมเป็นข้อความก้อนเดียวที่เซลล์พิมพ์อิสระ ระบบขนส่ง/ERP เอาไปใช้ต่อไม่ได้
-- คงคอลัมน์ shipping_address ไว้และเขียนที่อยู่ที่ประกอบจากช่องเหล่านี้ลงไปด้วยทุกครั้ง
-- เพราะใบพิมพ์/หน้ารายละเอียด/คำขอเอกสารบัญชี อ่านจาก shipping_address อยู่ และออเดอร์เก่ามีแต่ก้อนข้อความ
alter table orders add column if not exists shipping_line1 text;        -- บ้านเลขที่ / หมู่ / ถนน
alter table orders add column if not exists shipping_subdistrict text;  -- ตำบล / แขวง
alter table orders add column if not exists shipping_district text;     -- อำเภอ / เขต
alter table orders add column if not exists shipping_province text;     -- จังหวัด
alter table orders add column if not exists shipping_postcode text;     -- รหัสไปรษณีย์
-- ชื่ออังกฤษทางการของกรมการปกครอง เก็บ snapshot คู่กับชื่อไทย เพื่อให้ระบบปลายทาง (JST/ขนส่ง/เอกสารภาษาอังกฤษ)
-- ใช้ได้เลยโดยไม่ต้องเดาคำทับศัพท์เอง — ว่างได้ ถ้าที่อยู่นั้นกรอกเองไม่ตรงกับรายชื่อทางการ
alter table orders add column if not exists shipping_subdistrict_en text;
alter table orders add column if not exists shipping_district_en text;
alter table orders add column if not exists shipping_province_en text;

-- order_type = ประเภทออเดอร์ที่เซลล์เลือกก่อนรันเลข ('ปกติ' รันเป็น WT, 'Grade B' รันเป็น GB) — ดู gen_order_no() ด้านล่าง
alter table orders add column if not exists order_type text not null default 'ปกติ' check (order_type in ('ปกติ', 'Grade B'));

-- ส่วนลดท้ายบิล (ตอนสร้างออเดอร์เท่านั้น เพราะแก้ไขทีหลังไม่ได้) — discount_type: 'เปอร์เซ็นต์' หรือ 'จำนวนเงิน', value คือ orders.value หลังหักส่วนลดแล้ว
alter table orders add column if not exists discount_type text;
alter table orders add column if not exists discount_value numeric default 0;

-- ===== ORDER ITEMS (snapshot รายการสินค้าจากใบเสนอราคา ณ ตอนเปิดออเดอร์ — ไม่ผูกสดกับ quotation_items เพราะใบเสนอราคาแก้ไขทีหลังได้ แต่ออเดอร์ต้องคงข้อมูล ณ วันที่เปิดไว้) =====
create table if not exists order_items (
  id           uuid primary key default uuid_generate_v4(),
  order_id     uuid references orders(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  description  text,
  quantity     numeric not null default 1,
  unit_price   numeric not null default 0,
  sort_order   int default 0,
  created_at   timestamptz default now()
);

-- ใบเสนอราคาหนึ่งใบผูกออเดอร์ Active ได้แค่ 1 ออเดอร์ในเวลาเดียวกัน (ยกเลิกออเดอร์เดิมก่อนถึงจะเปิดออเดอร์ใหม่จากใบเดิมได้)
create unique index if not exists idx_orders_active_quotation on orders(quotation_id) where status = 'Active';

-- เลขออเดอร์: นับแยกตามปี (ปีเปลี่ยน = เริ่มนับ 0001 ใหม่) ต่างจาก gen_pr_no/gen_quot_no ที่นับต่อเนื่องไม่รีเซ็ต
-- แยกตัวนับตามประเภทออเดอร์ด้วย (order_type) เพราะ WT (ปกติ) กับ GB (Grade B) ต้องรันคนละชุดเลข ไม่ปนกัน
create table if not exists order_no_counters (
  year        int not null,
  counter     int not null default 0,
  order_type  text not null default 'ปกติ'
);
alter table order_no_counters add column if not exists order_type text not null default 'ปกติ';
alter table order_no_counters drop constraint if exists order_no_counters_pkey;
alter table order_no_counters add constraint order_no_counters_pkey primary key (year, order_type);

-- security definer: bypass RLS บนตาราง counter นี้ (ไม่มีใครควรเขียนตรงๆ นอกจากผ่านฟังก์ชันนี้) — ต่างจาก gen_pr_no/gen_quot_no ที่ใช้ sequence ซึ่งไม่ผ่าน RLS อยู่แล้ว
-- p_order_type: 'ปกติ' รันเลขรูปแบบ WTE{ปี}WT{เลขรัน} เดิม, 'Grade B' รันเป็น WTE{ปี}GB{เลขรัน} แยกชุดเลขต่างหาก
drop function if exists gen_order_no();
create or replace function gen_order_no(p_order_type text default 'ปกติ') returns text as $$
declare
  yr int := extract(year from now())::int;
  yy text := to_char(now(), 'YY');
  code text := case when p_order_type = 'Grade B' then 'GB' else 'WT' end;
  n int;
begin
  insert into order_no_counters (year, order_type, counter) values (yr, p_order_type, 1)
  on conflict (year, order_type) do update set counter = order_no_counters.counter + 1
  returning counter into n;
  return 'WTE' || yy || code || lpad(n::text, 4, '0');
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function gen_order_no(text) to authenticated;

-- ดูตัวอย่างเลขออเดอร์ถัดไปแบบ "อ่านอย่างเดียว" ไม่เพิ่ม counter จริง — ใช้โชว์พรีวิวตอนเปิดฟอร์ม/สลับประเภทก่อนกดบันทึก
-- เลขจริงจะถูกจอง (เพิ่ม counter) ก็ต่อเมื่อกดบันทึกออเดอร์แล้วเรียก gen_order_no() เท่านั้น กันเลขถูกใช้ไปเปล่าๆ ตอนแค่เปิดฟอร์มดูหรือสลับประเภทไปมา
create or replace function peek_order_no(p_order_type text default 'ปกติ') returns text as $$
declare
  yr int := extract(year from now())::int;
  yy text := to_char(now(), 'YY');
  code text := case when p_order_type = 'Grade B' then 'GB' else 'WT' end;
  n int;
begin
  select counter into n from order_no_counters where year = yr and order_type = p_order_type;
  n := coalesce(n, 0) + 1;
  return 'WTE' || yy || code || lpad(n::text, 4, '0');
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function peek_order_no(text) to authenticated;

-- !! นิยามนี้ถูกเขียนทับที่ท้ายไฟล์ (ส่วน "ให้แอดมินแก้ไขออเดอร์ที่บันทึกแล้วได้") ซึ่งเพิ่มข้อยกเว้นให้แอดมิน
--    ที่ต้องประกาศซ้ำท้ายไฟล์เพราะเวอร์ชันใหม่เรียก is_admin() ซึ่งนิยามอยู่หลังจุดนี้
-- บังคับกฎ "แก้ไขไม่ได้หลังบันทึก ต้องยกเลิกเท่านั้น" ที่ระดับฐานข้อมูล (กันเผลอแก้ผ่านทางอื่นนอกแอป) —
-- อนุญาตแค่เปลี่ยนสถานะเป็น Cancelled พร้อม cancel_reason/cancelled_at เท่านั้น ห้ามแก้ฟิลด์อื่นหรือแก้ออเดอร์ที่ยกเลิกไปแล้ว
create or replace function guard_orders_immutable() returns trigger as $$
begin
  if old.status = 'Cancelled' then
    raise exception 'ออเดอร์นี้ถูกยกเลิกไปแล้ว แก้ไขไม่ได้อีก';
  end if;
  if new.status = 'Active' and (
    new.order_no is distinct from old.order_no or
    new.quotation_id is distinct from old.quotation_id or
    new.company_id is distinct from old.company_id or
    new.sales_id is distinct from old.sales_id or
    new.shipping_address is distinct from old.shipping_address or
    new.shipping_line1 is distinct from old.shipping_line1 or
    new.shipping_subdistrict is distinct from old.shipping_subdistrict or
    new.shipping_district is distinct from old.shipping_district or
    new.shipping_province is distinct from old.shipping_province or
    new.shipping_postcode is distinct from old.shipping_postcode or
    new.value is distinct from old.value or
    new.company_tax_id is distinct from old.company_tax_id or
    new.company_address is distinct from old.company_address or
    new.company_phone is distinct from old.company_phone or
    new.company_email is distinct from old.company_email or
    new.remark is distinct from old.remark or
    new.order_type is distinct from old.order_type or
    new.discount_type is distinct from old.discount_type or
    new.discount_value is distinct from old.discount_value
  ) then
    raise exception 'ออเดอร์ที่บันทึกแล้วแก้ไขไม่ได้ ถ้าลงข้อมูลผิดต้องยกเลิกแล้วเปิดออเดอร์ใหม่';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_immutable on orders;
create trigger trg_orders_immutable before update on orders
  for each row execute function guard_orders_immutable();

-- migration: คำขอตรวจยอด (payment_requests) เปลี่ยนจาก "เลือกใบเสนอราคา" เป็น "เลือกออเดอร์" — ผูก order_id
-- (เพิ่มตรงนี้หลังนิยาม orders เพราะ FK อ้างถึง orders(id)) — quotation_id เดิมยังเก็บไว้ (ดึงมาจากออเดอร์อัตโนมัติ)
alter table payment_requests add column if not exists order_id uuid references orders(id) on delete set null;

-- ===== ACCOUNTING DOCUMENT REQUESTS (คำขอเอกสารบัญชี — ใบแจ้งหนี้/ใบกำกับภาษี/ใบเสร็จ) =====
-- order_id ผูกกับ orders(id) — คำขอเอกสารบัญชีเปิดจากหน้า "ออเดอร์" (ออเดอร์หนึ่งใบขอเอกสารได้หลายรอบ เช่น ขอใบแจ้งหนี้ก่อน แล้วขอใบกำกับภาษีทีหลัง)
-- (ฐานข้อมูลเก่าที่เคยผูกกับ quotations จะถูก re-anchor ไป orders โดยบล็อก migration ด้านล่างตาราง accounting_document_files)
-- document_status ขับด้วย workflow ในโค้ด (ไม่ใช่ picklist ที่แก้เองได้) เหมือน payment_requests.status
create table if not exists accounting_document_requests (
  id                        uuid primary key default uuid_generate_v4(),
  order_id                  uuid references orders(id) on delete cascade,
  company_id                uuid references companies(id) on delete set null,
  customer_name             text,
  sales_id                  uuid references auth.users(id),
  sales_name                text,
  document_type             text not null,   -- 'ใบแจ้งหนี้' | 'ใบกำกับภาษี + ใบเสร็จรับเงิน' | 'ใบเสร็จรับเงิน' | 'เอกสารอื่นๆ'
  delivery_method           text not null,   -- 'ส่งสำเนาทางอีเมล' | 'ส่งตัวจริง' | 'ส่งทั้งอีเมลและตัวจริง'
  priority                  text not null default 'ปกติ', -- 'ปกติ' | 'ด่วน' | 'ด่วนมาก / ลูกค้ารอใช้เอกสาร'
  tax_name                  text,
  tax_id                    text,
  branch_type               text,            -- 'สำนักงานใหญ่' | 'สาขา'
  branch_no                 text,
  tax_address               text,
  email_to                  text,
  original_recipient_name   text,
  original_recipient_phone  text,
  original_shipping_address text,
  document_status           text not null default 'รอบัญชีตรวจสอบ',
  missing_info_reason       text,
  invoice_no                text,
  tax_invoice_no            text,
  receipt_no                text,
  issued_date               date,
  email_sent_at             timestamptz,
  original_tracking_no      text,
  original_sent_at          timestamptz,
  accounting_note           text,
  sales_note                text,
  created_at                timestamptz default now(),
  updated_at                timestamptz default now(),
  submitted_at              timestamptz,
  reviewed_at               timestamptz,
  issued_at                 timestamptz,
  completed_at              timestamptz,
  cancelled_at              timestamptz
);

-- revised_at: ประทับเวลาเมื่อเซลล์แก้ไข+ส่งคำขอใหม่หลังเคยส่งไปแล้ว — ใช้โชว์ badge "อัพเดท" ให้บัญชีรู้ว่ามีการเปลี่ยนแปลง (เผื่อออกเอกสารไปแล้ว)
alter table accounting_document_requests add column if not exists revised_at timestamptz;

drop trigger if exists trg_accounting_document_requests_updated on accounting_document_requests;
create trigger trg_accounting_document_requests_updated before update on accounting_document_requests
  for each row execute function set_updated_at();

-- ===== ACCOUNTING DOCUMENT FILES (ไฟล์เอกสารที่บัญชีอัปโหลด — เก็บทุกเวอร์ชัน ไม่ลบของเก่า) =====
create table if not exists accounting_document_files (
  id                     uuid primary key default uuid_generate_v4(),
  request_id             uuid references accounting_document_requests(id) on delete cascade,
  order_id               uuid references orders(id) on delete set null,
  file_type              text not null,   -- 'invoice' | 'tax_invoice' | 'receipt' | 'tax_invoice_receipt' | 'other'
  file_name              text,
  file_url               text not null,   -- path ใน storage bucket "accounting-documents"
  document_no            text,
  document_date          date,
  version_no             int not null default 1,
  is_current             boolean not null default true,
  uploaded_by            uuid references auth.users(id),
  uploaded_by_name       text,
  uploaded_at            timestamptz default now(),
  note                   text,
  downloaded_by_sales_at timestamptz,
  sent_to_customer_at    timestamptz,
  sent_to_customer_by    text,
  customer_sent_channel  text,   -- 'email' | 'line' | 'whatsapp' | 'manual' | 'other'
  created_at             timestamptz default now(),
  updated_at             timestamptz default now()
);

drop trigger if exists trg_accounting_document_files_updated on accounting_document_files;
create trigger trg_accounting_document_files_updated before update on accounting_document_files
  for each row execute function set_updated_at();

-- migration (รันครั้งเดียวโดยอัตโนมัติ): re-anchor คำขอเอกสารบัญชีจาก quotations -> orders
-- ฐานข้อมูลรุ่นเก่า order_id ชี้ไปที่ quotations(id) ซึ่งความหมายเปลี่ยนไปแล้ว (ตอนนี้ควรเป็น orders(id)) — แถวเดิมจึงใช้ไม่ได้ ต้องล้างทิ้ง
-- บล็อกนี้ทำงานเฉพาะตอน constraint ยังชี้ไป quotations เท่านั้น รันซ้ำอีกครั้งจะข้าม (idempotent) และไม่ลบข้อมูลที่ผูกกับ orders แล้ว
do $$
declare
  ref_table text;
begin
  select confrelid::regclass::text into ref_table
  from pg_constraint where conname = 'accounting_document_requests_order_id_fkey';
  if ref_table is not null and ref_table like '%quotations' then
    delete from accounting_document_files;
    delete from accounting_document_requests;
    alter table accounting_document_files    drop constraint if exists accounting_document_files_order_id_fkey;
    alter table accounting_document_requests drop constraint if exists accounting_document_requests_order_id_fkey;
    alter table accounting_document_requests
      add constraint accounting_document_requests_order_id_fkey
      foreign key (order_id) references orders(id) on delete cascade;
    alter table accounting_document_files
      add constraint accounting_document_files_order_id_fkey
      foreign key (order_id) references orders(id) on delete set null;
  end if;
end $$;

-- ฟังก์ชัน SECURITY DEFINER ให้ Sale ทำ 2 อย่างนี้ได้โดยไม่ต้องมีสิทธิ์ UPDATE เต็มแถวไฟล์เอกสารบัญชี (ซึ่งห้าม Sale แก้ตาม requirement)
-- จำกัดผลเฉพาะคอลัมน์ log การดาวน์โหลด/การส่งให้ลูกค้าเท่านั้น แก้ file_url/document_no ผ่านทางนี้ไม่ได้
create or replace function mark_doc_file_downloaded(p_file_id uuid) returns void as $$
begin
  update accounting_document_files set downloaded_by_sales_at = now() where id = p_file_id;
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function mark_doc_file_downloaded(uuid) to authenticated;

create or replace function mark_doc_file_sent_to_customer(p_file_id uuid, p_channel text, p_actor_name text) returns void as $$
begin
  update accounting_document_files
  set sent_to_customer_at = now(), sent_to_customer_by = p_actor_name, customer_sent_channel = p_channel
  where id = p_file_id;
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function mark_doc_file_sent_to_customer(uuid, text, text) to authenticated;

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
-- pr_seq เดิม (PR-000001 นับต่อเนื่องไม่รีเซ็ต) เลิกใช้แล้ว แทนที่ด้วย gen_pr_no() รูปแบบใหม่ด้านล่าง — เก็บ sequence ไว้เฉยๆ ไม่ลบ กันพัง ไม่มีอะไรอ้างอิงแล้ว
create sequence if not exists pr_seq start 1;

-- เลขคำขอรูปแบบใหม่: RE{ปี พ.ศ. 2 หลัก}{เดือน 2 หลัก}{เลขวิ่ง 3 หลัก} เช่น RE6907013 = ปี 2569 เดือน 07 ลำดับที่ 013
-- เลขวิ่งรีเซ็ตเป็น 001 ทุกเดือน (เหมือน gen_order_no ที่รีเซ็ตทุกปี) แยกตัวนับตามปี+เดือน — security definer bypass RLS บนตาราง counter เหมือน order_no_counters
create table if not exists pr_no_counters (
  year    int not null,
  month   int not null,
  counter int not null default 0,
  primary key (year, month)
);

drop function if exists gen_pr_no();
create or replace function gen_pr_no() returns text as $$
declare
  buddhist_year int := extract(year from now())::int + 543;
  cur_month int := extract(month from now())::int;
  yy text := lpad((buddhist_year % 100)::text, 2, '0');
  mm text := lpad(cur_month::text, 2, '0');
  n int;
begin
  insert into pr_no_counters (year, month, counter) values (buddhist_year, cur_month, 1)
  on conflict (year, month) do update set counter = pr_no_counters.counter + 1
  returning counter into n;
  return 'RE' || yy || mm || lpad(n::text, 3, '0');
end;
$$ language plpgsql security definer set search_path = public;
grant execute on function gen_pr_no() to authenticated;

-- migration ครั้งเดียว: เลข 001-012 ของเดือน ก.ค. 2569 (พ.ศ.) ถูกใช้นอกระบบไปแล้วก่อนมีฟีเจอร์นี้ — seed ตัวนับให้ต่อจาก 013
-- และแก้เลขคำขอเดิม PR-000001 (ใบแรกที่สร้างในระบบ) ให้ตรงกับเลขที่ควรจะเป็นตามลำดับจริง
insert into pr_no_counters (year, month, counter) values (2569, 7, 13)
on conflict (year, month) do nothing;
update payment_requests set pr_no = 'RE6907013' where pr_no = 'PR-000001';

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

-- lead_id = ผูกกิจกรรมกับลีดโดยตรง สำหรับบันทึกการติดต่อจากหน้า "ผู้ติดต่อ" ก่อนที่ลีดจะถูกแปลงเป็นลูกค้า (ตอนนั้นยังไม่มี company_id ให้ผูก)
-- ถ้าลีดถูกแปลงเป็นลูกค้าแล้วตอนบันทึก จะผูก company_id ควบคู่ไปด้วย (ดู ActivityModal) ไปโผล่ในแท็บกิจกรรมของบริษัทนั้นเลย ไม่ต้องแบ็กฟิลทีหลัง
alter table activities add column if not exists lead_id uuid references leads(id) on delete cascade;

-- lead_id บนงาน Follow-up เช่นกัน — ตอนบันทึกประวัติการติดต่อถ้าเซลล์กรอกวันที่ติดตาม จะสร้างงานนี้ให้อัตโนมัติ (ดู saveActivity ใน App.jsx) ไม่ต้องเข้าไปกรอกซ้ำที่หน้า "งานติดตาม"
-- ไม่ต้องแก้ RLS เพิ่ม เพราะ policy ของ tasks ใช้ created_by ไม่ได้อิงจาก company_id เหมือน activities
alter table tasks add column if not exists lead_id uuid references leads(id) on delete cascade;

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

-- เพิ่มทีหลัง: ให้เลือกได้ตอนบันทึกประวัติการติดต่อว่ายังต้องติดตามต่อ (คู่กับงาน Follow-up ที่สร้างอัตโนมัติ)
insert into picklists (list_key, value, sort_order) values ('lead_statuses', 'งานติดตาม', 5)
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

-- ===== Storage bucket สำหรับเอกสารบัญชี (private เพราะมีข้อมูลภาษี/ลูกค้า — ต่างจาก product-images) =====
insert into storage.buckets (id, name, public)
values ('accounting-documents', 'accounting-documents', false)
on conflict (id) do nothing;

-- อ่านได้ทุกคนที่ login (ต้องใช้ signed URL อยู่ดี เพราะ bucket ไม่ public) — Sale ต้องดาวน์โหลดไฟล์ที่บัญชีอัปโหลดได้
drop policy if exists "accounting-documents: authenticated read" on storage.objects;
create policy "accounting-documents: authenticated read" on storage.objects
  for select using (bucket_id = 'accounting-documents' and auth.role() = 'authenticated');

-- อัปโหลด/ลบทำได้เฉพาะฝ่ายบัญชี/แอดมิน เท่านั้น (ตาม requirement ห้าม Sale Upload/Replace/Delete เอกสารบัญชี)
drop policy if exists "accounting-documents: finance upload" on storage.objects;
create policy "accounting-documents: finance upload" on storage.objects
  for insert with check (bucket_id = 'accounting-documents' and (is_admin() or is_finance()));

drop policy if exists "accounting-documents: finance delete" on storage.objects;
create policy "accounting-documents: finance delete" on storage.objects
  for delete using (bucket_id = 'accounting-documents' and (is_admin() or is_finance()));

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
alter table accounting_document_requests enable row level security;
alter table accounting_document_files enable row level security;
alter table orders       enable row level security;
alter table order_items  enable row level security;
alter table order_no_counters enable row level security; -- ไม่มี policy เลย = ปิดกั้นเข้าถึงตรงๆ ทุกทาง เข้าได้แค่ผ่าน gen_order_no() (security definer)
alter table pr_no_counters enable row level security; -- เช่นเดียวกับ order_no_counters — เข้าได้แค่ผ่าน gen_pr_no() (security definer)

-- ลบ policy แบบเก่า "authenticated ทำได้ทุกอย่าง" (ถ้ามีจากเวอร์ชันก่อนหน้า)
drop policy if exists "allow all for authenticated" on companies;
drop policy if exists "allow all for authenticated" on contacts;
drop policy if exists "allow all for authenticated" on activities;
drop policy if exists "allow all for authenticated" on deals;
drop policy if exists "allow all for authenticated" on tasks;
drop policy if exists "allow all for authenticated" on quotations;
drop policy if exists "allow all for authenticated" on settings;

-- ----- companies: admin เห็น/แก้ไข/ลบได้ทั้งหมด, sale เห็น/แก้ไขเฉพาะของตัวเอง + ข้อมูลเก่าที่ยังไม่มีเจ้าของ (ลบไม่ได้ ต้องแจ้ง admin) -----
-- ฝ่ายบัญชี (finance) เห็นได้ทุกบริษัท (ไว้ตรวจสอบข้อมูลกับที่เซลล์กรอก) แต่เพิ่ม/แก้ไข/ลบไม่ได้เด็ดขาด
drop policy if exists "companies select" on companies;
create policy "companies select" on companies for select using (
  is_admin() or is_finance() or created_by = auth.uid() or created_by is null
);
drop policy if exists "companies insert" on companies;
create policy "companies insert" on companies for insert with check (
  auth.role() = 'authenticated' and not is_finance()
);
drop policy if exists "companies update" on companies;
create policy "companies update" on companies for update using (
  is_admin() or (not is_finance() and (created_by = auth.uid() or created_by is null))
) with check (
  is_admin() or (not is_finance() and (created_by = auth.uid() or created_by is null))
);
-- ลบบริษัทลูกค้าได้เฉพาะ admin เท่านั้น (ตัดสิทธิ์ sale ลบเองออก กันลบข้อมูลลูกค้า/ผู้ติดต่อออกจากระบบโดยไม่ตั้งใจ — ต้องแจ้ง admin ให้ลบแทน)
drop policy if exists "companies delete" on companies;
create policy "companies delete" on companies for delete using (
  is_admin()
);

-- ----- deals: select/update เหมือน companies (owner หรือยังไม่มีเจ้าของ) — ลบได้เฉพาะ admin เท่านั้น -----
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
-- ลบดีลได้เฉพาะ admin เท่านั้น (ตัดสิทธิ์ sale ลบเองออก เหมือน companies/quotations/products — ต้องแจ้ง admin ให้ลบแทน)
drop policy if exists "deals delete" on deals;
create policy "deals delete" on deals for delete using (
  is_admin()
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

-- lead_id ผูกกับ leads ที่เปิดให้ authenticated ทุกคนเข้าถึงอยู่แล้ว (ดู "leads select/insert/update" ด้านล่าง) จึงให้สิทธิ์แบบเดียวกันสำหรับกิจกรรมที่ผูกกับลีดโดยตรง (ยังไม่มี company_id)
drop policy if exists "activities all" on activities;
create policy "activities all" on activities for all using (
  (activities.lead_id is not null and auth.role() = 'authenticated')
  or exists (select 1 from companies c where c.id = activities.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
) with check (
  (activities.lead_id is not null and auth.role() = 'authenticated')
  or exists (select 1 from companies c where c.id = activities.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
);

-- select/insert/update สืบสิทธิ์จากบริษัทแม่เหมือนเดิม — ลบแยกเป็นนโยบายของตัวเอง จำกัดเฉพาะ admin (sale ลบเองไม่ได้แล้ว ต้องแจ้ง admin)
drop policy if exists "quotations all" on quotations;
drop policy if exists "quotations select" on quotations;
create policy "quotations select" on quotations for select using (
  exists (select 1 from companies c where c.id = quotations.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
);
drop policy if exists "quotations insert" on quotations;
create policy "quotations insert" on quotations for insert with check (
  exists (select 1 from companies c where c.id = quotations.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
);
drop policy if exists "quotations update" on quotations;
create policy "quotations update" on quotations for update using (
  exists (select 1 from companies c where c.id = quotations.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
) with check (
  exists (select 1 from companies c where c.id = quotations.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
);
drop policy if exists "quotations delete" on quotations;
create policy "quotations delete" on quotations for delete using (
  is_admin()
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

-- ----- products: ทุกคนที่ login แล้วอ่าน/เพิ่ม/แก้ไขได้หมด — ลบได้เฉพาะ admin เท่านั้น (sale ลบเองไม่ได้แล้ว ต้องแจ้ง admin) -----
drop policy if exists "products select" on products;
create policy "products select" on products for select using (auth.role() = 'authenticated');
drop policy if exists "products write" on products;
drop policy if exists "products insert" on products;
create policy "products insert" on products for insert with check (auth.role() = 'authenticated');
drop policy if exists "products update" on products;
create policy "products update" on products for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "products delete" on products;
create policy "products delete" on products for delete using (is_admin());

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

-- ----- payment_requests: ทุกคนที่ login "เห็น" ได้ทุกใบเสมอ (ไม่จำกัดแค่ของตัวเอง) — แก้ไข/ลบยังจำกัดแค่เจ้าของ/finance/admin เหมือนเดิม -----
-- (เดิม select ก็จำกัดแค่ของตัวเองด้วย ทำให้ sale มองไม่เห็นคำขอที่ user อื่น/admin สร้างไว้ — เปลี่ยนเฉพาะ select ตามคำขอ ไม่แตะสิทธิ์แก้ไข/ลบ)
-- ระดับ RLS คุมแค่ว่าใครแตะแถวไหนได้ ส่วนกฎ workflow (แก้ไม่ได้หลัง Submit / ต้องมี remark ฯลฯ) บังคับที่ฝั่งแอปเหมือนโมดูลอื่นในระบบ
drop policy if exists "payment_requests select" on payment_requests;
create policy "payment_requests select" on payment_requests for select using (auth.role() = 'authenticated');
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

-- ----- payment_items: select เปิดตามพาเรนต์ (ทุกคนเห็นได้เหมือน payment_requests) — insert/update/delete ยังจำกัดแค่เจ้าของ/finance/admin เหมือนเดิม -----
-- แยก policy select ออกจาก all เพราะ postgres รวม permissive policies ของคำสั่งเดียวกันด้วย OR — select จะเปิดกว้างแต่ insert/update/delete ยังผ่าน policy "all" ที่เข้มกว่า
drop policy if exists "payment_items all" on payment_items;
drop policy if exists "payment_items select" on payment_items;
create policy "payment_items select" on payment_items for select using (
  exists (select 1 from payment_requests pr where pr.id = payment_items.payment_request_id)
);
drop policy if exists "payment_items write" on payment_items;
create policy "payment_items write" on payment_items for all using (
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

-- ----- accounting_document_requests: ทุกคนที่ login เห็นได้ทุกคำขอ (เหมือน payment_requests) — แก้ไข/ลบจำกัดแค่เจ้าของ(เซลล์ผู้สร้าง — คอลัมน์ sales_id)/finance/admin -----
-- ใช้ sales_id แทน created_by เพราะตารางนี้ไม่มี trigger set_created_by (แอปเซ็ต sales_id เองตอน insert จาก currentUser.id) — ต่างจาก companies/deals/tasks/payment_requests ที่ใช้ created_by
drop policy if exists "accounting_document_requests select" on accounting_document_requests;
create policy "accounting_document_requests select" on accounting_document_requests for select using (auth.role() = 'authenticated');
drop policy if exists "accounting_document_requests insert" on accounting_document_requests;
create policy "accounting_document_requests insert" on accounting_document_requests for insert with check (auth.role() = 'authenticated');
drop policy if exists "accounting_document_requests update" on accounting_document_requests;
create policy "accounting_document_requests update" on accounting_document_requests for update using (
  is_admin() or is_finance() or sales_id = auth.uid() or sales_id is null
) with check (
  is_admin() or is_finance() or sales_id = auth.uid() or sales_id is null
);
drop policy if exists "accounting_document_requests delete" on accounting_document_requests;
create policy "accounting_document_requests delete" on accounting_document_requests for delete using (
  is_admin() or sales_id = auth.uid()
);

-- ----- accounting_document_files: select เปิดให้ทุกคน (Sale ต้องเห็น/ดาวน์โหลดไฟล์ได้) — insert/update/delete เฉพาะ finance/admin เท่านั้น (Sale ห้าม Upload/Replace/Delete) -----
drop policy if exists "accounting_document_files select" on accounting_document_files;
create policy "accounting_document_files select" on accounting_document_files for select using (auth.role() = 'authenticated');
drop policy if exists "accounting_document_files write" on accounting_document_files;
create policy "accounting_document_files write" on accounting_document_files for all using (
  is_admin() or is_finance()
) with check (
  is_admin() or is_finance()
);

-- ----- orders: ทุกคนที่ login เห็นได้ทุกออเดอร์ (เหมือน payment_requests) — insert ได้ทุกคน, update (ยกเลิกเท่านั้น — บังคับด้วย trigger) จำกัดแค่เจ้าของ/admin, ไม่มี delete (ห้ามลบถาวร ยกเลิกได้อย่างเดียว) -----
drop policy if exists "orders select" on orders;
create policy "orders select" on orders for select using (auth.role() = 'authenticated');
drop policy if exists "orders insert" on orders;
create policy "orders insert" on orders for insert with check (auth.role() = 'authenticated');
drop policy if exists "orders update" on orders;
create policy "orders update" on orders for update using (
  is_admin() or sales_id = auth.uid() or sales_id is null
) with check (
  is_admin() or sales_id = auth.uid() or sales_id is null
);

-- ----- order_items: select เปิดตามพาเรนต์ (ทุกคนเห็นได้), insert ได้ตอนสร้างออเดอร์เท่านั้น — ไม่มี update/delete เลย (snapshot ตายตัว ไม่แก้ไขหลังบันทึก) -----
drop policy if exists "order_items select" on order_items;
create policy "order_items select" on order_items for select using (
  exists (select 1 from orders o where o.id = order_items.order_id)
);
drop policy if exists "order_items insert" on order_items;
create policy "order_items insert" on order_items for insert with check (auth.role() = 'authenticated');

-- ============================================================================
-- ===== PRICE & MARGIN CALCULATOR (เช็คราคา/มาร์จิ้นก่อนเสนอลูกค้า) =====
-- ============================================================================
-- แนวคิด: เซลล์กรอกแค่ สินค้า/จำนวน/ราคาที่จะเสนอ/ค่าขนส่งจริง แล้วระบบคำนวณให้เอง
-- ต้นทุนจริงอยู่ในตาราง product_costs ซึ่ง "เซลล์อ่านไม่ได้เลย" (RLS ปิดสนิท)
-- การคำนวณทำฝั่งฐานข้อมูลด้วยฟังก์ชัน security definer แล้วส่งกลับเฉพาะผลลัพธ์ที่ไม่มีต้นทุน
-- ไม่มีระบบอนุมัติราคา — ถ้าต่ำกว่าเกณฑ์ เซลล์เอาสรุปไปคุยหัวหน้าเองนอกระบบ

-- category/brand เป็นข้อมูลสินค้าทั่วไป (เซลล์เห็นได้) จึงอยู่ที่ products ไม่ใช่ที่ตารางต้นทุน
alter table products add column if not exists category text;
alter table products add column if not exists brand text;

-- ----- Cost Master: ต้นทุนและเกณฑ์ราคาของแต่ละสินค้า (บัญชี/แอดมินดูแล) -----
create table if not exists product_costs (
  product_id               uuid primary key references products(id) on delete cascade,
  cost_price               numeric not null default 0,  -- ต้นทุนต่อชิ้น — ห้ามส่งออกไปฝั่งเซลล์เด็ดขาด
  normal_selling_price     numeric,                     -- ราคาขายปกติ
  target_margin_percent    numeric,                     -- Margin เป้าหมาย เช่น 20
  minimum_margin_percent   numeric,                     -- Margin ต่ำสุดที่ยังพอรับได้ เช่น 12
  floor_price              numeric,                     -- ราคาต่ำสุดที่ไม่ควรต่ำกว่า (ต่อชิ้น)
  shipping_buffer_percent  numeric,                     -- ว่าง = ใช้ค่ากลางจาก margin_settings
  provision_buffer_percent numeric,                     -- ว่าง = ใช้ค่ากลางจาก margin_settings
  default_shipping_cost    numeric,                     -- ค่าขนส่งมาตรฐาน ใช้เมื่อเซลล์ไม่กรอก
  packaging_cost           numeric,                     -- เลิกใช้แล้ว (ตัดค่าแพ็กกิ้งออกจากการคำนวณ) — คงคอลัมน์ไว้เผื่อข้อมูลเก่า
  status                   text default 'Active',       -- Active / Inactive / Discontinued
  finance_remark           text,
  updated_by               text,
  updated_at               timestamptz default now()
);

drop trigger if exists trg_product_costs_updated on product_costs;
create trigger trg_product_costs_updated before update on product_costs
  for each row execute function set_updated_at();

-- ----- ค่ากลางที่บัญชีดูแล (ใช้เมื่อสินค้าไม่ได้ระบุค่าเฉพาะของตัวเอง) -----
create table if not exists margin_settings (
  key         text primary key,
  value       text,
  description text,
  owner_role  text,
  updated_by  text,
  updated_at  timestamptz default now()
);

insert into margin_settings (key, value, description, owner_role) values
  ('shipping_buffer_percent',  '2', 'ค่าเผื่อค่าขนส่ง คิดจากยอดขายรวม (%)',              'Finance'),
  ('provision_buffer_percent', '2', 'ค่าเผื่อ Provision / กันความเสี่ยง คิดจากยอดขายรวม (%)', 'Finance'),
  ('default_shipping_cost',    '0', 'ค่าขนส่งมาตรฐาน ใช้เมื่อเซลล์ไม่กรอกค่าขนส่งจริง (บาท)', 'Finance'),
  ('round_suggested_price_to', '1', 'ปัดราคาแนะนำขั้นต่ำขึ้นเป็นจำนวนเท่าของกี่บาท (1 = ปัดเป็นจำนวนเต็ม)', 'Finance')
on conflict (key) do nothing;

-- ค่าแพ็กกิ้งถูกตัดออกจากการคำนวณแล้ว — ลบค่ากลางทิ้งกันบัญชีเห็นแล้วเข้าใจผิดว่ายังมีผล
delete from margin_settings where key = 'default_packaging_cost';

-- ----- ประวัติการเช็คราคา — เป็น log เฉยๆ ไม่ใช่ approval log และไม่มีคอลัมน์ต้นทุน -----
create sequence if not exists price_check_seq start 1;

create table if not exists price_checks (
  id                    uuid primary key default uuid_generate_v4(),
  check_no              text,
  product_id            uuid references products(id) on delete set null,
  product_code          text,
  product_name          text,
  quantity              numeric not null,
  offer_price           numeric not null,
  shipping_cost         numeric not null default 0,
  used_default_shipping boolean default false,
  net_sales             numeric not null,
  shipping_buffer       numeric not null,
  provision_buffer      numeric not null,
  total_profit          numeric not null,
  margin_percent        numeric not null,
  auto_tier             text,
  price_status          text,
  floor_price           numeric,
  suggested_min_price   numeric,
  recommendation        text,
  created_by            uuid references auth.users(id),
  created_by_name       text,
  created_at            timestamptz default now()
);

create index if not exists idx_price_checks_created_at on price_checks (created_at desc);

-- ===== helper: ค่ากลางเป็นตัวเลข =====
create or replace function margin_setting_num(p_key text, p_fallback numeric) returns numeric as $$
  select coalesce((select nullif(trim(value), '')::numeric from margin_settings where key = p_key), p_fallback);
$$ language sql stable security definer set search_path = public;

-- ===== Product Price View: รายการสินค้าพร้อมเกณฑ์ราคาสำหรับเซลล์ — ไม่มี cost_price =====
create or replace function margin_product_view()
returns table (
  product_id               uuid,
  code                     text,
  name                     text,
  category                 text,
  normal_selling_price     numeric,
  target_margin_percent    numeric,
  minimum_margin_percent   numeric,
  floor_price              numeric,
  shipping_buffer_percent  numeric,
  provision_buffer_percent numeric,
  status                   text,
  finance_remark           text,
  has_cost                 boolean
) as $$
  select
    p.id, p.code, p.name, p.category,
    c.normal_selling_price,
    coalesce(c.target_margin_percent, 0),
    coalesce(c.minimum_margin_percent, 0),
    coalesce(c.floor_price, 0),
    coalesce(c.shipping_buffer_percent,  margin_setting_num('shipping_buffer_percent', 2)),
    coalesce(c.provision_buffer_percent, margin_setting_num('provision_buffer_percent', 2)),
    coalesce(c.status, 'Active'),
    c.finance_remark,
    (c.product_id is not null and coalesce(c.cost_price, 0) > 0)
  from products p
  left join product_costs c on c.product_id = p.id
  order by p.code;
$$ language sql stable security definer set search_path = public;

-- ===== แกนกลางการคำนวณ (ภายในเท่านั้น — ผลลัพธ์มี total_profit จึงไม่ grant ให้ authenticated) =====
--  NetSales        = OfferPrice × Quantity
--  ShippingBuffer  = NetSales × ShippingBufferPercent / 100
--  ProvisionBuffer = NetSales × ProvisionBufferPercent / 100
--  TotalCost       = (CostPrice × Qty) + ค่าขนส่งจริง + ShippingBuffer + ProvisionBuffer
--  TotalProfit     = NetSales − TotalCost
--  MarginPercent   = TotalProfit / NetSales × 100
-- ===== ขั้นบันไดราคาตามจำนวน =====
-- ปัญหาเดิม: Floor Price เป็นตัวเลขเดียว คนซื้อ 1 ตัวกับ 100 ตัวโดนเกณฑ์เดียวกัน
-- ขั้นบันไดให้บัญชีตั้งได้ว่า "ซื้อตั้งแต่กี่ชิ้น ลดได้ลึกแค่ไหน" แล้วระบบคิด Floor Price ให้ตามจำนวนที่เซลล์กรอก
-- max_discount_percent คิดจาก normal_selling_price — ถ้าต้นทุนขึ้นจนส่วนลดนั้นทำให้ต่ำกว่า Margin ขั้นต่ำ
-- ระบบจะดึง Floor Price กลับขึ้นมาเองใน margin_compute_price (ไม่ปล่อยให้ขาดทุนเงียบๆ)
create table if not exists product_price_tiers (
  id                     uuid primary key default uuid_generate_v4(),
  product_id             uuid references products(id) on delete cascade,
  min_qty                int not null check (min_qty >= 1),
  max_discount_percent   numeric,   -- ลดจากราคาขายปกติได้ไม่เกินกี่ % (ว่าง = ใช้ Floor Price ของสินค้า)
  minimum_margin_percent numeric,   -- ว่าง = ใช้ของสินค้า
  target_margin_percent  numeric,   -- ว่าง = ใช้ของสินค้า
  note                   text,
  updated_by             text,
  updated_at             timestamptz default now(),
  unique (product_id, min_qty)
);

create index if not exists idx_product_price_tiers_product on product_price_tiers (product_id, min_qty);

drop trigger if exists trg_product_price_tiers_updated on product_price_tiers;
create trigger trg_product_price_tiers_updated before update on product_price_tiers
  for each row execute function set_updated_at();

-- ----- RLS: เป็นเพดานส่วนลดเชิงพาณิชย์ เปิดให้เฉพาะบัญชี/แอดมิน -----
-- เซลล์ไม่ต้องอ่านตารางนี้ตรงๆ เพราะ margin_price_check ส่งขั้นที่ใช้อยู่กับขั้นถัดไปกลับไปให้แล้ว
alter table product_price_tiers enable row level security;
drop policy if exists "product_price_tiers select" on product_price_tiers;
create policy "product_price_tiers select" on product_price_tiers for select using (is_admin() or is_finance());
drop policy if exists "product_price_tiers write" on product_price_tiers;
create policy "product_price_tiers write" on product_price_tiers for all
  using (is_admin() or is_finance()) with check (is_admin() or is_finance());

-- เพดานส่วนลดพิเศษต่อสินค้า (ว่าง = ใช้ค่ากลาง special_discount_percent)
-- เกินส่วนลดของขั้นแต่ยังไม่เกินเพดานนี้ = "ขายได้ แต่ Margin ต่ำ" (เช็คกับหัวหน้า)
-- เกินเพดานนี้ = "ต่ำกว่าเกณฑ์" (ต้องคุยหัวหน้าแน่นอน)
alter table product_costs add column if not exists special_discount_percent numeric;

insert into margin_settings (key, value, description, owner_role) values
  ('special_discount_percent', '15', 'เพดานส่วนลดพิเศษสูงสุดที่ยอมให้ได้ คิดจากราคาขายปกติ (%)', 'Finance')
on conflict (key) do nothing;

create or replace function margin_compute_price(
  p_product_id    uuid,
  p_quantity      numeric,
  p_offer_price   numeric,
  p_shipping_cost numeric default null
) returns json as $$
declare
  v_p             products%rowtype;
  v_c             product_costs%rowtype;
  v_step          product_price_tiers%rowtype;
  v_next          product_price_tiers%rowtype;
  v_ship_buf_pct  numeric;
  v_prov_buf_pct  numeric;
  v_buf           numeric;
  v_used_default  boolean;
  v_ship          numeric;
  v_net           numeric;
  v_ship_buf      numeric;
  v_prov_buf      numeric;
  v_total_cost    numeric;
  v_profit        numeric;
  v_margin        numeric;
  v_target        numeric;
  v_min           numeric;
  v_normal        numeric;
  v_ladder        boolean;
  v_tier_disc     numeric;   -- ส่วนลดที่ขั้นนี้ให้ได้
  v_special_disc  numeric;   -- เพดานส่วนลดพิเศษของสินค้า (คุยหัวหน้าแล้วถึงให้ได้)
  v_offer_disc    numeric;   -- ส่วนลดที่ลูกค้าขอมาจริง
  v_price_tier    numeric;   -- ราคา/ชิ้นที่ตรงกับส่วนลดของขั้นนี้
  v_price_special numeric;   -- ราคา/ชิ้นที่ตรงกับเพดานส่วนลดพิเศษ
  v_fixed         numeric;
  v_price_min     numeric;   -- ราคา/ชิ้นที่ยังได้ Margin ขั้นต่ำพอดี (เกณฑ์ที่ "รับได้" ไม่ใช่เส้นขาดทุน)
  v_breakeven     numeric;   -- ราคา/ชิ้นที่กำไรเป็นศูนย์พอดี (รวม Buffer แล้ว) = เส้นขาดทุนจริง
  v_price_target  numeric;
  v_floor         numeric;
  v_floor_source  text;
  v_tier_label    text;
  v_next_price    numeric;
  v_suggest       numeric;
  v_suggest_err   text;
  v_round         numeric;
  v_recommend     text;
  v_tier          text;
  v_status        text;
begin
  select * into v_p from products where id = p_product_id;
  if not found then
    raise exception 'ไม่พบข้อมูลสินค้า';
  end if;

  select * into v_c from product_costs where product_id = p_product_id;
  if not found or coalesce(v_c.cost_price, 0) <= 0 then
    raise exception 'ยังไม่ได้ตั้งต้นทุนของสินค้า % — ให้ฝ่ายบัญชีกรอกต้นทุนในหน้า "ต้นทุนสินค้า" ก่อน', v_p.code;
  end if;
  if coalesce(p_quantity, 0) <= 0 then
    raise exception 'จำนวนต้องมากกว่า 0';
  end if;
  if coalesce(p_offer_price, 0) <= 0 then
    raise exception 'ราคาที่จะเสนอต้องมากกว่า 0';
  end if;

  -- ค่าเฉพาะของสินค้า > ค่ากลางที่บัญชีตั้งไว้ > ค่าสำรอง
  v_ship_buf_pct := coalesce(v_c.shipping_buffer_percent,  margin_setting_num('shipping_buffer_percent', 2));
  v_prov_buf_pct := coalesce(v_c.provision_buffer_percent, margin_setting_num('provision_buffer_percent', 2));
  v_buf          := (v_ship_buf_pct + v_prov_buf_pct) / 100;

  v_used_default := (p_shipping_cost is null);
  v_ship := case when v_used_default
                 then coalesce(v_c.default_shipping_cost, margin_setting_num('default_shipping_cost', 0))
                 else p_shipping_cost end;

  v_net        := p_offer_price * p_quantity;
  v_ship_buf   := v_net * v_ship_buf_pct / 100;
  v_prov_buf   := v_net * v_prov_buf_pct / 100;
  v_total_cost := (v_c.cost_price * p_quantity) + v_ship + v_ship_buf + v_prov_buf;
  v_profit     := v_net - v_total_cost;
  v_margin     := case when v_net > 0 then v_profit / v_net * 100 else 0 end;

  -- ===== ขั้นบันไดตามจำนวน: หยิบขั้นที่ min_qty มากที่สุดที่ยังไม่เกินจำนวนที่สั่ง =====
  select * into v_step from product_price_tiers
    where product_id = p_product_id and min_qty <= p_quantity
    order by min_qty desc limit 1;
  select * into v_next from product_price_tiers
    where product_id = p_product_id and min_qty > p_quantity
    order by min_qty asc limit 1;

  v_target := coalesce(v_step.target_margin_percent,  v_c.target_margin_percent, 0);
  v_min    := coalesce(v_step.minimum_margin_percent, v_c.minimum_margin_percent, 0);

  -- ต้นทุนคงที่ของดีลนี้ (ยังไม่รวม buffer เพราะ buffer คิดจากยอดขายซึ่งยังไม่รู้)
  v_fixed := (v_c.cost_price * p_quantity) + v_ship;
  if 1 - v_buf - (v_min / 100)    > 0 then v_price_min    := (v_fixed / (1 - v_buf - (v_min / 100)))    / p_quantity; end if;
  if 1 - v_buf - (v_target / 100) > 0 then v_price_target := (v_fixed / (1 - v_buf - (v_target / 100))) / p_quantity; end if;
  if 1 - v_buf > 0 then v_breakeven := (v_fixed / (1 - v_buf)) / p_quantity; end if;

  v_normal := coalesce(v_c.normal_selling_price, 0);
  if v_normal > 0 then v_offer_disc := (1 - p_offer_price / v_normal) * 100; end if;
  -- โหมดขั้นบันได ใช้ได้ต่อเมื่อมีราคาขายปกติและมีขั้นที่ตรงกับจำนวนนี้ — ไม่งั้นทำงานแบบเดิมด้วย Floor Price ตัวเดียว
  v_ladder := (v_normal > 0 and v_step.id is not null);

  if v_ladder then
    v_tier_disc     := coalesce(v_step.max_discount_percent, 0);
    v_special_disc  := coalesce(v_c.special_discount_percent, margin_setting_num('special_discount_percent', 15));
    v_price_tier    := v_normal * (1 - v_tier_disc / 100);
    v_price_special := v_normal * (1 - v_special_disc / 100);
    -- เส้น "ไม่ควรขาย" = ราคาที่เท่าทุนจริงเท่านั้น
    -- Margin ขั้นต่ำคือ "ต่ำสุดที่รับได้" ไม่ใช่จุดขาดทุน ต่ำกว่านั้นแต่ยังมีกำไร = "ต่ำกว่าเกณฑ์" (คุยหัวหน้า) ไม่ใช่ห้ามขาย
    v_floor := coalesce(v_breakeven, 0);
    v_floor_source := 'ขั้น ' || v_step.min_qty || ' ชิ้นขึ้นไป · ส่วนลดปกติ ' || trim(to_char(v_tier_disc, 'FM999990.##'))
                      || '% · เพดานพิเศษ ' || trim(to_char(v_special_disc, 'FM999990.##'))
                      || '% · ต่ำกว่าราคาเท่าทุนถึงจะห้ามขาย';
    v_tier_label := 'ขั้น ' || v_step.min_qty || ' ชิ้นขึ้นไป';
  else
    v_floor := coalesce(v_c.floor_price, 0);
    v_floor_source := 'Floor Price ของสินค้า (ยังไม่ได้ตั้งขั้นบันไดตามจำนวน)';
  end if;

  -- ===== ตัดสินสถานะ =====
  if v_ladder then
    -- ไล่ตามส่วนลด: อยู่ในเกณฑ์ของขั้น → ใช้ส่วนลดพิเศษ → เกินเพดาน → ต่ำจนไม่คุ้มต้นทุน
    -- เทียบกันที่ "% ส่วนลด" ไม่ใช่ตัวเงิน และเผื่อ 0.05 จุด — เซลล์พิมพ์ราคากลมๆ (10% ของ 1,919 = 1,727.10
    -- แต่จะเสนอ 1,727) ต้องไม่ตกไปอีกระดับเพราะเศษสตางค์
    if v_profit <= 0 or v_margin <= 0 then
      -- ขาดทุนจริงเท่านั้นถึงจะห้ามขาย
      v_tier := 'Below Cost / ไม่ควรขาย';               v_status := 'ไม่ควรขาย';
    elsif v_offer_disc > v_special_disc + 0.05 then
      v_tier := 'Tier 3 / เกินเพดานส่วนลดพิเศษ';         v_status := 'ต่ำกว่าเกณฑ์';
    elsif v_price_min is not null and p_offer_price < v_price_min - 0.005 then
      -- ส่วนลดยังอยู่ในกรอบ แต่ Margin ที่ได้ต่ำกว่าที่รับได้ — มักแปลว่าต้นทุนขึ้นจนเกณฑ์ส่วนลดเก่าไม่ทันแล้ว
      v_tier := 'Tier 3 / Margin ต่ำกว่าที่รับได้';       v_status := 'ต่ำกว่าเกณฑ์';
    elsif v_offer_disc <= v_tier_disc + 0.05 then
      v_tier := 'Tier 1 / อยู่ในส่วนลดของขั้นนี้';        v_status := 'ผ่าน / ขายได้';
    else
      v_tier := 'Tier 2 / ใช้ส่วนลดพิเศษ';               v_status := 'ขายได้ แต่ Margin ต่ำ';
    end if;
  else
    -- Floor Price ที่บัญชีตั้งเองยังเป็นเส้นห้ามขายได้ เพราะเป็นกฎที่ตั้งใจกำหนด ไม่ใช่ผลข้างเคียงของ Margin ขั้นต่ำ
    if v_net <= 0 or (v_floor > 0 and p_offer_price < v_floor) or v_profit <= 0 or v_margin <= 0 then
      v_tier := 'Below Floor / ไม่ควรขาย';       v_status := 'ไม่ควรขาย';
    elsif v_margin >= v_target then
      v_tier := 'Tier 1 / ราคาดี';                v_status := 'ผ่าน / ขายได้';
    elsif v_margin >= v_min then
      v_tier := 'Tier 2 / ราคาขายได้';            v_status := 'ขายได้ แต่ Margin ต่ำ';
    else
      v_tier := 'Tier 3 / ต่ำกว่าเกณฑ์';           v_status := 'ต่ำกว่าเกณฑ์';
    end if;
  end if;

  -- ราคาต่ำสุดที่ควรเสนอ = สูงกว่าระหว่าง "ราคาที่ได้ Margin ขั้นต่ำ" กับ "Floor Price ที่ใช้จริง"
  v_round := margin_setting_num('round_suggested_price_to', 1);
  if v_price_min is null then
    v_suggest_err := 'คำนวณราคาขั้นต่ำไม่ได้ — Buffer รวมกับ Margin ขั้นต่ำเกิน 100% ให้ฝ่ายบัญชีทบทวนค่าเหล่านี้';
  else
    v_suggest := greatest(v_price_min, v_floor);
    if v_round > 0 then v_suggest := ceil(v_suggest / v_round) * v_round; end if;
  end if;
  if v_price_target is not null then
    v_price_target := greatest(v_price_target, v_floor);
    if v_round > 0 then v_price_target := ceil(v_price_target / v_round) * v_round; end if;
  end if;

  -- ขั้นถัดไป ใช้เป็นไพ่ให้เซลล์ชวนลูกค้าซื้อเพิ่ม (ราคาโดยประมาณ เพราะค่าขนส่งของล็อตใหญ่จริงอาจต่างไป)
  if v_next.id is not null and v_next.max_discount_percent is not null and v_normal > 0 then
    v_next_price := round(v_normal * (1 - v_next.max_discount_percent / 100), 2);
  end if;

  -- ===== คำแนะนำ =====
  if v_ladder then
    if v_status = 'ผ่าน / ขายได้' then
      v_recommend := 'อยู่ในส่วนลดที่ขั้นนี้ให้ได้ (' || trim(to_char(v_tier_disc, 'FM999990.##')) || '%) เสนอราคานี้ได้เลย';
    elsif v_status = 'ขายได้ แต่ Margin ต่ำ' then
      v_recommend := 'เกินส่วนลดปกติของขั้นนี้ (' || trim(to_char(v_tier_disc, 'FM999990.##'))
        || '%) แต่ยังไม่เกินเพดานพิเศษ ' || trim(to_char(v_special_disc, 'FM999990.##')) || '% — ควรเช็คกับหัวหน้าก่อนยืนยัน';
    elsif v_status = 'ต่ำกว่าเกณฑ์' then
      -- ยังมีกำไรอยู่ ห้ามเขียนให้เข้าใจว่าขาดทุน แค่ต่ำกว่าเกณฑ์ที่ตกลงกันไว้
      if v_offer_disc > v_special_disc + 0.05 then
        v_recommend := 'ยังมีกำไร แต่ส่วนลดเกินเพดานพิเศษ ' || trim(to_char(v_special_disc, 'FM999990.##'))
          || '% ต้องคุยหัวหน้าก่อนเสนอราคานี้ให้ลูกค้า';
      else
        v_recommend := 'ยังมีกำไร แต่ Margin ต่ำกว่าขั้นต่ำที่รับได้ (' || trim(to_char(v_min, 'FM999990.##'))
          || '%) — ส่วนลดยังอยู่ในกรอบ แปลว่าต้นทุนอาจขึ้นจนเกณฑ์ส่วนลดเดิมไม่ทันแล้ว ควรคุยหัวหน้าและแจ้งบัญชีทบทวนเกณฑ์';
      end if;
    else
      v_recommend := 'ราคานี้ขาดทุน ไม่ควรเสนอ — ต้องขยับราคาขึ้น';
    end if;
    if v_offer_disc is not null then
      v_recommend := 'ลูกค้าขอส่วนลด ' || trim(to_char(v_offer_disc, 'FM999990.##')) || '% — ' || v_recommend;
    end if;
  else
    v_recommend := case v_status
      when 'ผ่าน / ขายได้'          then 'ผ่านเกณฑ์ สามารถเสนอราคานี้ได้'
      when 'ขายได้ แต่ Margin ต่ำ'   then 'ขายได้ แต่ Margin ต่ำกว่าเป้าหมาย ควรพิจารณาจำนวนและเงื่อนไขก่อนเสนอ'
      when 'ต่ำกว่าเกณฑ์'            then 'ต่ำกว่า Margin ขั้นต่ำ ควรคุยหัวหน้าก่อนเสนอราคานี้ให้ลูกค้า'
      else 'ไม่แนะนำให้ขาย ราคานี้ต่ำกว่า Floor Price หรืออาจไม่ครอบคลุมต้นทุนรวม'
    end;
  end if;

  if v_used_default then
    v_recommend := v_recommend || E'\n(ไม่ได้กรอกค่าขนส่ง — ใช้ค่ามาตรฐาน ' || to_char(v_ship, 'FM999,999,990.00') || ' บาทแทน)';
  end if;
  if v_next.id is not null and v_next_price is not null and v_next_price < p_offer_price then
    v_recommend := v_recommend || E'\nถ้าลูกค้าเพิ่มเป็น ' || v_next.min_qty || ' ชิ้น จะลดได้ถึง '
      || trim(to_char(v_next.max_discount_percent, 'FM999990.##')) || '% (ราคา '
      || to_char(v_next_price, 'FM999,999,990.00') || ' บาท/ชิ้น)';
  end if;
  if v_suggest_err is not null then
    v_recommend := v_recommend || E'\n' || v_suggest_err;
  end if;

  return json_build_object(
    'product_id',            v_p.id,
    'product_code',          v_p.code,
    'product_name',          v_p.name,
    'quantity',              p_quantity,
    'offer_price',           p_offer_price,
    'shipping_cost',         round(v_ship, 2),
    'used_default_shipping', v_used_default,
    'net_sales',             round(v_net, 2),
    'shipping_buffer',       round(v_ship_buf, 2),
    'provision_buffer',      round(v_prov_buf, 2),
    'shipping_buffer_percent',  v_ship_buf_pct,
    'provision_buffer_percent', v_prov_buf_pct,
    'total_profit',          round(v_profit, 2),
    'margin_percent',        round(v_margin, 2),
    'target_margin_percent', v_target,
    'minimum_margin_percent', v_min,
    'normal_selling_price',  nullif(v_normal, 0),
    'auto_tier',             v_tier,
    'price_status',          v_status,
    'floor_price',           round(v_floor, 2),
    'breakeven_price',       case when v_breakeven is null then null else round(v_breakeven, 2) end,
    'floor_source',          v_floor_source,
    'ladder',                v_ladder,
    'tier_label',            v_tier_label,
    'tier_min_qty',          v_step.min_qty,
    'tier_discount_percent', v_tier_disc,
    'special_discount_percent', v_special_disc,
    'offer_discount_percent', case when v_offer_disc is null then null else round(v_offer_disc, 2) end,
    'tier_price',            case when v_price_tier is null then null else round(v_price_tier, 2) end,
    'special_price',         case when v_price_special is null then null else round(v_price_special, 2) end,
    'next_tier_min_qty',     v_next.min_qty,
    'next_tier_max_discount_percent', v_next.max_discount_percent,
    'next_tier_price',       v_next_price,
    'suggested_min_price',   case when v_suggest is null then null else round(v_suggest, 2) end,
    'suggested_target_price', case when v_price_target is null then null else round(v_price_target, 2) end,
    'suggested_error',       v_suggest_err,
    'recommendation',        v_recommend
  );
end;
$$ language plpgsql stable security definer set search_path = public;



-- ===== ตัดกำไรเป็นบาทออกถ้าผู้เรียกไม่ใช่บัญชี/แอดมิน =====
-- (เซลล์ยังเห็น Margin % ตามที่ requirement ต้องการ แต่ไม่ได้ตัวเลขกำไรตรงๆ ไปลบกลับหาต้นทุน)
-- ตัวเลขกลุ่มนี้ย้อนคำนวณต้นทุนได้ตรงๆ (เช่น ราคาเท่าทุน × (1 − buffer) = ต้นทุน) จึงต้องตัดที่นี่
-- ไม่ใช่แค่ซ่อนบนหน้าจอ — ถ้าตัดแค่ฝั่งหน้าเว็บ เปิด DevTools ดู response ก็เห็นอยู่ดี
-- ส่วนราคาที่มาจาก "ราคาขายปกติ × ส่วนลด" (tier_price / special_price / next_tier_price) ไม่เกี่ยวกับต้นทุน ส่งให้เซลล์ได้
create or replace function margin_strip_cost(p_result json) returns json as $$
  select case when is_admin() or is_finance() then p_result
              else (p_result::jsonb
                      - 'total_profit'
                      - 'breakeven_price'
                      - 'floor_price'
                      - 'suggested_min_price'
                      - 'suggested_target_price')::json end;
$$ language sql stable security definer set search_path = public;

-- ===== เช็คราคา (ไม่บันทึกประวัติ) =====
create or replace function margin_price_check(
  p_product_id    uuid,
  p_quantity      numeric,
  p_offer_price   numeric,
  p_shipping_cost numeric default null
) returns json as $$
  select margin_strip_cost(margin_compute_price(p_product_id, p_quantity, p_offer_price, p_shipping_cost));
$$ language sql stable security definer set search_path = public;

-- ===== เช็คราคาแล้วบันทึกประวัติ (คำนวณใหม่ฝั่งเซิร์ฟเวอร์ ไม่เชื่อตัวเลขที่ client ส่งมา) =====
create or replace function margin_save_price_check(
  p_product_id    uuid,
  p_quantity      numeric,
  p_offer_price   numeric,
  p_shipping_cost numeric default null
) returns json as $$
declare
  r json;
  v_name text;
  v_no text;
begin
  r := margin_compute_price(p_product_id, p_quantity, p_offer_price, p_shipping_cost);
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  v_no := 'PC' || to_char(now(), 'YYMM') || lpad(nextval('price_check_seq')::text, 4, '0');

  insert into price_checks (
    check_no, product_id, product_code, product_name, quantity, offer_price, shipping_cost,
    used_default_shipping, net_sales, shipping_buffer, provision_buffer, total_profit,
    margin_percent, auto_tier, price_status, floor_price, suggested_min_price, recommendation,
    created_by, created_by_name
  ) values (
    v_no,
    (r->>'product_id')::uuid, r->>'product_code', r->>'product_name',
    (r->>'quantity')::numeric, (r->>'offer_price')::numeric, (r->>'shipping_cost')::numeric,
    (r->>'used_default_shipping')::boolean, (r->>'net_sales')::numeric,
    (r->>'shipping_buffer')::numeric, (r->>'provision_buffer')::numeric,
    (r->>'total_profit')::numeric, (r->>'margin_percent')::numeric,
    r->>'auto_tier', r->>'price_status', (r->>'floor_price')::numeric,
    nullif(r->>'suggested_min_price', '')::numeric, r->>'recommendation',
    auth.uid(), v_name
  );

  return margin_strip_cost((r::jsonb || jsonb_build_object('check_no', v_no))::json);
end;
$$ language plpgsql volatile security definer set search_path = public;

-- margin_compute_price คืนค่ากำไรดิบ จึงห้ามให้เซลล์เรียกตรง — เรียกได้เฉพาะผ่านสองฟังก์ชันข้างบน
revoke all on function margin_compute_price(uuid, numeric, numeric, numeric) from public, authenticated, anon;
revoke all on function margin_strip_cost(json) from public, anon;
grant execute on function margin_setting_num(text, numeric) to authenticated;
grant execute on function margin_product_view() to authenticated;
grant execute on function margin_price_check(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function margin_save_price_check(uuid, numeric, numeric, numeric) to authenticated;

-- ===== RLS =====
alter table product_costs   enable row level security;
alter table margin_settings enable row level security;
alter table price_checks    enable row level security;

-- ----- product_costs: เฉพาะบัญชี/แอดมินเท่านั้นที่เข้าถึงได้ — เซลล์อ่านไม่ได้เลยแม้ยิง API ตรง -----
drop policy if exists "product_costs select" on product_costs;
create policy "product_costs select" on product_costs for select using (is_admin() or is_finance());
drop policy if exists "product_costs write" on product_costs;
create policy "product_costs write" on product_costs for all
  using (is_admin() or is_finance()) with check (is_admin() or is_finance());

-- ----- margin_settings: ทุกคนอ่านได้ (ไม่ใช่ความลับ ใช้อธิบายที่มาของตัวเลข) แก้ได้เฉพาะบัญชี/แอดมิน -----
drop policy if exists "margin_settings select" on margin_settings;
create policy "margin_settings select" on margin_settings for select using (auth.role() = 'authenticated');
drop policy if exists "margin_settings write" on margin_settings;
create policy "margin_settings write" on margin_settings for all
  using (is_admin() or is_finance()) with check (is_admin() or is_finance());

-- ----- price_checks: บัญชี/แอดมินเห็นทั้งหมด เซลล์เห็นเฉพาะที่ตัวเองเช็ค — ลบได้เฉพาะแอดมิน -----
drop policy if exists "price_checks select" on price_checks;
create policy "price_checks select" on price_checks for select using (
  is_admin() or is_finance() or created_by = auth.uid()
);
drop policy if exists "price_checks delete" on price_checks;
create policy "price_checks delete" on price_checks for delete using (is_admin());

-- ============================================================================
-- ===== ประวัติการแก้ไขต้นทุน + หมายเหตุการเช็คราคา =====
-- ============================================================================
-- ใช้ตอบคำถามย้อนหลังว่า "ทำไมลูกค้ารายนี้เคยได้ราคานี้" — ตอนนั้นต้นทุน/Floor Price เป็นเท่าไหร่
-- และเซลล์บันทึกเหตุผลไว้ว่าอะไร (เช่น ตกลงราคาโปรเจค) — ตารางนี้มีต้นทุน จึงปิดไม่ให้เซลล์อ่านเหมือน product_costs

create table if not exists product_cost_history (
  id                         uuid primary key default uuid_generate_v4(),
  product_id                 uuid references products(id) on delete cascade,
  product_code               text,
  product_name               text,
  action                     text,        -- 'created' | 'updated'
  changed_fields             text[],      -- ชื่อช่องที่เปลี่ยนจริงในครั้งนั้น (ภาษาไทย ใช้โชว์ตรงๆ)
  cost_price                 numeric,
  normal_selling_price       numeric,
  target_margin_percent      numeric,
  minimum_margin_percent     numeric,
  floor_price                numeric,
  shipping_buffer_percent    numeric,
  provision_buffer_percent   numeric,
  default_shipping_cost      numeric,
  status                     text,
  finance_remark             text,
  prev_cost_price            numeric,
  prev_normal_selling_price  numeric,
  prev_target_margin_percent numeric,
  prev_minimum_margin_percent numeric,
  prev_floor_price           numeric,
  changed_by                 uuid references auth.users(id),
  changed_by_name            text,
  changed_at                 timestamptz default now()
);

create index if not exists idx_product_cost_history_product on product_cost_history (product_id, changed_at desc);
create index if not exists idx_product_cost_history_changed_at on product_cost_history (changed_at desc);

-- บันทึกอัตโนมัติทุกครั้งที่ต้นทุนถูกเพิ่ม/แก้ไข ไม่ว่าจะแก้จากฟอร์มหรือนำเข้าไฟล์ (ดักที่ระดับตาราง เลี่ยงไม่ได้)
create or replace function log_product_cost_change() returns trigger as $$
declare
  v_p       products%rowtype;
  v_name    text;
  v_changed text[] := '{}';
begin
  if TG_OP = 'UPDATE' then
    if new.cost_price               is distinct from old.cost_price               then v_changed := v_changed || 'ต้นทุน/ชิ้น'; end if;
    if new.normal_selling_price     is distinct from old.normal_selling_price     then v_changed := v_changed || 'ราคาขายปกติ'; end if;
    if new.target_margin_percent    is distinct from old.target_margin_percent    then v_changed := v_changed || 'Margin เป้าหมาย'; end if;
    if new.minimum_margin_percent   is distinct from old.minimum_margin_percent   then v_changed := v_changed || 'Margin ขั้นต่ำ'; end if;
    if new.floor_price              is distinct from old.floor_price              then v_changed := v_changed || 'Floor Price'; end if;
    if new.shipping_buffer_percent  is distinct from old.shipping_buffer_percent  then v_changed := v_changed || 'Shipping Buffer'; end if;
    if new.provision_buffer_percent is distinct from old.provision_buffer_percent then v_changed := v_changed || 'Provision Buffer'; end if;
    if new.default_shipping_cost    is distinct from old.default_shipping_cost    then v_changed := v_changed || 'ค่าขนส่งมาตรฐาน'; end if;
    if new.status                   is distinct from old.status                   then v_changed := v_changed || 'สถานะ'; end if;
    if new.finance_remark           is distinct from old.finance_remark           then v_changed := v_changed || 'หมายเหตุจากบัญชี'; end if;
    -- กดบันทึกโดยไม่ได้แก้อะไรเลย ไม่ต้องเก็บเป็นประวัติ กันรายการรกจนหาของจริงไม่เจอ
    if array_length(v_changed, 1) is null then return new; end if;
  end if;

  select * into v_p from products where id = new.product_id;
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();

  insert into product_cost_history (
    product_id, product_code, product_name, action, changed_fields,
    cost_price, normal_selling_price, target_margin_percent, minimum_margin_percent, floor_price,
    shipping_buffer_percent, provision_buffer_percent, default_shipping_cost, status, finance_remark,
    prev_cost_price, prev_normal_selling_price, prev_target_margin_percent, prev_minimum_margin_percent, prev_floor_price,
    changed_by, changed_by_name
  ) values (
    new.product_id, v_p.code, v_p.name,
    case when TG_OP = 'INSERT' then 'created' else 'updated' end,
    case when TG_OP = 'INSERT' then array['กรอกต้นทุนครั้งแรก']::text[] else v_changed end,
    new.cost_price, new.normal_selling_price, new.target_margin_percent, new.minimum_margin_percent, new.floor_price,
    new.shipping_buffer_percent, new.provision_buffer_percent, new.default_shipping_cost, new.status, new.finance_remark,
    case when TG_OP = 'UPDATE' then old.cost_price end,
    case when TG_OP = 'UPDATE' then old.normal_selling_price end,
    case when TG_OP = 'UPDATE' then old.target_margin_percent end,
    case when TG_OP = 'UPDATE' then old.minimum_margin_percent end,
    case when TG_OP = 'UPDATE' then old.floor_price end,
    auth.uid(), v_name
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_product_costs_history on product_costs;
create trigger trg_product_costs_history after insert or update on product_costs
  for each row execute function log_product_cost_change();

-- เก็บสถานะปัจจุบันของต้นทุนที่มีอยู่แล้วเป็นจุดตั้งต้น เผื่อระบบเคยถูกใช้ก่อนมีตารางประวัติ
insert into product_cost_history (
  product_id, product_code, product_name, action, changed_fields,
  cost_price, normal_selling_price, target_margin_percent, minimum_margin_percent, floor_price,
  shipping_buffer_percent, provision_buffer_percent, default_shipping_cost, status, finance_remark,
  changed_by_name, changed_at
)
select c.product_id, p.code, p.name, 'created', array['ค่าตั้งต้นก่อนเริ่มเก็บประวัติ']::text[],
       c.cost_price, c.normal_selling_price, c.target_margin_percent, c.minimum_margin_percent, c.floor_price,
       c.shipping_buffer_percent, c.provision_buffer_percent, c.default_shipping_cost, c.status, c.finance_remark,
       c.updated_by, coalesce(c.updated_at, now())
from product_costs c join products p on p.id = c.product_id
where not exists (select 1 from product_cost_history h where h.product_id = c.product_id);

-- ----- RLS: มีต้นทุนอยู่ในตาราง จึงเปิดให้เฉพาะบัญชี/แอดมินเหมือน product_costs -----
alter table product_cost_history enable row level security;
drop policy if exists "product_cost_history select" on product_cost_history;
create policy "product_cost_history select" on product_cost_history for select using (is_admin() or is_finance());
-- ไม่มี policy insert/update/delete = เขียนตรงไม่ได้เลย เข้าได้แค่ผ่าน trigger (security definer)

-- ===== หมายเหตุบนการเช็คราคา — เซลล์บันทึกเหตุผลได้ เช่น "ตกลงราคาโปรเจค A" =====
alter table price_checks add column if not exists note text;
-- option_label = ชื่อตัวเลือกตอนเทียบราคาหลายแบบ (ตัวเลือกที่ 1/2/3) ว่างได้ถ้าเช็คเดี่ยว
alter table price_checks add column if not exists option_label text;

-- เพิ่มพารามิเตอร์ note/option_label — ต้อง drop ของเดิมก่อน ไม่งั้นจะกลายเป็น overload แล้วเรียกแบบ 4 ตัวจะกำกวม
drop function if exists margin_save_price_check(uuid, numeric, numeric, numeric);

create or replace function margin_save_price_check(
  p_product_id    uuid,
  p_quantity      numeric,
  p_offer_price   numeric,
  p_shipping_cost numeric default null,
  p_note          text default null,
  p_option_label  text default null
) returns json as $$
declare
  r json;
  v_name text;
  v_no text;
begin
  r := margin_compute_price(p_product_id, p_quantity, p_offer_price, p_shipping_cost);
  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  v_no := 'PC' || to_char(now(), 'YYMM') || lpad(nextval('price_check_seq')::text, 4, '0');

  insert into price_checks (
    check_no, product_id, product_code, product_name, quantity, offer_price, shipping_cost,
    used_default_shipping, net_sales, shipping_buffer, provision_buffer, total_profit,
    margin_percent, auto_tier, price_status, floor_price, suggested_min_price, recommendation,
    note, option_label, created_by, created_by_name
  ) values (
    v_no,
    (r->>'product_id')::uuid, r->>'product_code', r->>'product_name',
    (r->>'quantity')::numeric, (r->>'offer_price')::numeric, (r->>'shipping_cost')::numeric,
    (r->>'used_default_shipping')::boolean, (r->>'net_sales')::numeric,
    (r->>'shipping_buffer')::numeric, (r->>'provision_buffer')::numeric,
    (r->>'total_profit')::numeric, (r->>'margin_percent')::numeric,
    r->>'auto_tier', r->>'price_status', (r->>'floor_price')::numeric,
    nullif(r->>'suggested_min_price', '')::numeric, r->>'recommendation',
    nullif(trim(coalesce(p_note, '')), ''), nullif(trim(coalesce(p_option_label, '')), ''),
    auth.uid(), v_name
  );

  return margin_strip_cost((r::jsonb || jsonb_build_object('check_no', v_no))::json);
end;
$$ language plpgsql volatile security definer set search_path = public;

grant execute on function margin_save_price_check(uuid, numeric, numeric, numeric, text, text) to authenticated;

-- ============================================================================
-- ===== ต้นทุน ณ วันเปิดออเดอร์ + รายงานกำไร/ส่วนลดจากออเดอร์จริง =====
-- ============================================================================
-- หน้าเช็คราคาเป็นแค่การลองคิด เช็คแล้วอาจไม่ได้ขายจริง จึงเอามาสรุปให้หัวหน้าไม่ได้
-- ออเดอร์คือสิ่งที่เปิดบิลจริง — เก็บต้นทุน ณ วันเปิดไว้เป็น snapshot เหมือนที่ออเดอร์เก็บราคา/ที่อยู่
-- แยกเป็นตารางต่างหาก ไม่ใส่ในตาราง order_items เพราะ order_items เปิดให้ทุกคนอ่านได้ (เซลล์ต้องไม่เห็นต้นทุน)
create table if not exists order_item_costs (
  order_item_id        uuid primary key references order_items(id) on delete cascade,
  order_id             uuid references orders(id) on delete cascade,
  product_id           uuid references products(id) on delete set null,
  unit_cost            numeric,
  normal_selling_price numeric,
  created_at           timestamptz default now()
);

create index if not exists idx_order_item_costs_order on order_item_costs (order_id);

-- เขียนอัตโนมัติตอนบันทึกรายการสินค้าของออเดอร์ — ฝั่งแอปไม่ต้องส่งต้นทุนมา (และส่งไม่ได้ด้วยเพราะเซลล์อ่านไม่ถึง)
create or replace function snapshot_order_item_cost() returns trigger as $$
declare
  v_cost   numeric;
  v_normal numeric;
begin
  if new.product_id is not null then
    select cost_price, normal_selling_price into v_cost, v_normal
      from product_costs where product_id = new.product_id;
    if found then
      insert into order_item_costs (order_item_id, order_id, product_id, unit_cost, normal_selling_price)
      values (new.id, new.order_id, new.product_id, v_cost, v_normal)
      on conflict (order_item_id) do nothing;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_order_items_cost on order_items;
create trigger trg_order_items_cost after insert on order_items
  for each row execute function snapshot_order_item_cost();

-- เติมย้อนหลังให้ออเดอร์เก่า — ใช้ต้นทุนจากประวัติที่ใกล้วันเปิดออเดอร์ที่สุด ถ้าไม่มีประวัติค่อยใช้ต้นทุนปัจจุบัน
-- (นี่คือเหตุผลที่เก็บ product_cost_history ไว้ — ตอบได้ว่าตอนนั้นต้นทุนเท่าไหร่)
insert into order_item_costs (order_item_id, order_id, product_id, unit_cost, normal_selling_price)
select oi.id, oi.order_id, oi.product_id,
  coalesce(
    (select h.cost_price from product_cost_history h
      where h.product_id = oi.product_id and h.changed_at <= o.created_at
      order by h.changed_at desc limit 1),
    (select c.cost_price from product_costs c where c.product_id = oi.product_id)),
  coalesce(
    (select h.normal_selling_price from product_cost_history h
      where h.product_id = oi.product_id and h.changed_at <= o.created_at
      order by h.changed_at desc limit 1),
    (select c.normal_selling_price from product_costs c where c.product_id = oi.product_id))
from order_items oi
join orders o on o.id = oi.order_id
where oi.product_id is not null
  and not exists (select 1 from order_item_costs x where x.order_item_id = oi.id);

alter table order_item_costs enable row level security;
drop policy if exists "order_item_costs select" on order_item_costs;
create policy "order_item_costs select" on order_item_costs for select using (is_admin() or is_finance());
-- ไม่มี policy insert/update/delete = เขียนตรงไม่ได้ เข้าได้แค่ผ่าน trigger (security definer)

-- ===== รายงานระดับรายการสินค้าของออเดอร์จริง (บัญชี/แอดมินเท่านั้น) =====
-- คืนข้อมูลดิบรายบรรทัด ให้หน้าเว็บไปรวมยอดเองตามมุมที่อยากดู (รายออเดอร์ / รายสินค้า / รายเซลล์)
-- ต้อง drop ก่อนเสมอ ไม่ใช่ create or replace เฉยๆ — เวอร์ชันท้ายไฟล์คืนคอลัมน์ต่างจากตรงนี้
-- ถ้าไม่ drop เวลารันไฟล์ซ้ำจะพัง "cannot change return type of existing function"
drop function if exists margin_order_report(date, date);

create or replace function margin_order_report(p_from date default null, p_to date default null)
returns table (
  order_id        uuid,
  order_no        text,
  order_date      timestamptz,
  customer_name   text,
  sales_name      text,
  order_status    text,
  product_id      uuid,
  product_code    text,
  product_name    text,
  quantity        numeric,
  unit_price      numeric,
  line_sales      numeric,
  line_cost       numeric,
  line_normal     numeric
) as $$
begin
  if not (is_admin() or is_finance()) then
    raise exception 'ดูรายงานนี้ได้เฉพาะฝ่ายบัญชีและผู้ดูแลระบบ';
  end if;

  return query
  select
    o.id, o.order_no, o.created_at, o.customer_name, o.sales_name, o.status,
    oi.product_id, p.code, coalesce(p.name, oi.description),
    oi.quantity, oi.unit_price,
    oi.quantity * oi.unit_price,
    oi.quantity * coalesce(oic.unit_cost, 0),
    oi.quantity * coalesce(oic.normal_selling_price, 0)
  from orders o
  join order_items oi on oi.order_id = o.id
  left join order_item_costs oic on oic.order_item_id = oi.id
  left join products p on p.id = oi.product_id
  where (p_from is null or o.created_at >= p_from::timestamptz)
    and (p_to is null or o.created_at < (p_to::timestamptz + interval '1 day'))
  order by o.created_at desc, oi.sort_order;
end;
$$ language plpgsql stable security definer set search_path = public;

grant execute on function margin_order_report(date, date) to authenticated;

-- ============================================================================
-- ===== ให้แอดมินแก้ไขออเดอร์ที่บันทึกแล้วได้ =====
-- ============================================================================
-- เดิมออเดอร์แก้ไม่ได้เลย ผิดต้องยกเลิกแล้วเปิดใหม่ — แต่ถ้าเอกสารบัญชีออกไปแล้วและถูกต้องหมด
-- ผิดแค่จำนวน/ราคาในระบบ การยกเลิกแปลว่าต้องรื้อทั้งชุด จึงเปิดให้แอดมินแก้เฉพาะจุดได้
-- ข้อแลกเปลี่ยน: ออเดอร์ไม่ใช่ snapshot ที่แตะไม่ได้อีกต่อไป จึงต้องมี log ทุกครั้งที่แก้ (ดู trigger ด้านล่าง)
-- เซลล์ยังแก้ไม่ได้เหมือนเดิม ทำได้แค่ยกเลิก
create or replace function guard_orders_immutable() returns trigger as $$
begin
  -- แอดมินแก้ได้ทุกช่อง — ทุกการแก้ถูกบันทึกไว้ที่ audit_logs โดย trigger log_order_edit
  if is_admin() then
    return new;
  end if;
  if old.status = 'Cancelled' then
    raise exception 'ออเดอร์นี้ถูกยกเลิกไปแล้ว แก้ไขไม่ได้อีก';
  end if;
  if new.status = 'Active' and (
    new.order_no is distinct from old.order_no or
    new.quotation_id is distinct from old.quotation_id or
    new.company_id is distinct from old.company_id or
    new.sales_id is distinct from old.sales_id or
    new.shipping_address is distinct from old.shipping_address or
    new.shipping_line1 is distinct from old.shipping_line1 or
    new.shipping_subdistrict is distinct from old.shipping_subdistrict or
    new.shipping_district is distinct from old.shipping_district or
    new.shipping_province is distinct from old.shipping_province or
    new.shipping_postcode is distinct from old.shipping_postcode or
    new.value is distinct from old.value or
    new.company_tax_id is distinct from old.company_tax_id or
    new.company_address is distinct from old.company_address or
    new.company_phone is distinct from old.company_phone or
    new.company_email is distinct from old.company_email or
    new.remark is distinct from old.remark or
    new.order_type is distinct from old.order_type or
    new.discount_type is distinct from old.discount_type or
    new.discount_value is distinct from old.discount_value
  ) then
    raise exception 'ออเดอร์ที่บันทึกแล้วแก้ไขไม่ได้ ถ้าลงข้อมูลผิดต้องยกเลิกแล้วเปิดออเดอร์ใหม่';
  end if;
  return new;
end;
$$ language plpgsql;

-- บันทึกทุกการแก้ไขออเดอร์ลง audit_logs อัตโนมัติ — ดักที่ระดับตาราง แอปจะลืมเขียนไม่ได้
-- (การยกเลิกมี log ของตัวเองอยู่แล้ว จึงข้ามกรณีที่สถานะเปลี่ยน)
create or replace function log_order_edit() returns trigger as $$
declare
  v_name    text;
  v_changed text[] := '{}';
begin
  if new.status is distinct from old.status then return new; end if;

  if new.value is distinct from old.value then
    v_changed := v_changed || ('ยอดรวม ' || coalesce(old.value, 0)::text || ' → ' || coalesce(new.value, 0)::text);
  end if;
  if new.shipping_address is distinct from old.shipping_address then v_changed := v_changed || 'ที่อยู่จัดส่ง'; end if;
  if new.shipping_contact_name is distinct from old.shipping_contact_name then v_changed := v_changed || 'ชื่อผู้รับ'; end if;
  if new.shipping_contact_phone is distinct from old.shipping_contact_phone then v_changed := v_changed || 'เบอร์ผู้รับ'; end if;
  if new.remark is distinct from old.remark then v_changed := v_changed || 'หมายเหตุ'; end if;
  if new.discount_type is distinct from old.discount_type or new.discount_value is distinct from old.discount_value then
    v_changed := v_changed || 'ส่วนลดท้ายบิล';
  end if;
  if new.company_tax_id is distinct from old.company_tax_id or new.company_address is distinct from old.company_address
     or new.company_phone is distinct from old.company_phone or new.company_email is distinct from old.company_email then
    v_changed := v_changed || 'ข้อมูลบริษัทในออเดอร์';
  end if;

  if array_length(v_changed, 1) is null then return new; end if;

  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  insert into audit_logs (entity_type, entity_id, action, actor_id, actor_name, detail)
  values ('order', new.id, 'edit', auth.uid(), v_name,
          'แก้ไขออเดอร์ ' || coalesce(new.order_no, '') || ': ' || array_to_string(v_changed, ' | '));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_orders_edit_log on orders;
create trigger trg_orders_edit_log after update on orders
  for each row execute function log_order_edit();

-- ----- order_items: เดิมไม่มี policy update/delete เลย (แก้ไม่ได้) เปิดให้เฉพาะแอดมิน -----
drop policy if exists "order_items update" on order_items;
create policy "order_items update" on order_items for update using (is_admin()) with check (is_admin());
drop policy if exists "order_items delete" on order_items;
create policy "order_items delete" on order_items for delete using (is_admin());

-- ============================================================================
-- ===== สัดส่วนต้นทุนต่อออเดอร์ (รองรับสินค้า Grade B และกรณีอื่นในอนาคต) =====
-- ============================================================================
-- สินค้า Grade B ต้นทุนจริงต่ำกว่าของใหม่ ถ้าใช้ต้นทุนเต็มไปคำนวณกำไรจะดูแย่กว่าความจริง
-- ออกแบบให้ไม่ฝังตัวเลขไว้ในโค้ด: เก็บ 3 ค่าแยกกัน
--   base_unit_cost      = ต้นทุนเต็มของสินค้า ณ วันเปิดออเดอร์ (ไม่เปลี่ยน)
--   cost_factor_percent = คิดต้นทุนกี่ % ของราคาเต็ม (Grade B = 80 ตามค่ากลาง, ปกติ = 100)
--   unit_cost           = ผลลัพธ์ที่รายงานเอาไปใช้ = base × factor / 100
-- เปลี่ยนค่ากลางได้ที่หน้า "ต้นทุนสินค้า" (มีผลกับออเดอร์ที่เปิดใหม่)
-- และปรับเป็นรายออเดอร์ได้ทีหลังผ่าน margin_set_order_cost_factor (ออเดอร์เก่าไม่ถูกกระทบ)
alter table order_item_costs add column if not exists base_unit_cost numeric;
alter table order_item_costs add column if not exists cost_factor_percent numeric default 100;

insert into margin_settings (key, value, description, owner_role) values
  ('grade_b_cost_factor', '80', 'ออเดอร์สินค้า Grade B คิดต้นทุนกี่ % ของต้นทุนเต็ม (80 = ลบ 20%)', 'Finance')
on conflict (key) do nothing;

create or replace function snapshot_order_item_cost() returns trigger as $$
declare
  v_cost   numeric;
  v_normal numeric;
  v_type   text;
  v_factor numeric;
begin
  if new.product_id is null then return new; end if;

  select cost_price, normal_selling_price into v_cost, v_normal
    from product_costs where product_id = new.product_id;
  if not found then return new; end if;

  select order_type into v_type from orders where id = new.order_id;
  v_factor := case when v_type = 'Grade B' then margin_setting_num('grade_b_cost_factor', 80) else 100 end;

  insert into order_item_costs (order_item_id, order_id, product_id, base_unit_cost, cost_factor_percent, unit_cost, normal_selling_price)
  values (new.id, new.order_id, new.product_id, v_cost, v_factor, round(v_cost * v_factor / 100, 4), v_normal)
  on conflict (order_item_id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- แถวเดิมยังไม่มี base_unit_cost — ถือว่าที่เก็บไว้คือต้นทุนเต็ม (factor 100)
update order_item_costs
set base_unit_cost = unit_cost, cost_factor_percent = coalesce(cost_factor_percent, 100)
where base_unit_cost is null;

-- ออเดอร์ Grade B ที่เปิดไว้ก่อนมีกฎนี้ ยังคิดต้นทุนเต็มอยู่ ปรับให้ตรงกับเกณฑ์ (รันซ้ำไม่ทับซ้ำเพราะเช็ค factor = 100)
update order_item_costs oic
set cost_factor_percent = margin_setting_num('grade_b_cost_factor', 80),
    unit_cost = round(oic.base_unit_cost * margin_setting_num('grade_b_cost_factor', 80) / 100, 4)
from orders o
where o.id = oic.order_id
  and o.order_type = 'Grade B'
  and coalesce(oic.cost_factor_percent, 100) = 100
  and oic.base_unit_cost is not null;

-- ===== ปรับสัดส่วนต้นทุนของออเดอร์ใดออเดอร์หนึ่ง (บัญชี/แอดมิน) =====
-- ใช้เมื่อล็อตนั้นได้ต้นทุนต่างจากเกณฑ์ปกติ เช่น Grade B ที่สภาพแย่กว่าปกติเลยลดลึกกว่า 20%
create or replace function margin_set_order_cost_factor(p_order_id uuid, p_percent numeric)
returns void as $$
declare
  v_name text;
  v_no   text;
  v_old  numeric;
begin
  if not (is_admin() or is_finance()) then
    raise exception 'ปรับสัดส่วนต้นทุนได้เฉพาะฝ่ายบัญชีและผู้ดูแลระบบ';
  end if;
  if p_percent is null or p_percent <= 0 or p_percent > 200 then
    raise exception 'สัดส่วนต้นทุนต้องอยู่ระหว่าง 1-200%%';
  end if;

  select order_no into v_no from orders where id = p_order_id;
  if v_no is null then raise exception 'ไม่พบออเดอร์นี้'; end if;

  select max(cost_factor_percent) into v_old from order_item_costs where order_id = p_order_id;

  update order_item_costs
  set cost_factor_percent = p_percent,
      unit_cost = round(coalesce(base_unit_cost, unit_cost) * p_percent / 100, 4)
  where order_id = p_order_id;

  select coalesce(full_name, email) into v_name from profiles where id = auth.uid();
  insert into audit_logs (entity_type, entity_id, action, actor_id, actor_name, detail)
  values ('order', p_order_id, 'cost_factor', auth.uid(), v_name,
          'ปรับสัดส่วนต้นทุนออเดอร์ ' || v_no || ' จาก ' || coalesce(v_old, 100)::text || '% เป็น ' || p_percent::text || '%');
end;
$$ language plpgsql volatile security definer set search_path = public;

grant execute on function margin_set_order_cost_factor(uuid, numeric) to authenticated;

-- ===== รายงานเดิม + สัดส่วนต้นทุนที่ใช้ =====
-- เปลี่ยนคอลัมน์ที่คืนค่า ต้อง drop ก่อน (postgres แก้ return type ของฟังก์ชันเดิมไม่ได้)
drop function if exists margin_order_report(date, date);

create or replace function margin_order_report(p_from date default null, p_to date default null)
returns table (
  order_id        uuid,
  order_no        text,
  order_date      timestamptz,
  customer_name   text,
  sales_name      text,
  order_status    text,
  order_type      text,
  cost_factor     numeric,
  product_id      uuid,
  product_code    text,
  product_name    text,
  quantity        numeric,
  unit_price      numeric,
  line_sales      numeric,
  line_cost       numeric,
  line_normal     numeric
) as $$
begin
  if not (is_admin() or is_finance()) then
    raise exception 'ดูรายงานนี้ได้เฉพาะฝ่ายบัญชีและผู้ดูแลระบบ';
  end if;

  return query
  select
    o.id, o.order_no, o.created_at, o.customer_name, o.sales_name, o.status, o.order_type,
    coalesce(oic.cost_factor_percent, 100),
    oi.product_id, p.code, coalesce(p.name, oi.description),
    oi.quantity, oi.unit_price,
    oi.quantity * oi.unit_price,
    oi.quantity * coalesce(oic.unit_cost, 0),
    oi.quantity * coalesce(oic.normal_selling_price, 0)
  from orders o
  join order_items oi on oi.order_id = o.id
  left join order_item_costs oic on oic.order_item_id = oi.id
  left join products p on p.id = oi.product_id
  where (p_from is null or o.created_at >= p_from::timestamptz)
    and (p_to is null or o.created_at < (p_to::timestamptz + interval '1 day'))
  order by o.created_at desc, oi.sort_order;
end;
$$ language plpgsql stable security definer set search_path = public;

grant execute on function margin_order_report(date, date) to authenticated;

-- ============================================================================
-- ===== ยุบช่องทางที่มาของลีดให้เป็นค่ามาตรฐาน =====
-- ============================================================================
-- ค่าที่เข้ามาจริงเขียนไม่เหมือนกัน (LINE / Line / LINE? / WEB SEARCH / WEB RESEARCH) เพราะ source
-- มาจาก query param ของลิงก์ฟอร์ม ทำให้การ์ดสรุปในหน้า "ผู้ติดต่อ" แตกเป็นหลายใบทั้งที่ความหมายเดียวกัน
-- ต่อจากนี้ฝั่งแอปยุบให้ตอนบันทึกแล้ว (ดู normalizeLeadSource ใน src/lib/leadOptions.js) บล็อกนี้แก้ข้อมูลเก่า
-- "Web Research" (เซลล์ไปหาเจอจากเว็บ) ไม่ได้ยุบรวมกับ "เว็บไซต์" (ลูกค้าเข้ามาจากเว็บเราเอง) เพราะคนละความหมาย

-- Web Research ใช้งานจริงอยู่แล้วแต่ยังไม่มีในตัวเลือก ทำให้ระบบมองว่าเป็นค่าที่ไม่รู้จัก
insert into picklists (list_key, value, sort_order) values ('lead_sources', 'Web Research', 8)
on conflict (list_key, value) do nothing;

update leads l
set source = m.canon
from (
  select id, regexp_replace(lower(btrim(source)), '[[:space:]?!.,_@/\\+()-]+', '', 'g') as k
  from leads where source is not null and btrim(source) <> ''
) n
join (values
  ('line', 'Line'), ('ไลน์', 'Line'), ('lineoa', 'Line'), ('lineat', 'Line'), ('lineofficial', 'Line'),
  ('facebook', 'Facebook'), ('fb', 'Facebook'), ('เฟสบุ๊ค', 'Facebook'), ('เฟสบุ๊ก', 'Facebook'), ('เฟซบุ๊ก', 'Facebook'),
  ('meta', 'Facebook'), ('messenger', 'Facebook'),
  ('webresearch', 'Web Research'), ('websearch', 'Web Research'), ('web', 'Web Research'),
  ('google', 'Web Research'), ('googlesearch', 'Web Research'), ('research', 'Web Research'),
  ('ค้นหาจากเว็บ', 'Web Research'), ('ค้นหาเว็บ', 'Web Research'),
  ('website', 'เว็บไซต์'), ('เว็บไซต์', 'เว็บไซต์'), ('เวบไซต์', 'เว็บไซต์'), ('เว็บไซท์', 'เว็บไซต์'), ('เว็บ', 'เว็บไซต์'),
  ('แนะนำโดยลูกค้าเดิม', 'แนะนำโดยลูกค้าเดิม'), ('แนะนำ', 'แนะนำโดยลูกค้าเดิม'), ('referral', 'แนะนำโดยลูกค้าเดิม'), ('refer', 'แนะนำโดยลูกค้าเดิม'),
  ('งานอีเวนต์ออกบูธ', 'งานอีเวนต์/ออกบูธ'), ('อีเวนต์', 'งานอีเวนต์/ออกบูธ'), ('ออกบูธ', 'งานอีเวนต์/ออกบูธ'),
  ('event', 'งานอีเวนต์/ออกบูธ'), ('exhibition', 'งานอีเวนต์/ออกบูธ'),
  ('โทรเข้ามาเอง', 'โทรเข้ามาเอง'), ('โทรเข้า', 'โทรเข้ามาเอง'), ('walkin', 'โทรเข้ามาเอง'), ('inbound', 'โทรเข้ามาเอง'), ('โทรศัพท์', 'โทรเข้ามาเอง'),
  ('อื่นๆ', 'อื่นๆ'), ('other', 'อื่นๆ'), ('others', 'อื่นๆ')
) as m(k, canon) on m.k = n.k
where l.id = n.id and l.source is distinct from m.canon;

-- ที่มาของบริษัทลูกค้า (companies.lead_source) ใช้ตัวเลือกชุดเดียวกัน ยุบให้ตรงกันไปด้วย
update companies c
set lead_source = m.canon
from (
  select id, regexp_replace(lower(btrim(lead_source)), '[[:space:]?!.,_@/\\+()-]+', '', 'g') as k
  from companies where lead_source is not null and btrim(lead_source) <> ''
) n
join (values
  ('line', 'Line'), ('ไลน์', 'Line'), ('lineoa', 'Line'),
  ('facebook', 'Facebook'), ('fb', 'Facebook'),
  ('webresearch', 'Web Research'), ('websearch', 'Web Research'), ('google', 'Web Research'),
  ('website', 'เว็บไซต์'), ('เว็บไซต์', 'เว็บไซต์'), ('เวบไซต์', 'เว็บไซต์')
) as m(k, canon) on m.k = n.k
where c.id = n.id and c.lead_source is distinct from m.canon;

-- ============================================================================
-- ===== ตารางโครงสร้างราคาสำหรับเซลล์ =====
-- ============================================================================
-- เซลล์อ่านตาราง product_price_tiers ตรงๆ ไม่ได้ (RLS เปิดเฉพาะบัญชี/แอดมิน)
-- ฟังก์ชันนี้แปลงขั้นบันไดเป็น "ราคาต่อชิ้น" ให้ดูได้ทั้งตารางโดยไม่ต้องกดคำนวณทีละครั้ง
-- ปลอดภัยเพราะทุกตัวเลขมาจาก ราคาขายปกติ × ส่วนลด — ไม่มีอะไรที่ย้อนกลับไปหาต้นทุนได้
create or replace function margin_product_price_structure(p_product_id uuid)
returns json as $$
declare
  v_normal  numeric;
  v_special numeric;
  v_rows    json;
begin
  select normal_selling_price,
         coalesce(special_discount_percent, margin_setting_num('special_discount_percent', 15))
    into v_normal, v_special
  from product_costs where product_id = p_product_id;
  if not found then return null; end if;

  -- max_qty มาจาก min_qty ของขั้นถัดไป ลบหนึ่ง — ขั้นสุดท้ายเป็น null แปลว่า "ขึ้นไป"
  select coalesce(json_agg(x order by x.min_qty), '[]'::json) into v_rows
  from (
    select
      t.min_qty,
      lead(t.min_qty) over (order by t.min_qty) - 1 as max_qty,
      coalesce(t.max_discount_percent, 0) as discount_percent,
      case when coalesce(v_normal, 0) > 0
           then round(v_normal * (1 - coalesce(t.max_discount_percent, 0) / 100), 2) end as unit_price,
      t.note
    from product_price_tiers t
    where t.product_id = p_product_id
  ) x;

  return json_build_object(
    'normal_selling_price',     v_normal,
    'special_discount_percent', v_special,
    'special_price', case when coalesce(v_normal, 0) > 0
                          then round(v_normal * (1 - v_special / 100), 2) end,
    'tiers', v_rows
  );
end;
$$ language plpgsql stable security definer set search_path = public;

grant execute on function margin_product_price_structure(uuid) to authenticated;


-- =====================================================================
-- ===== แคตตาล็อกออนไลน์ (Image Catalog Gallery) =====
-- ระบบโชว์รูป Artwork ที่กราฟิกทำมาแล้ว แล้วได้ลิงก์ส่งลูกค้าทาง LINE/Facebook
-- ไม่ใช่ระบบสินค้า — ไม่มี SKU/ราคา/สต็อก เพราะข้อมูลทั้งหมดอยู่ในรูปแล้ว
--
-- หน้าลูกค้า (/catalog/:slug) ไม่ต้อง login แต่ "ไม่ได้" เปิด RLS ให้ anon
-- อ่านผ่าน Netlify Function (service role key) เหมือนฟอร์มลีดสาธารณะ
-- ฟังก์ชันเป็นคนเลือกว่าคอลัมน์ไหนออกไปข้างนอกได้บ้าง ข้อมูลภายในจึงรั่วไม่ได้
-- =====================================================================

create table if not exists catalogs (
  id              uuid primary key default gen_random_uuid(),
  catalog_name    text not null,
  catalog_slug    text unique not null,
  description     text,
  cover_image_url text,
  status          text not null default 'draft',   -- draft | published | hidden | archived
  contact_name    text,
  contact_line    text,
  contact_phone   text,
  contact_email   text,
  created_by      uuid references auth.users(id),
  created_by_name text,
  created_at      timestamptz default now(),
  updated_by      uuid references auth.users(id),
  updated_by_name text,
  updated_at      timestamptz default now()
);

-- slug ไปอยู่บน URL จริง จึงบังคับรูปแบบที่ฐานข้อมูลเลย ไม่ปล่อยให้ฝั่ง client เป็นคนกันอย่างเดียว
-- (ตัวเล็ก/ตัวเลข/ขีดกลาง ห้ามขึ้นหรือลงท้ายด้วยขีด ห้ามขีดติดกัน)
do $$ begin
  alter table catalogs add constraint catalogs_slug_format
    check (catalog_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table catalogs add constraint catalogs_status_valid
    check (status in ('draft', 'published', 'hidden', 'archived'));
exception when duplicate_object then null; end $$;

create table if not exists catalog_images (
  id            uuid primary key default gen_random_uuid(),
  catalog_id    uuid not null references catalogs(id) on delete cascade,
  image_name    text,
  image_url     text not null,
  storage_path  text,
  caption       text,
  display_order integer not null default 0,
  is_visible    boolean not null default true,
  is_cover      boolean not null default false,
  -- ลบแบบ soft delete — รูปที่เคยส่งลิงก์ให้ลูกค้าไปแล้วยังตามดูได้ว่าเคยมีอะไรอยู่
  is_deleted    boolean not null default false,
  uploaded_by   uuid references auth.users(id),
  uploaded_at   timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists catalog_images_catalog_idx on catalog_images(catalog_id, display_order);

-- ปกได้แค่รูปเดียวต่อแคตตาล็อก บังคับที่ฐานข้อมูล ไม่ใช่แค่ที่ปุ่มบนหน้าจอ
create unique index if not exists catalog_images_one_cover
  on catalog_images(catalog_id) where is_cover and not is_deleted;

-- นับยอดเปิดดูแยกตามช่องทางที่เซลล์ส่งลิงก์ไป (?src=line / facebook / website / email / other)
create table if not exists catalog_view_logs (
  id           uuid primary key default gen_random_uuid(),
  catalog_id   uuid references catalogs(id) on delete cascade,
  catalog_slug text,
  source       text,
  referrer     text,
  user_agent   text,
  viewed_at    timestamptz default now()
);
create index if not exists catalog_view_logs_catalog_idx on catalog_view_logs(catalog_id, viewed_at desc);

drop trigger if exists trg_catalogs_updated on catalogs;
create trigger trg_catalogs_updated before update on catalogs
  for each row execute function set_updated_at();

drop trigger if exists trg_catalog_images_updated on catalog_images;
create trigger trg_catalog_images_updated before update on catalog_images
  for each row execute function set_updated_at();

drop trigger if exists trg_catalogs_created_by on catalogs;
create trigger trg_catalogs_created_by before insert on catalogs
  for each row execute function set_created_by();

-- ใครจัดการแคตตาล็อกได้: แอดมิน กับ เซลล์ (ทุก role ที่ไม่ใช่ finance)
-- ต้องเช็ค authenticated ด้วยเสมอ — "not is_finance()" เฉยๆ เป็นจริงกับคนที่ยังไม่ login ด้วย
create or replace function catalog_can_manage() returns boolean as $$
  select auth.role() = 'authenticated' and (is_admin() or not is_finance());
$$ language sql security definer stable set search_path = public;

grant execute on function catalog_can_manage() to authenticated;

-- ตั้งรูปปก — ต้องล้างปกเดิมกับตั้งปกใหม่ในทีเดียว ไม่งั้นชน unique index ระหว่างทาง
-- และ sync cover_image_url ที่ตาราง catalogs ไปด้วย หน้า list กับ OG preview จะได้ไม่ต้อง join
create or replace function catalog_set_cover(p_image_id uuid) returns void as $$
declare
  v_catalog uuid;
  v_url     text;
begin
  -- security definer = ข้าม RLS ต้องเช็คสิทธิ์เองตรงนี้ ไม่งั้นฝ่ายบัญชีก็เรียกได้
  if not catalog_can_manage() then raise exception 'ไม่มีสิทธิ์แก้ไขแคตตาล็อก'; end if;

  select catalog_id, image_url into v_catalog, v_url
  from catalog_images where id = p_image_id and not is_deleted;
  if not found then raise exception 'ไม่พบรูปนี้'; end if;

  update catalog_images set is_cover = false where catalog_id = v_catalog and is_cover;
  update catalog_images set is_cover = true  where id = p_image_id;
  update catalogs set cover_image_url = v_url, updated_by = auth.uid() where id = v_catalog;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function catalog_set_cover(uuid) to authenticated;

-- เขียนลำดับรูปใหม่ทั้งชุดในทีเดียว — รับ array ของ id เรียงตามที่อยากให้แสดง
-- ทำทั้งชุดแทนการสลับทีละคู่ เพราะได้ลำดับที่ 0..n-1 เสมอ ต่อให้ข้อมูลเดิมเลขซ้ำหรือมีช่องว่าง
-- และเป็น atomic — กดปุ่มขึ้น/ลงรัวๆ แล้วลำดับไม่เพี้ยนกลางคัน
create or replace function catalog_reorder_images(p_catalog uuid, p_ids uuid[]) returns void as $$
begin
  if not catalog_can_manage() then raise exception 'ไม่มีสิทธิ์แก้ไขแคตตาล็อก'; end if;

  update catalog_images ci
     set display_order = pos.ord
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as ord) pos
   where ci.id = pos.id and ci.catalog_id = p_catalog;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function catalog_reorder_images(uuid, uuid[]) to authenticated;

-- ===== Storage bucket สำหรับรูปแคตตาล็อก =====
-- public เหมือน "product-images" เพราะลูกค้าต้องเปิดรูปได้ตรงๆ จาก <img> โดยไม่ login
-- และไม่ใช่ข้อมูลลับ — เป็น Artwork ที่ตั้งใจส่งออกไปข้างนอกอยู่แล้ว
insert into storage.buckets (id, name, public)
values ('catalog-images', 'catalog-images', true)
on conflict (id) do nothing;

drop policy if exists "catalog-images: public read" on storage.objects;
create policy "catalog-images: public read" on storage.objects
  for select using (bucket_id = 'catalog-images');

-- อัปโหลด/ลบได้เฉพาะแอดมินกับเซลล์ — ฝ่ายบัญชีไม่เกี่ยวกับงานแคตตาล็อก
drop policy if exists "catalog-images: sales upload" on storage.objects;
create policy "catalog-images: sales upload" on storage.objects
  for insert with check (bucket_id = 'catalog-images' and catalog_can_manage());

drop policy if exists "catalog-images: sales delete" on storage.objects;
create policy "catalog-images: sales delete" on storage.objects
  for delete using (bucket_id = 'catalog-images' and catalog_can_manage());

-- ===== RLS =====
alter table catalogs         enable row level security;
alter table catalog_images   enable row level security;
alter table catalog_view_logs enable row level security;

-- คนใน CRM ที่ login แล้วเห็นแคตตาล็อกได้ทุกอัน (เป็นสื่อการตลาดร่วม ยิ่งใช้ซ้ำยิ่งดี)
-- แต่ "แก้/ลบ" ทำได้เฉพาะแอดมินกับเซลล์ ฝ่ายบัญชีดูได้อย่างเดียว
drop policy if exists "catalogs read" on catalogs;
create policy "catalogs read" on catalogs for select using (auth.role() = 'authenticated');

drop policy if exists "catalogs write" on catalogs;
create policy "catalogs write" on catalogs for insert with check (catalog_can_manage());

drop policy if exists "catalogs update" on catalogs;
create policy "catalogs update" on catalogs for update
  using (catalog_can_manage()) with check (catalog_can_manage());

-- ลบทั้งแคตตาล็อกได้เฉพาะเจ้าของกับแอดมิน (เหมือน adminOnlyDelete ของข้อมูลอื่น แต่ผ่อนให้เจ้าของลบของตัวเองได้)
drop policy if exists "catalogs delete" on catalogs;
create policy "catalogs delete" on catalogs for delete
  using (is_admin() or (catalog_can_manage() and created_by = auth.uid()));

drop policy if exists "catalog_images read" on catalog_images;
create policy "catalog_images read" on catalog_images for select using (auth.role() = 'authenticated');

drop policy if exists "catalog_images write" on catalog_images;
create policy "catalog_images write" on catalog_images for all
  using (catalog_can_manage()) with check (catalog_can_manage());

-- ยอดเข้าชม: อ่านได้ทุกคนที่ login (เอาไปโชว์ในหน้า list) แต่ไม่มี policy insert เลย
-- เขียนได้ทางเดียวคือ Netlify Function ที่ใช้ service role key ซึ่ง bypass RLS
-- ป้องกันคนนอกยิงตัวเลขยอดวิวปลอมเข้าระบบ
drop policy if exists "catalog_view_logs read" on catalog_view_logs;
create policy "catalog_view_logs read" on catalog_view_logs for select using (auth.role() = 'authenticated');

-- รายงานยอดเปิดดูรายเดือน — ไว้ดูว่าลูกค้าเปิดแคตตาล็อกไหนเดือนไหนกี่ครั้ง
-- นับเดือนตามเวลาไทย ไม่ใช่ UTC ไม่งั้นยอดของวันที่ 1 ตอนเช้าจะไปตกเดือนก่อนหน้า
-- ไม่ใช่ security definer — ให้ RLS ของ catalog_view_logs ทำงานตามปกติ (คนที่ login แล้วอ่านได้)
create or replace function catalog_view_report(p_from date, p_to date)
returns table (catalog_id uuid, catalog_name text, month text, views bigint) as $$
  select v.catalog_id,
         coalesce(c.catalog_name, v.catalog_slug) as catalog_name,
         to_char(v.viewed_at at time zone 'Asia/Bangkok', 'YYYY-MM') as month,
         count(*) as views
    from catalog_view_logs v
    left join catalogs c on c.id = v.catalog_id
   where (v.viewed_at at time zone 'Asia/Bangkok')::date >= p_from
     and (v.viewed_at at time zone 'Asia/Bangkok')::date <= p_to
   group by v.catalog_id, coalesce(c.catalog_name, v.catalog_slug),
            to_char(v.viewed_at at time zone 'Asia/Bangkok', 'YYYY-MM')
   order by month desc, views desc;
$$ language sql stable set search_path = public;

grant execute on function catalog_view_report(date, date) to authenticated;

-- ===== ปุ่มติดต่อของแคตตาล็อก (เลิกใช้แล้ว) =====
-- ทีมตัดสินใจไม่เอาปุ่มติดต่อบนหน้าลูกค้า โค้ดฝั่งแอปถอดออกหมดแล้ว ไม่มีอะไรอ่าน/เขียนตารางนี้อีก
-- คงตารางไว้เฉยๆ ไม่ได้ drop ทิ้ง เพราะการลบตารางย้อนกลับไม่ได้ ถ้าแน่ใจว่าไม่ใช้แล้วจริงค่อยลบทีหลัง
--
-- ตั้งใจไม่ฟิกว่าต้องเป็น LINE/เบอร์/อีเมล — ทีมออกแบบปุ่มเองได้ทั้งข้อความ ปลายทาง สี และรูป
-- วันที่เปลี่ยนช่องทาง (ย้าย LINE OA, เปลี่ยนเบอร์, เพิ่ม TikTok) จะได้แก้ในหน้าจอ ไม่ต้องแก้โค้ด
--
-- catalog_id เป็น null ได้ = "ชุดกลาง" ใช้กับทุกแคตตาล็อกที่ไม่ได้ตั้งปุ่มของตัวเอง
-- แคตตาล็อกไหนตั้งปุ่มเอง จะใช้ชุดของตัวเองแทนชุดกลางทั้งชุด (ไม่ผสมกัน เพราะผสมแล้วเดายาก)
create table if not exists catalog_buttons (
  id            uuid primary key default gen_random_uuid(),
  catalog_id    uuid references catalogs(id) on delete cascade,
  label         text not null,
  kind          text not null default 'link',   -- link | phone | email | image
  url           text,                            -- link: URL / phone: เบอร์ / email: อีเมล / image: ลิงก์ตอนกด (ไม่ใส่ก็ได้)
  image_url     text,                            -- kind = image เช่น QR code ของ LINE
  image_path    text,
  bg_color      text not null default '#1B76FF',
  text_color    text not null default '#FFFFFF',
  display_order integer not null default 0,
  is_visible    boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists catalog_buttons_catalog_idx on catalog_buttons(catalog_id, display_order);

do $$ begin
  alter table catalog_buttons add constraint catalog_buttons_kind_valid
    check (kind in ('link', 'phone', 'email', 'image'));
exception when duplicate_object then null; end $$;

drop trigger if exists trg_catalog_buttons_updated on catalog_buttons;
create trigger trg_catalog_buttons_updated before update on catalog_buttons
  for each row execute function set_updated_at();

alter table catalog_buttons enable row level security;

drop policy if exists "catalog_buttons read" on catalog_buttons;
create policy "catalog_buttons read" on catalog_buttons for select using (auth.role() = 'authenticated');

drop policy if exists "catalog_buttons write" on catalog_buttons;
create policy "catalog_buttons write" on catalog_buttons for all
  using (catalog_can_manage()) with check (catalog_can_manage());

-- เขียนลำดับปุ่มใหม่ทั้งชุด — เหมือน catalog_reorder_images แต่รับชุดกลาง (catalog_id เป็น null) ได้ด้วย
create or replace function catalog_reorder_buttons(p_ids uuid[]) returns void as $$
begin
  if not catalog_can_manage() then raise exception 'ไม่มีสิทธิ์แก้ไขแคตตาล็อก'; end if;

  update catalog_buttons b
     set display_order = pos.ord
    from (select unnest(p_ids) as id, generate_subscripts(p_ids, 1) as ord) pos
   where b.id = pos.id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function catalog_reorder_buttons(uuid[]) to authenticated;

-- ===== ปกหลังแคตตาล็อก (หน้าสุดท้ายที่ลูกค้าทิ้งเบอร์ไว้ได้) =====
-- ฟอร์มบนปกหลังส่งผ่าน Netlify Function ตัวเดียวกับฟอร์มลีดสาธารณะ (submit-lead)
-- ลีดจึงไปโผล่ที่หน้า "ผู้ติดต่อ" เหมือนลีดจากช่องทางอื่นทุกประการ
-- ที่มาใช้ค่ามาตรฐาน "แคตตาล็อกออนไลน์" ส่วนชื่อเล่มไปอยู่ในช่องข้อความ
-- ถ้าเอาชื่อเล่มไปใส่ช่องที่มาตรงๆ หน้าผู้ติดต่อจะขึ้นแดงว่าช่องทางไม่ถูกต้อง
insert into lead_sources (name) values ('แคตตาล็อกออนไลน์') on conflict (name) do nothing;
insert into picklists (list_key, value, sort_order) values ('lead_sources', 'แคตตาล็อกออนไลน์', 9)
on conflict (list_key, value) do nothing;

-- ข้อความและช่องทางติดต่อบนปกหลัง เก็บเป็น setting กลาง ใช้กับทุกแคตตาล็อก
-- ตั้งครั้งเดียวแก้ที่เดียว วันเปลี่ยน LINE OA หรือเปลี่ยนเบอร์ไม่ต้องแก้โค้ดและไม่ต้องไล่แก้ทีละเล่ม
insert into settings (key, value) values
  ('catalog_backcover_enabled', '1'),
  ('catalog_backcover_heading', 'สนใจรุ่นไหน ให้ทีมขายติดต่อกลับได้เลย'),
  ('catalog_backcover_note',    'กรอกชื่อกับเบอร์ไว้ ทีมขายติดต่อกลับในเวลาทำการ'),
  ('catalog_backcover_line',    ''),
  ('catalog_backcover_phone',   '')
on conflict (key) do nothing;

-- ตัวเลือกหน้าตาปกหลังที่ปรับได้จากหน้าจอ (ขนาดโลโก้ / ข้อความบนปุ่ม / จะมีช่อง "สนใจสินค้าอะไร" ไหม)
-- จงใจให้ขนาดโลโก้เป็นชุดที่เลือก ไม่ใช่ช่องกรอกตัวเลข — ทุกค่าในชุดผ่านตาแล้วว่าไม่ล้นและไม่เล็กจนอ่านไม่ออก
insert into settings (key, value) values
  ('catalog_backcover_logo',     'md'),
  ('catalog_backcover_button',   'ให้ทีมขายติดต่อกลับ'),
  ('catalog_backcover_interest', '1')
on conflict (key) do nothing;

-- ===== ปกหลัง: เก็บทั้งชุดเป็น JSON ก้อนเดียว =====
-- เดิมแตกเป็น setting ทีละคีย์ พอต้องรองรับ "ตั้งเฉพาะเล่มนี้" ด้วยเลยเก็บเป็นก้อน
-- ก้อนเดียวทำให้ทับทั้งชุดได้ตรงไปตรงมา ไม่ต้องไล่ว่าคีย์ไหนทับคีย์ไหน
-- catalogs.back_cover เป็น null = ใช้ค่ากลาง / ไม่ null = เล่มนั้นใช้ชุดของตัวเอง
alter table catalogs add column if not exists back_cover jsonb;

-- ย้ายค่าที่เคยกรอกไว้ในคีย์แยกมาเป็นก้อนเดียว ทำครั้งเดียวตอนยังไม่มีคีย์ใหม่
-- (ถ้าไม่ย้าย ลิงก์ LINE กับข้อความที่ทีมกรอกไปแล้วจะหายไปเฉยๆ)
insert into settings (key, value)
select 'catalog_backcover', json_build_object(
  'enabled',      coalesce((select value from settings where key = 'catalog_backcover_enabled'), '1') = '1',
  'heading',      coalesce(nullif((select value from settings where key = 'catalog_backcover_heading'), ''), 'สนใจรุ่นไหน ให้ทีมขายติดต่อกลับได้เลย'),
  'note',         coalesce((select value from settings where key = 'catalog_backcover_note'), 'กรอกชื่อกับเบอร์ไว้ ทีมขายติดต่อกลับในเวลาทำการ'),
  'button',       coalesce(nullif((select value from settings where key = 'catalog_backcover_button'), ''), 'ให้ทีมขายติดต่อกลับ'),
  'line',         coalesce((select value from settings where key = 'catalog_backcover_line'), ''),
  'phone',        coalesce((select value from settings where key = 'catalog_backcover_phone'), ''),
  'logo',         coalesce(nullif((select value from settings where key = 'catalog_backcover_logo'), ''), 'md'),
  'showInterest', coalesce((select value from settings where key = 'catalog_backcover_interest'), '1') <> '0'
)::text
where not exists (select 1 from settings where key = 'catalog_backcover');

-- คีย์แบบแยกไม่ได้ใช้แล้ว ลบทิ้งได้เพราะย้ายค่าขึ้นไปข้างบนเรียบร้อยแล้ว
delete from settings where key in (
  'catalog_backcover_enabled', 'catalog_backcover_heading', 'catalog_backcover_note',
  'catalog_backcover_line', 'catalog_backcover_phone',
  'catalog_backcover_logo', 'catalog_backcover_button', 'catalog_backcover_interest'
);
