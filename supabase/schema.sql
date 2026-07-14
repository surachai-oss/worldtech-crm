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

-- order_type = ประเภทออเดอร์ที่เซลล์เลือกก่อนรันเลข ('ปกติ' รันเป็น WT, 'Grade B' รันเป็น GB) — ดู gen_order_no() ด้านล่าง
alter table orders add column if not exists order_type text not null default 'ปกติ' check (order_type in ('ปกติ', 'Grade B'));

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
    new.value is distinct from old.value or
    new.company_tax_id is distinct from old.company_tax_id or
    new.company_address is distinct from old.company_address or
    new.company_phone is distinct from old.company_phone or
    new.company_email is distinct from old.company_email or
    new.remark is distinct from old.remark or
    new.order_type is distinct from old.order_type
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

drop policy if exists "activities all" on activities;
create policy "activities all" on activities for all using (
  exists (select 1 from companies c where c.id = activities.company_id
    and (is_admin() or c.created_by = auth.uid() or c.created_by is null))
) with check (
  exists (select 1 from companies c where c.id = activities.company_id
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
