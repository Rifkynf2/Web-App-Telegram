# Product Requirements Document (PRD)
# RNF SaaS Multi-Tenant Web App & API Gateway System

- **Version**: 2.0.0
- **Status**: Production / Active
- **System Architecture**: Multi-Tenant Telegram Mini App + Centralized Vercel API Gateway + Supabase Multi-DB
- **Date**: 2026-09-10
- **Maintainer**: RNF System

---

## 1. Executive Summary

### 1.1 Product Vision
**RNF SaaS Multi-Tenant Web App** adalah platform e-commerce dan manajemen operasional terintegrasi untuk ekosistem Telegram Bot dan WhatsApp Bot. Sistem ini memungkinkan pemilik toko digital (tenant) untuk menyediakan katalog belanja interaktif berbasis Telegram Mini App kepada para pembelinya, mengelola produk dan stok secara efisien, serta menyediakan sistem manajemen langganan (SaaS) terpusat dan rental grup bot WhatsApp bagi SaaS Superadmin.

### 1.2 Core Value Propositions
1. **Keamanan Transaksi Terisolasi**: Logika transaksi sensitif (pemotongan saldo, penerbitan QRIS transaksi toko, mutasi saldo) tetap berada di server bot tenant, mencegah eksploitasi browser/client-side.
2. **Kredensial Aman Multi-Tenant**: Kunci database `service_role` master tidak pernah terekspos ke browser; frontend hanya memperoleh `anon_key` dari API Gateway setelah verifikasi identitas.
3. **Pembaruan Otomatis & Atomic**: Perpanjangan masa sewa tenant via Xoftware Pay diproses secara *atomic* di database menggunakan PostgreSQL RPC (`process_renewal_payment`) dengan mekanisme rollback penuh bila terjadi kegagalan.
4. **Sinkronisasi Zona Waktu Presisi (WIB)**: Seluruh perhitungan jatuh tempo langganan diselaraskan ke tengah malam 00:00:00 WIB (Asia/Jakarta) dengan sinkronisasi otomatis harian via Vercel Cron.
5. **Dukungan Ganda (Telegram & WhatsApp)**: Master dashboard mengelola tidak hanya tenant bot Telegram tetapi juga manajemen sewa grup bot WhatsApp (`managed_groups`).

---

## 2. User Roles & Persona Matrix

| Role | Lokasi Akses | Akses & Otentikasi | Tanggung Jawab Utama |
|---|---|---|---|
| **SaaS Superadmin** | `/master` (`public/master-dashboard.html`) | Header `X-Admin-Secret` (`ADMIN_DASHBOARD_SECRET`) | Monitoring performa SaaS, pengelolaan tenant (suspend/activate/ban/delete/renew), pengelolaan rental grup WhatsApp, pengiriman notifikasi pengingat via Telegram Markdown & WA template, sinkronisasi expired manual. |
| **Tenant Admin (Toko)** | `/admin` (`public/admin.html`) | Query `?auth=...` / HMAC Bot Admin | Manajemen produk (tambah, edit, hapus), konfigurasi harga varian bertingkat (wholesale pricing tiers), upload stok massal (.txt/input), deteksi stok duplikat, monitoring status toko. |
| **Buyer (Pelanggan)** | `/` (`public/index.html`) | Telegram WebApp SDK (`Telegram.WebApp.initData`) | Eksplorasi katalog produk, pencarian real-time dengan efek placeholder dinamis, melihat detail varian & harga grosir, cek saldo akun, checkout pesanan melalui relay ke Bot Telegram. |

---

## 3. System Architecture & Topology

