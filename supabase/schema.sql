-- ============================================================
--  Worldtech B2B CRM — Supabase Schema
--  รันไฟล์นี้ใน Supabase SQL Editor (Project > SQL Editor > New query)
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

-- ===== Row Level Security =====
-- เปิด RLS แล้วอนุญาตให้ authenticated user อ่าน/เขียนได้ทุกตาราง
-- (ปรับ policy ให้ละเอียดขึ้นภายหลังได้ตามบทบาทผู้ใช้งาน)
alter table companies   enable row level security;
alter table contacts    enable row level security;
alter table activities  enable row level security;
alter table deals       enable row level security;
alter table tasks       enable row level security;
alter table quotations  enable row level security;
alter table settings    enable row level security;

create policy "allow all for authenticated" on companies
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow all for authenticated" on contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow all for authenticated" on activities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow all for authenticated" on deals
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow all for authenticated" on tasks
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow all for authenticated" on quotations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "allow all for authenticated" on settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
