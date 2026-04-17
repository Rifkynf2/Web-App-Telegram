-- =========================================================
-- MASTER SAAS DATABASE - Supabase SQL Schema (Pusat)
-- Created for: RNF SaaS Bot Telegram
-- Date: 2026-04-16
-- =========================================================

begin;

-- 1. Enums
do $$ begin
  create type public.subscription_status as enum ('ACTIVE', 'EXPIRED', 'TRIAL', 'SUSPENDED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');
exception when duplicate_object then null; end $$;

-- 2. Master Tenants
create table if not exists public.tenants (
  bot_id bigint primary key, -- Bot ID from Telegram
  username text,
  shop_name text not null,
  owner_chat_id bigint not null,
  bot_token text not null,
  status public.subscription_status not null default 'ACTIVE',
  db_url text,
  db_anon_key text,
  created_at timestamptz default now()
);

-- 3. Tenant Database Configs (Multi-tenant mapping)
create table if not exists public.tenant_configs (
  bot_id bigint primary key references public.tenants(bot_id) on delete cascade,
  supabase_url text not null,
  supabase_anon_key text not null,
  supabase_service_key text null,
  updated_at timestamptz default now()
);

-- 4. Subscriptions
create table if not exists public.subscriptions (
  bot_id bigint primary key references public.tenants(bot_id) on delete cascade,
  expiry_date timestamptz not null,
  plan_name text default 'Premium',
  last_payment_at timestamptz,
  is_auto_off boolean default true
);

-- 5. Rental Invoices (Pakasir)
create table if not exists public.rental_invoices (
  id uuid primary key default gen_random_uuid(),
  bot_id bigint not null references public.tenants(bot_id),
  amount integer not null,
  status public.invoice_status default 'PENDING',
  pakasir_id text,
  payment_link text,
  external_ref text unique,
  created_at timestamptz default now(),
  paid_at timestamptz
);

-- 6. Helper: updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tenant_configs_updated_at on public.tenant_configs;
create trigger tenant_configs_updated_at before update on public.tenant_configs
for each row execute function public.tg_set_updated_at();

-- 7. Security (RLS)
alter table public.tenants enable row level security;
alter table public.tenant_configs enable row level security;
alter table public.subscriptions enable row level security;
alter table public.rental_invoices enable row level security;

-- Disable RLS bypass for testing (optional, remove in production if needed)
-- create policy "Allow service_role full access" on public.tenants using (true);


commit;