```
                                  ┌───────────────────────────┐
                                  │      Client Browsers      │
                                  └─────────────┬─────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 │                              │                              │
                 ▼                              ▼                              ▼
      [Buyer Mini App: /]            [Admin Portal: /admin]        [Master Dashboard: /master]
    (Telegram WebApp SDK)            (Tenant Token / Auth)           (X-Admin-Secret Header)
                 │                              │                              │
                 └──────────────────────────────┼──────────────────────────────┘
                                                │ HTTPS / JSON API
                                                ▼
                                  ┌───────────────────────────┐
                                  │   Vercel Serverless API   │
                                  │      (API Gateway)        │
                                  └─────────────┬─────────────┘
                                                │
         ┌──────────────────────────────────────┼──────────────────────────────────────┐
         │                                      │                                      │
         ▼                                      ▼                                      ▼
┌──────────────────┐                  ┌──────────────────┐                  ┌──────────────────┐
│  Master Supabase │                  │ Tenant Bot Server│                  │   WA Supabase    │
│    (PostgreSQL)  │                  │  (Private Relay) │                  │   (PostgreSQL)   │
├──────────────────┤                  ├──────────────────┤                  ├──────────────────┤
│ - tenants        │                  │ - Checkout logic │                  │ - managed_groups │
│ - tenant_configs │                  │ - Product CRUD   │                  │ - payments       │
│ - subscriptions  │                  │ - Stock insert   │                  │                  │
│ - rental_invoices│                  │ - User balances  │                  │                  │
│ - telegram_users │                  │ - Internal auth  │                  │                  │
└──────────────────┘                  └──────────────────┘                  └──────────────────┘
         ▲                                                                             ▲
         │                                                                             │
         └─────────────────────── [Webhook / Crons] ───────────────────────────────────┘
                                   - Xoftware Payment Webhook
                                   - Vercel Cron (0 17 * * * UTC / 00:00 WIB)
```

### 3.1 Technology Stack
- **Frontend Core**: HTML5, Vanilla JavaScript (ES Modules), Font Awesome 6, SweetAlert2.
- **Styling**: Tailwind CSS v4 (`@tailwindcss/cli` build & minify).
- **Backend / API Gateway**: Node.js Serverless Functions pada Vercel.
- **Database**: Supabase PostgreSQL dengan Row-Level Security (RLS) & PL/pgSQL RPC Functions.
- **Payment Gateway**: Xoftware Pay (QRIS dinamis untuk perpanjangan sewa SaaS).
- **Timezone Engine**: WIB (UTC+7 / Asia/Jakarta) helper berbasis `Intl.DateTimeFormat`.

---

## 4. Detailed Functional Requirements (FR)

### FR-1: Tenant Onboarding & Master Configuration
- **FR-1.1**: Bot tenant baru dapat didaftarkan melalui endpoint `POST /api/tenant/register` dengan otentikasi HMAC.
- **FR-1.2**: Konfigurasi koneksi database tenant (`supabase_url`, `supabase_anon_key`) disimpan terenkripsi/terisolasi di tabel `tenant_configs`.
- **FR-1.3**: Frontend Buyer & Admin memperoleh kredensial database tenant secara dinamis melalui `GET /api/webapp/tenant-config?bot_id=xxx`.
- **FR-1.4**: Gateway hanya mengirimkan `anon_key` milik tenant ke browser, dan **tidak pernah** mengekspos `service_role` key master.

### FR-2: Tenant Subscription & Expiry Management
- **FR-2.1**: Status tenant terdiri dari: `ACTIVE`, `SUSPENDED`, `EXPIRED`, `BANNED`.
- **FR-2.2**: Validasi status langganan dilakukan langsung oleh bot tenant via `POST /api/tenant/validate`.
- **FR-2.3**: Perhitungan tanggal jatuh tempo diselaraskan dengan kalender WIB (Asia/Jakarta) pada pukul 00:00:00:
  - Pembayaran di hari berjalan dengan sisa waktu akan dibulatkan ke hari kalender berikutnya ditambah durasi paket (31 hari untuk paket standar).
- **FR-2.4**: Vercel Cron harian mengeksekusi `0 17 * * *` UTC (pukul 00:00 WIB) memanggil `/api/admin/cron-expire` untuk menjalankan RPC `sync_expired_tenants`.
- **FR-2.5**: Setiap perubahan status tenant (baik otomatis via cron maupun manual dari master dashboard) mengirimkan callback invalidasi cache ke bot server tenant (`POST /api/internal/renewal-callback`).

