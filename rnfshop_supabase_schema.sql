-- ==============================================================================
-- DATABASE SCHEMA: RNF SHOP FINANCE DASHBOARD
-- ==============================================================================
-- Project Ref: bucnzoadbpcrbpkwzxqt (RNF Shop Dashboard)
-- Target: Supabase PostgreSQL
-- Maintainer: RNF System
-- Last Updated: 2026-09-16 (Migrated to Web App Super-Dashboard)
-- ==============================================================================

-- 1. Custom Types & Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE public.transaction_type AS ENUM ('incoming', 'outgoing');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Tables

-- Table: apps (Master Katalog Produk Digital)
CREATE TABLE IF NOT EXISTS public.apps (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NULL,
    updated_by UUID NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table: transactions (Pencatatan Keuangan Transaksi Toko)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trx_date DATE NOT NULL,
    trx_type public.transaction_type NOT NULL,
    app_id UUID NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    customer_name TEXT NOT NULL,
    note TEXT NULL,
    created_by UUID NULL,
    updated_by UUID NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table: allowed_emails (Legacy Whitelist - Diarsipkan)
CREATE TABLE IF NOT EXISTS public.allowed_emails (
    email TEXT PRIMARY KEY,
    role TEXT DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Row Level Security (RLS)
ALTER TABLE public.apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- 4. Hak Akses Schema & Tipe Data
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON TYPE public.transaction_type TO anon, authenticated, service_role;

-- 5. Hak Akses Tabel untuk Client (Anon & Authenticated)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apps TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO anon, authenticated, service_role;
GRANT SELECT ON public.allowed_emails TO anon, authenticated, service_role;

-- 6. RLS Policies: Direct Client-Side Access untuk Super-Dashboard
-- Memungkinkan Web App mengakses dan memanipulasi data tanpa backend proxy
DROP POLICY IF EXISTS "Allow anon all on apps" ON public.apps;
CREATE POLICY "Allow anon all on apps" ON public.apps
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon all on transactions" ON public.transactions;
CREATE POLICY "Allow anon all on transactions" ON public.transactions
    FOR ALL
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

-- 7. Views Pendukung (Optional)
CREATE OR REPLACE VIEW public.transactions_view AS
SELECT 
    t.id,
    t.trx_date,
    t.trx_type,
    t.app_id,
    a.name AS app_name,
    t.amount,
    t.customer_name,
    t.note,
    t.created_at,
    t.updated_at
FROM public.transactions t
LEFT JOIN public.apps a ON t.app_id = a.id;

GRANT SELECT ON public.transactions_view TO anon, authenticated, service_role;

-- View: rnf_apps_summary (Aggregasi Total Terjual Produk per Aplikasi)
CREATE OR REPLACE VIEW public.rnf_apps_summary
WITH (security_invoker = true)
AS
SELECT a.id,
    a.name,
    a.is_active,
    a.created_at,
    a.updated_at,
    COALESCE(count(t.id), 0::bigint)::integer AS sold_count
FROM public.apps a
LEFT JOIN public.transactions t ON a.id = t.app_id AND t.trx_type = 'incoming'::transaction_type
GROUP BY a.id, a.name, a.is_active, a.created_at, a.updated_at
ORDER BY a.name;

GRANT SELECT ON public.rnf_apps_summary TO anon, authenticated, service_role;
