-- =========================================================
-- MASTER SAAS DATABASE v2 — Complete Schema
-- RNF SaaS Bot Telegram
-- Date: 2026-04-17
-- 
-- MIGRATION dari v1:
-- Jalankan di Supabase SQL Editor pada project MASTER:
-- https://ynorqtlefiskahvyykzl.supabase.co
-- 
-- PERUBAHAN dari v1:
-- ✅ Tambah tabel: plans, tenant_api_keys, telegram_users, miniapp_sessions, audit_logs
-- ✅ Tambah kolom: tenants.metadata, tenants.updated_at, tenants.bot_token (sudah ada)
-- ✅ Update enum tenant_status (tambah BANNED)
-- ✅ Tambah relasi subscriptions → plans
-- ✅ Tambah RLS policies (deny all — semua akses via service_role)
-- ✅ Tambah default plans data
-- =========================================================

BEGIN;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================================================
-- ENUMS (Safe idempotent creation)
-- =========================================================

-- Buat enum baru jika belum ada, atau tambah value
DO $$ BEGIN
  CREATE TYPE public.tenant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'BANNED');
EXCEPTION WHEN duplicate_object THEN 
  -- Enum sudah ada, coba tambah value baru
  BEGIN ALTER TYPE public.tenant_status ADD VALUE IF NOT EXISTS 'BANNED'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Reuse subscription_status yang sudah ada
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('ACTIVE', 'EXPIRED', 'TRIAL', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reuse invoice_status yang sudah ada
DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- Helper: updated_at trigger (idempotent)
-- =========================================================
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

-- =========================================================
-- 1) PLANS (Paket Langganan) — BARU
-- =========================================================
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  price INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  features JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS plans_set_updated_at ON public.plans;
CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON public.plans
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 2) TENANTS — UPDATE dari v1 (tambah kolom baru)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  bot_id BIGINT PRIMARY KEY,
  username TEXT,
  shop_name TEXT NOT NULL,
  owner_chat_id BIGINT NOT NULL,
  bot_token TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  db_url TEXT,
  db_anon_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tambah kolom baru jika belum ada (safe migration)
DO $$ BEGIN
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS bot_token TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP TRIGGER IF EXISTS tenants_set_updated_at ON public.tenants;
CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_tenants_owner ON public.tenants(owner_chat_id);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 3) TENANT_CONFIGS — Sudah ada, pastikan trigger
-- =========================================================
CREATE TABLE IF NOT EXISTS public.tenant_configs (
  bot_id BIGINT PRIMARY KEY REFERENCES public.tenants(bot_id) ON DELETE CASCADE,
  supabase_url TEXT NOT NULL,
  supabase_anon_key TEXT NOT NULL,
  supabase_service_key TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS tenant_configs_set_updated_at ON public.tenant_configs;
CREATE TRIGGER tenant_configs_set_updated_at BEFORE UPDATE ON public.tenant_configs
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 4) TENANT_API_KEYS — BARU (future: per-tenant auth)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.tenant_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id BIGINT NOT NULL REFERENCES public.tenants(bot_id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT 'default',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_bot ON public.tenant_api_keys(bot_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.tenant_api_keys(key_hash);
ALTER TABLE public.tenant_api_keys ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 5) SUBSCRIPTIONS — UPDATE dari v1 (tambah relasi plans)
-- =========================================================
-- Cek apakah tabel lama sudah ada
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'subscriptions' AND column_name = 'id') THEN
    -- Tabel lama: bot_id is PK, format berbeda. Migrasi ke format baru.
    -- Tambah kolom id jika belum ada
    ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
  END IF;
END $$;

-- Tambah kolom baru ke subscriptions
DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'TRIAL';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_subscriptions_bot ON public.subscriptions(bot_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expiry ON public.subscriptions(expiry_date);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 6) TELEGRAM_USERS — BARU (Global users dari Mini App)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.telegram_users (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT DEFAULT 'id',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS telegram_users_set_updated_at ON public.telegram_users;
CREATE TRIGGER telegram_users_set_updated_at BEFORE UPDATE ON public.telegram_users
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 7) MINIAPP_SESSIONS — BARU (Web App Sessions)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.miniapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES public.telegram_users(telegram_id) ON DELETE CASCADE,
  bot_id BIGINT NOT NULL REFERENCES public.tenants(bot_id) ON DELETE CASCADE,
  init_data_hash TEXT NOT NULL,
  device_info JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_sessions_telegram ON public.miniapp_sessions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_sessions_bot ON public.miniapp_sessions(bot_id);