### FR-3: Centralized Payment & Webhook Processing
- **FR-3.1**: Endpoint `POST /api/webhook/xoftware-renewal?token=SAAS_WEBHOOK_SECRET` menerima callback pembayaran dari Xoftware Pay.
- **FR-3.2**: Verifikasi integritas webhook menggunakan raw buffer body dan HMAC-SHA256 (`SAAS_XOFTWARE_WEBHOOK_SECRET`) dengan `crypto.timingSafeEqual` untuk mencegah *timing attack*.
- **FR-3.3**: Finalisasi pembayaran dieksekusi secara atomic via database RPC `process_renewal_payment(p_invoice_id, p_amount)`.
- **FR-3.4**: Jika invoice berstatus `PENDING` atau `EXPIRED`, status diubah menjadi `PAID`, langganan diperpanjang, tenant diaktifkan kembali, dan callback bot dipicu.
- **FR-3.5**: Pelacakan notifikasi QRIS: Invoice menyimpan `qris_chat_id` dan `qris_message_id`. Setelah pembayaran berhasil, bot diinstruksikan menghapus pesan QRIS lama dan mengirim notifikasi konfirmasi sukses.

### FR-4: Buyer Storefront Telegram Mini App
- **FR-4.1**: Deteksi lingkungan Telegram WebApp otomatis. Mengambil avatar bot, nama toko, dan data user dari Telegram.
- **FR-4.2**: Katalog menampilkan daftar produk dengan kartu responsif, badge ketersediaan stok, gambar produk, dan harga terendah.
- **FR-4.3**: Modal detail produk menampilkan deskripsi lengkap, pilihan varian, dan tabel diskon harga grosir (wholesale tiers).
- **FR-4.4**: Filter pencarian real-time dengan animasi placeholder interaktif (efek mesin tik).
- **FR-4.5**: Profil buyer memuat saldo akun dan riwayat total transaksi melalui relay `GET /api/webapp/checkout` ke bot server tenant.
- **FR-4.6**: Saat buyer klik "Checkout", pesanan dikirim ke `POST /api/webapp/checkout`, divalidasi dengan `Telegram.WebApp.initData`, lalu di-relay ke server bot untuk pemrosesan pembayaran (saldo/QRIS).

### FR-5: Tenant Shop Administration Portal
- **FR-5.1**: Akses portal admin toko via `/admin?bot_id=...&auth=...` dengan validasi token admin bot.
- **FR-5.2**: CRUD Produk: Nama, kategori, deskripsi, tautan gambar, multi-varian, dan aturan harga bertingkat (min qty -> harga satuan).
- **FR-5.3**: Manajemen Stok:
  - Input teks langsung atau upload file `.txt`.
  - Format panduan (baris baru atau delimiter).
  - Deteksi dan eliminasi baris duplikat sebelum penyimpanan.
  - Hapus item per satuan atau hapus seluruh stok varian.
- **FR-5.4**: Seluruh aksi modifikasi katalog dan stok di-relay ke server bot internal via header `X-Admin-Auth` dan `X-Internal-Api-Secret`.

### FR-6: Master SaaS Administrative Dashboard
- **FR-6.1**: Akses terlindungi menggunakan password admin (`X-Admin-Secret`).
- **FR-6.2**: Kartu Ringkasan Metrik: Total Tenant, Tenant Aktif, Tenant Expired, Segera Expired (<= 3 hari), Total Pendapatan Sewa, Total Sesi Mini App, dan Pengguna Telegram.
- **FR-6.3**: Tabel Manajemen Tenant:
  - Pencarian, filter status (`ALL`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `SUSPENDED`, `BANNED`), dan sorting (Nama, Masa Aktif, Tgl Daftar).
  - Aksi langsung: Tambah Hari Sewa (+30 hari, custom), Suspend, Activate, Ban, Delete, dan Force Push Invalidate Cache.
  - Generator Pesan Pengingat: Pembuatan teks pesan tagihan sewa siap kirim berformat Markdown Telegram dengan tautan bot/QRIS.
- **FR-6.4**: Sinkronisasi Manual: Tombol sinkronisasi manual untuk memicu sinkronisasi status sewa secara real-time.

### FR-7: WhatsApp Bot Rental Management
- **FR-7.1**: Tab terdedikasi di Master Dashboard untuk rental grup bot WhatsApp.
- **FR-7.2**: Menampilkan daftar grup (`managed_groups`), status aktif/non-aktif, nama penyewa (`renter_name`), tanggal sewa berakhir (`paid_until`), dan sisa hari sewa.
- **FR-7.3**: Generator Pesan Tagihan WhatsApp: Template teks dinamis dengan placeholder nama grup, tanggal expired, dan instruksi perpanjangan.
- **FR-7.4**: Aksi perpanjangan masa aktif grup WhatsApp langsung dari dashboard.

---

