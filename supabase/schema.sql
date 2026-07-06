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
  file_url      text,
  note          text,
  created_at    timestamptz default now()
);

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

-- ===== PROFILES (ข้อมูลผู้ใช้งาน + สิทธิ์ Admin/Sale) =====
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'sale' check (role in ('admin', 'sale')),
  created_at  timestamptz default now()
);

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

-- ===== helper: is_admin() =====
create or replace function is_admin() returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable set search_path = public;

grant execute on function is_admin() to authenticated;

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
drop policy if exists "lead_sources select" on lead_sources;
create policy "lead_sources select" on lead_sources for select using (auth.role() = 'authenticated');
drop policy if exists "lead_sources write" on lead_sources;
create policy "lead_sources write" on lead_sources for all using (is_admin()) with check (is_admin());

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