CREATE INDEX IF NOT EXISTS idx_sessions_hash ON public.miniapp_sessions(init_data_hash);
ALTER TABLE public.miniapp_sessions ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 8) RENTAL_INVOICES — UPDATE dari v1 (tambah plan_id + QRIS tracking)
-- =========================================================
DO $$ BEGIN
  ALTER TABLE public.rental_invoices ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.plans(id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.rental_invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- v3: QRIS message tracking for centralized webhook relay
-- Stores Telegram chat/message IDs so Gateway can instruct tenant bot to delete QRIS after payment
DO $$ BEGIN
  ALTER TABLE public.rental_invoices ADD COLUMN IF NOT EXISTS qris_chat_id BIGINT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.rental_invoices ADD COLUMN IF NOT EXISTS qris_message_id BIGINT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- v4: Notification delivery tracking for retriable webhook delivery
DO $$ BEGIN
  ALTER TABLE public.rental_invoices ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.rental_invoices ADD COLUMN IF NOT EXISTS qris_deleted BOOLEAN NOT NULL DEFAULT FALSE;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DROP TRIGGER IF EXISTS rental_invoices_set_updated_at ON public.rental_invoices;
CREATE TRIGGER rental_invoices_set_updated_at BEFORE UPDATE ON public.rental_invoices
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_invoices_bot ON public.rental_invoices(bot_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.rental_invoices(status);
ALTER TABLE public.rental_invoices ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 9) AUDIT_LOGS — BARU
-- =========================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id BIGINT REFERENCES public.tenants(bot_id) ON DELETE SET NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_bot ON public.audit_logs(bot_id, created_at DESC);
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- RLS POLICIES — Deny All for anon/authenticated
-- service_role BYPASSES all RLS by default.
-- =========================================================

-- Drop existing policies first (safe re-run)
DO $$ 
DECLARE
  tbl TEXT;
  pol TEXT;
BEGIN
  FOR tbl, pol IN 
    SELECT schemaname || '.' || tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN ('tenants', 'tenant_configs', 'tenant_api_keys', 
                      'plans', 'subscriptions', 'telegram_users', 
                      'miniapp_sessions', 'rental_invoices', 'audit_logs')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol, tbl);
  END LOOP;
END $$;

-- All tables: deny everything for non-service_role
CREATE POLICY "deny_all" ON public.tenants FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.tenant_configs FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.tenant_api_keys FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.subscriptions FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.telegram_users FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.miniapp_sessions FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.rental_invoices FOR ALL USING (false);
CREATE POLICY "deny_all" ON public.audit_logs FOR ALL USING (false);

-- Plans: public read (so pricing page can show plans)
CREATE POLICY "plans_public_read" ON public.plans FOR SELECT USING (is_active = true);
CREATE POLICY "plans_deny_write" ON public.plans FOR INSERT WITH CHECK (false);
CREATE POLICY "plans_deny_update" ON public.plans FOR UPDATE USING (false);
CREATE POLICY "plans_deny_delete" ON public.plans FOR DELETE USING (false);

-- =========================================================
-- DEFAULT DATA
-- =========================================================

-- Default Plans
INSERT INTO public.plans (name, price, duration_days, features, sort_order)
VALUES
  ('Trial', 0, 1, '{"max_products": 5, "max_variants": 10, "web_app": true}', 1),
  ('Premium', 10000, 31, '{"max_products": 100, "max_variants": 500, "web_app": true}', 2),
  ('Enterprise', 50000, 31, '{"max_products": -1, "max_variants": -1, "web_app": true, "priority_support": true}', 3)
ON CONFLICT (name) DO NOTHING;

-- =========================================================
-- RPC: Cleanup expired sessions (jalankan via cron)
-- =========================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.miniapp_sessions
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

-- =========================================================
-- RPC: Cleanup old audit logs (>24 hours)
-- =========================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Hapus log yang umurnya lebih dari 24 jam (1 hari)
  DELETE FROM public.audit_logs
  WHERE created_at < (NOW() - INTERVAL '24 hours');
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END $$;

-- =========================================================
-- RPC: Get dashboard stats for admin
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_master_stats()
RETURNS JSON
LANGUAGE plpgsql AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_tenants', (SELECT COUNT(*) FROM public.tenants),
    'active_tenants', (SELECT COUNT(*) FROM public.tenants WHERE status = 'ACTIVE'),
    'expired_tenants', (
      SELECT COUNT(*) FROM public.subscriptions s
      JOIN public.tenants t ON t.bot_id = s.bot_id
      WHERE s.expiry_date < NOW()
    ),
    'expiring_soon', (
      SELECT COUNT(*) FROM public.subscriptions
      WHERE expiry_date > NOW()
      AND expiry_date < NOW() + INTERVAL '3 days'
    ),
    'total_revenue', (
      SELECT COALESCE(SUM(amount), 0) FROM public.rental_invoices
      WHERE status = 'PAID'
    ),
    'total_sessions', (SELECT COUNT(*) FROM public.miniapp_sessions WHERE expires_at > NOW()),
    'total_telegram_users', (SELECT COUNT(*) FROM public.telegram_users)
  ) INTO result;
  
  RETURN result;
END $$;