## 5. Security & Isolation Architecture

```
[Buyer / Admin Browser]
        │
        │ 1. Header: X-Telegram-Init-Data / Query: ?auth=...
        ▼
[Vercel API Gateway] ──── 2. Crypto Validation (HMAC-SHA256)
        │
        ├──── 3. Read DB via service_role ────► [Master DB: RLS Deny All]
        │
        └──── 4. Relay with INTERNAL_API_SECRET ─► [Tenant Bot Server: Port Internal]
                                                          │
                                                          ▼
                                                [Tenant Isolated DB]
```

1. **Prinsip Least Privilege**: Semua tabel di Master Supabase menerapkan `ENABLE ROW LEVEL SECURITY` dengan kebijakan default `deny_all` untuk role `anon` dan `authenticated`. Hanya `service_role` dari serverless functions yang memiliki akses CRUD.
2. **Isolasi Database Tenant**: Setiap tenant memiliki instance atau skema Supabase terpisah. Kerusakan atau kebocoran kredensial satu tenant tidak mempengaruhi tenant lain.
3. **Validasi Kriptografis Telegram**: Data `initData` dari Telegram divalidasi secara kriptografis menggunakan HMAC-SHA256 dengan secret key yang diturunkan dari `bot_token`.
4. **Verifikasi Webhook Antara-Sistem**:
   - Webhook Xoftware divalidasi menggunakan SHA256 HMAC digest dengan `crypto.timingSafeEqual`.
   - Komunikasi antara Gateway dan Bot Server diproteksi menggunakan shared secret `INTERNAL_API_SECRET`.
5. **Vercel Hobby Optimization**: Konsolidasi rute (`/api/admin/[resource].js` dan `/api/webapp/checkout.js`) memastikan sistem tetap berada di bawah batas maksimal 12 Serverless Functions Vercel tanpa mengorbankan modularitas.

---

## 6. API Gateway Endpoints Contract

### 6.1 Tenant Lifecycle & Authentication
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `POST` | `/api/tenant/register` | HMAC Signature | Mendaftarkan bot tenant baru dan database config |
| `POST` | `/api/tenant/validate` | HMAC Signature | Memeriksa keaktifan sewa tenant dan status blokir |
| `POST` | `/api/tenant/subscription` | HMAC Signature | Mengambil status subscription dan membuat invoice |
| `POST` | `/api/tenant/subscription/[action]` | HMAC Signature | Aksi spesifik langganan (generate invoice, extend trial) |

### 6.2 WebApp Public & Client APIs
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `GET` | `/api/webapp/tenant-config` | Opsional `initData` | Mengambil konfigurasi publik toko (`anon_key`, branding) |
| `GET` | `/api/webapp/checkout` | `X-Telegram-Init-Data` | Mengambil data saldo & riwayat order buyer via relay |
| `POST` | `/api/webapp/checkout` | `X-Telegram-Init-Data` | Membuat pesanan checkout dan relay ke bot tenant |
| `GET/POST`| `/api/webapp/admin-products` | `X-Admin-Auth` | Relay pengambilan dan pembaruan data produk toko |
| `GET/POST`| `/api/webapp/admin-stock` | `X-Admin-Auth` | Relay pengambilan dan upload stok varian |

### 6.3 Admin & Webhooks
| Method | Endpoint | Auth | Deskripsi |
|---|---|---|---|
| `GET/POST`| `/api/admin/stats` | `X-Admin-Secret` | Statistik performa master dashboard |
| `GET/POST`| `/api/admin/tenants` | `X-Admin-Secret` | List tenant, update status, dan tambah masa sewa |
| `GET/POST`| `/api/admin/subscriptions` | `X-Admin-Secret` | Riwayat langganan dan invoice sewa |
| `GET/POST`| `/api/admin/wa-groups` | `X-Admin-Secret` | Pengelolaan data rental grup WhatsApp |
| `POST` | `/api/admin/sync-expired` | `X-Admin-Secret` | Sinkronisasi manual tenant yang expired |
| `GET` | `/api/admin/cron-expire` | `Bearer CRON_SECRET` | Eksekusi harian otomatis Vercel Cron |
| `POST` | `/api/webhook/xoftware-renewal` | `SAAS_WEBHOOK_SECRET` | Callback pembayaran QRIS sewa dari Xoftware |

---

## 7. Master Database Entity-Relationship (Schema v2)

### 7.1 Entity Tables
- **`plans`**: Menyimpan paket sewa (`Trial`, `Premium`, `Enterprise`), harga, durasi (hari), dan limit fitur.
- **`tenants`**: Menyimpan identitas bot tenant (`bot_id`, `username`, `shop_name`, `owner_chat_id`, `status`, `metadata`).
- **`tenant_configs`**: Kredensial Supabase tenant (`supabase_url`, `supabase_anon_key`, `supabase_service_key`).
- **`tenant_api_keys`**: Kunci API per tenant untuk integrasi eksternal.
- **`subscriptions`**: Data masa aktif sewa per bot (`plan_id`, `start_date`, `expiry_date`, `status`, `last_payment_at`).
- **`telegram_users`**: Registri pengguna Telegram yang mengakses Mini App (`telegram_id`, `first_name`, `username`, `last_seen_at`).
- **`miniapp_sessions`**: Sesi akses Mini App untuk pelacakan analitik dan perangkat.
- **`rental_invoices`**: Riwayat tagihan sewa SaaS (`amount`, `status`, `plan_id`, `qris_chat_id`, `qris_message_id`, `paid_at`).
- **`managed_groups` (WA Supabase)**: Data rental bot grup WhatsApp (`store_group_id`, `group_name`, `renter_name`, `paid_until`, `is_active`).

### 7.2 Stored Procedures & Functions
- `sync_expired_tenants()`: Mengubah status subscription dan tenant menjadi `EXPIRED` jika telah melewati waktu sekarang, mengembalikan daftar `bot_id` untuk di-invalidasi.
- `process_renewal_payment(p_invoice_id, p_amount)`: Fungsi atomik transaksi finalisasi pembayaran invoice sewa, perpanjangan masa aktif (dibulatkan ke 00:00 WIB), dan pengambilan data tenant untuk notifikasi bot.
- `get_master_stats()`: Menghitung metrik analitik dashboard secara efisien dalam satu query.
- `cleanup_expired_sessions()`: Pembersihan sesi Web App yang telah kedaluwarsa (> 24 jam).

---

## 8. Deployment & Environment Configuration

### 8.1 Required Environment Variables (Vercel)
```env
# Master Xoftware Pay Config (Akun Master SaaS)
XOFTWARE_MERCHANT_ID=...
XOFTWARE_API_KEY=...
XOFTWARE_BASE_URL=https://payment1.xoftware.id
SAAS_XOFTWARE_WEBHOOK_SECRET=...

# Master Supabase (Server-Side Only)
MASTER_SUPABASE_URL=https://...supabase.co
MASTER_SUPABASE_SERVICE_KEY=...

# WhatsApp Supabase (Server-Side Only)
WA_SUPABASE_URL=https://...supabase.co
WA_SUPABASE_SERVICE_KEY=...

# Internal Secrets
INTERNAL_API_SECRET=...
ADMIN_DASHBOARD_SECRET=...
SAAS_WEBHOOK_SECRET=...
CRON_SECRET=...
```

### 8.2 Vercel Configuration (`vercel.json`)
- **Routing & Rewrites**:
  - `/master` diarahkan ke `/public/master-dashboard.html`
  - `/admin` diarahkan ke `/public/admin.html`
  - Seluruh rute statis diarahkan ke `/public/*`
- **Cron Jobs**:
  - Path: `/api/admin/cron-expire`
  - Jadwal: `0 17 * * *` (Pukul 00:00:00 WIB setiap hari)
- **CORS Headers**: Diizinkan untuk `/api/(.*)` dengan header kustom `X-Bot-Id`, `X-Timestamp`, `X-Signature`, `X-Telegram-Init-Data`, `X-Admin-Secret`.

---

## 9. Future Enhancements & Roadmap
1. **Multi-Currency & International Gateways**: Integrasi opsi pembayaran tambahan di samping QRIS Xoftware Pay.
2. **Tenant Custom Domain**: Dukungan custom domain untuk toko web tenant tertentu.
3. **Advanced Analytics Dashboard**: Grafik penjualan real-time, produk terlaris, dan proyeksi churn rate tenant pada Master Dashboard.
4. **Push Notification via Mini App**: Integrasi Web Notification atau Telegram Service Messages saat stok produk favorit diperbarui.