-- =========================================================
-- 13) RPC: process_renewal_payment — Atomic Payment Finalization
-- =========================================================
-- All renewal finalization steps in 1 transaction:
--   invoice claim + subscription extend + tenant activate + audit log
-- If ANY step fails → full rollback → invoice stays PENDING → retry works.
-- On already_processed: returns full tenant data so webhook can retry notification.
CREATE OR REPLACE FUNCTION public.process_renewal_payment(
    p_invoice_id UUID,
    p_amount INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inv RECORD;
    v_existing_status TEXT;
    v_current_expiry TIMESTAMPTZ;
    v_duration_days INT := 31;
    v_base_date TIMESTAMPTZ;
    v_new_expiry TIMESTAMPTZ;
    v_bot_id BIGINT;
    v_tenant RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Step 1: Atomic claim with row-level lock (PENDING → PAID)
    UPDATE rental_invoices 
    SET status = 'PAID', paid_at = v_now
    WHERE id = p_invoice_id AND status = 'PENDING'
    RETURNING * INTO v_inv;

    IF NOT FOUND THEN
        SELECT ri.status INTO v_existing_status
        FROM rental_invoices ri WHERE ri.id = p_invoice_id;

        IF v_existing_status = 'PAID' THEN
            -- Return full data so webhook handler can retry notification/deletion
            RETURN (
                SELECT jsonb_build_object(
                    'status',             'already_processed',
                    'bot_id',             ri.bot_id,
                    'new_expiry',         s.expiry_date,
                    'duration_days',      COALESCE(pl.duration_days, 31),
                    'notification_sent',  ri.notification_sent,
                    'qris_deleted',       ri.qris_deleted,
                    'qris_chat_id',       ri.qris_chat_id,
                    'qris_message_id',    ri.qris_message_id,
                    'bot_token',          t.bot_token,
                    'owner_chat_id',      t.owner_chat_id,
                    'bot_api_base_url',   t.metadata->>'bot_api_base_url'
                )
                FROM rental_invoices ri
                LEFT JOIN tenants t ON t.bot_id = ri.bot_id
                LEFT JOIN subscriptions s ON s.bot_id = ri.bot_id
                LEFT JOIN plans pl ON pl.id = ri.plan_id
                WHERE ri.id = p_invoice_id
            );
        ELSIF v_existing_status IS NOT NULL THEN
            RETURN jsonb_build_object('status', 'invalid_status', 'current_status', v_existing_status);
        ELSE
            RETURN jsonb_build_object('status', 'not_found');
        END IF;
    END IF;

    v_bot_id := v_inv.bot_id;

    -- Step 2: Resolve plan duration
    IF v_inv.plan_id IS NOT NULL THEN
        SELECT p.duration_days INTO v_duration_days
        FROM plans p WHERE p.id = v_inv.plan_id;
        v_duration_days := COALESCE(v_duration_days, 31);
    END IF;

    -- Step 3: Calculate new expiry (extend from current if still active)
    SELECT s.expiry_date INTO v_current_expiry
    FROM subscriptions s WHERE s.bot_id = v_bot_id
    ORDER BY s.expiry_date DESC LIMIT 1;

    v_base_date := GREATEST(COALESCE(v_current_expiry, v_now), v_now);
    v_new_expiry := v_base_date + make_interval(days => v_duration_days);

    -- Step 4: Upsert subscription
    INSERT INTO subscriptions (bot_id, plan_id, expiry_date, status, last_payment_at)
    VALUES (v_bot_id, v_inv.plan_id, v_new_expiry, 'ACTIVE', v_now)
    ON CONFLICT (bot_id) DO UPDATE SET
        plan_id     = EXCLUDED.plan_id,
        expiry_date = EXCLUDED.expiry_date,
        status      = EXCLUDED.status,
        last_payment_at = EXCLUDED.last_payment_at;

    -- Step 5: Activate tenant
    UPDATE tenants SET status = 'ACTIVE' WHERE bot_id = v_bot_id;

    -- Step 6: Audit log
    INSERT INTO audit_logs (bot_id, actor, action, entity, entity_id, detail)
    VALUES (
        v_bot_id, 'system', 'PAYMENT_CONFIRMED', 'rental_invoices',
        p_invoice_id::TEXT,
        jsonb_build_object(
            'amount', p_amount,
            'new_expiry', v_new_expiry,
            'duration_days', v_duration_days,
            'source', 'centralized_webhook'
        )
    );

    -- Step 7: Fetch tenant info for notification
    SELECT t.bot_token, t.owner_chat_id, t.metadata
    INTO v_tenant
    FROM tenants t WHERE t.bot_id = v_bot_id;

    -- Return with notification_sent=false, qris_deleted=false (just finalized)
    RETURN jsonb_build_object(
        'status',             'success',
        'bot_id',             v_bot_id,
        'new_expiry',         v_new_expiry,
        'duration_days',      v_duration_days,
        'notification_sent',  FALSE,
        'qris_deleted',       FALSE,
        'qris_chat_id',       v_inv.qris_chat_id,
        'qris_message_id',    v_inv.qris_message_id,
        'bot_token',          v_tenant.bot_token,
        'owner_chat_id',      v_tenant.owner_chat_id,
        'bot_api_base_url',   v_tenant.metadata->>'bot_api_base_url'
    );
END;
$$;

-- =========================================================
-- SELESAI! Jalankan SQL ini di Supabase SQL Editor
-- Project: https://ynorqtlefiskahvyykzl.supabase.co
-- =========================================================
