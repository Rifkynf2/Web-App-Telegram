# Product Requirements Document (PRD)
# RNF SaaS Multi-Tenant Web App & API Gateway System
## Unified Multi-Tenant Bot Ecosystem & Finance Super-Dashboard

- **Version**: 2.5.0
- **Status**: Production / Active
- **System Architecture**: Multi-Tenant Telegram Mini App + Centralized Vercel API Gateway + Triple Supabase (Master, WA, RNF Shop)
- **Date**: 2026-09-18
- **Maintainer**: RNF System

---

## 1. Executive Summary

### 1.1 Product Vision
**RNF SaaS Multi-Tenant Web App** adalah platform terpadu untuk ekosistem e-commerce bot digital dan operasional finansial multi-layanan. Platform ini mengintegrasikan:
1. **Storefront Telegram Mini App (Buyer)**: Katalog belanja interaktif, responsif, dan instan untuk pelanggan toko digital bot tenant.
2. **Tenant Admin Portal (Seller)**: Antarmuka pengelolaan produk multi-varian, aturan harga grosir (*wholesale pricing tiers*), dan manajemen stok massal (*bulk restock*).
3. **Master SaaS Super Dashboard (Superadmin)**: Pusat kendali terpadu yang memiliki **Dual-Mode Switcher**:
   - **Mode Rental SaaS**: Pengelolaan lisensi masa aktif bot Telegram tenant, manajemen sewa grup bot WhatsApp (*managed groups*), penyesuaian durasi sewa, generator pengingat tagihan multi-platform, serta sinkronisasi kedaluwarsa otomatis.
   - **Mode Shop Finance (RNF Shop)**: Pencatatan keuangan toko (*income* & *expense*), visualisasi metrik laba bersih, manajemen katalog aplikasi/produk digital master, integrasi Google Sheets, serta modul *Batch Receipt Parser* cerdas untuk ekstraksi transaksi mutasi bank & QRIS.

### 1.2 Core Value Propositions
1. **Keamanan Transaksi Terisolasi & Anti-Eksploitasi**:
   - Seluruh mutasi saldo buyer, pemotongan stok aktual, dan eksekusi checkout di-relay langsung ke server bot privat tenant melalui komunikasi terenkripsi backend-to-backend (`INTERNAL_API_SECRET`), sehingga aman dari manipulasi di sisi browser.
2. **Tri-Database Isolation Architecture**:
   - Kredensial dipisahkan secara ketat ke dalam 3 instance Supabase:
     - **Master Database**: Metadata tenant, konfigurasi, paket langganan, sesi Mini App, dan tagihan sewa.
     - **WhatsApp Database**: Data persewaan grup bot WhatsApp dan riwayat pembayaran sewa grup.
     - **RNF Shop Database**: Pencatatan pembukuan keuangan toko dan master aplikasi digital.
   - Master `service_role` key hanya beroperasi di runtime Node.js Vercel dan **tidak pernah diekspos** ke client; frontend hanya menerima `anon_key` tenant secara dinamis.
3. **Atomic Payment Finalization & Race-Condition Defense**:
   - Pembayaran perpanjangan sewa via QRIS Xoftware Pay diproses secara *atomic* di level PostgreSQL (`process_renewal_payment`) dengan mekanisme *row-level locking* (`FOR UPDATE`). Mendukung pemulihan status dari `PENDING` maupun `EXPIRED` untuk mencegah dana tersangkut akibat *timeout race condition*.
4. **Sinkronisasi Kalender WIB (Asia/Jakarta) Berorientasi Midnight (00:00:00)**:
   - Seluruh durasi langganan diselaraskan ke tengah malam 00:00:00 WIB. Perpanjangan di tengah hari kalender secara otomatis memperoleh bonus sisa jam hari berjalan ditambah durasi penuh paket sewa (31 hari untuk paket standar).
5. **HMAC Signature dengan Bot-ID Binding & Anti-Replay**:
   - Komunikasi internal antara Bot Tenant dan API Gateway dilindungi oleh HMAC-SHA256 dengan payload terikat `timestamp.botId.body` dan toleransi waktu maksimal 5 menit untuk menolak *replay attack* dan impersonasi tenant.
6. **Vercel Hobby Optimization (Consolidated Dynamic Routing)**:
   - Mengonsolidasikan handler admin (`api/admin/[resource].js`), langganan (`api/tenant/subscription/[action].js`), dan checkout (`api/webapp/checkout.js`) agar seluruh backend serverless tetap berada di bawah limit kuota Vercel Hobby (< 12 Serverless Functions).

---

## 2. User Roles & Persona Matrix

| Role | Lokasi Akses | Akses & Otentikasi | Tanggung Jawab Utama |
|---|---|---|---|
| **SaaS Superadmin** | `/master` (`public/master-dashboard.html`) | Header `X-Admin-Secret` (`ADMIN_DASHBOARD_SECRET`) | - Monitoring analitik SaaS (Tenant, WA Group, Finansial RNF Shop).<br>- Pengelolaan tenant: Tambah durasi (+30/custom hari), Suspend, Activate, Ban, Delete, Force Invalidate Cache.<br>- Pengelolaan rental grup WhatsApp: Tambah grup, perpanjang sewa, toggle status aktif, ubah PIC renter.<br>- Finansial RNF Shop: Input transaksi manual, edit, hapus, import struk/mutasi batch, manajemen katalog apps.<br>- Generator pesan pengingat tagihan (Telegram Markdown & WhatsApp).<br>- Sinkronisasi manual tenant expired. |
| **Tenant Admin (Toko)** | `/admin` (`public/admin.html`) | Query Param `?bot_id=...&auth=...` / HMAC Bot Admin | - Manajemen produk: Tambah/edit nama, kategori, deskripsi, gambar, varian multi-harga, serta aturan diskon grosir.<br>- Manajemen stok: Tambah stok massal via file `.txt` atau input baris, deteksi baris duplikat otomatis, hapus stok per item atau per varian.<br>- Monitoring metrik pesanan toko melalui relay ke server bot tenant. |
| **Buyer (Pelanggan)** | `/` (`public/index.html`) | Header / Body `X-Telegram-Init-Data` (`Telegram.WebApp.initData`) | - Menjelajah katalog toko bot secara interaktif di Telegram Mini App.<br>- Pencarian produk instan dengan efek animasi placeholder mesin tik dinamis.<br>- Melihat detail produk, variasi, dan tabel harga bertingkat grosir.<br>- Pengecekan saldo akun dan riwayat order belanja via bot relay.<br>- Melakukan checkout pesanan toko melalui relay transaksi ke bot tenant. |

---

## 3. System Architecture & Topology

```
                                    ┌──────────────────────────────────────┐
                                    │           Client Browsers            │
                                    └──────────────────┬───────────────────┘
                                                       │
                 ┌─────────────────────────────────────┼─────────────────────────────────────┐
                 │                                     │                                     │
                 ▼                                     ▼                                     ▼
      [Buyer Mini App: /]                   [Admin Portal: /admin]              [Master Super-Dashboard: /master]
   (Telegram WebApp initData)               (Tenant Token & Auth)               (X-Admin-Secret Header Auth)
                 │                                     │                                     │
                 │                                     │                                     │ Mode Switcher:
                 │                                     │                                     ├─ [Rental SaaS Mode]
                 │                                     │                                     └─ [Shop Finance Mode]
                 │                                     │                                     │
                 └─────────────────────────────────────┼─────────────────────────────────────┘
                                                       │ HTTPS / JSON API
                                                       ▼
                                    ┌──────────────────────────────────────┐
                                    │        Vercel Serverless API         │
                                    │            (API Gateway)             │
                                    └──────────────────┬───────────────────┘
                                                       │
         ┌─────────────────────────┬───────────────────┴───────────────────┬─────────────────────────┐
         │                         │                                       │                         │
         ▼                         ▼                                       ▼                         ▼
┌──────────────────┐      ┌──────────────────┐                    ┌──────────────────┐      ┌──────────────────┐
│  Master Supabase │      │ Tenant Bot Relay │                    │   WA Supabase    │      │ RNF Shop Supabase│
│   (PostgreSQL)   │      │ (Private Server) │                    │   (PostgreSQL)   │      │   (PostgreSQL)   │
├──────────────────┤      ├──────────────────┤                    ├──────────────────┤      ├──────────────────┤
│ - plans          │      │ - Checkout logic │                    │ - managed_groups │      │ - apps           │
│ - tenants        │      │ - Product CRUD   │                    │ - payments       │      │ - transactions   │
│ - tenant_configs │      │ - Stock insert   │                    └──────────────────┘      │ - transactions_  │
│ - tenant_api_keys│      │ - User balances  │                             ▲                │   view           │
│ - subscriptions  │      │ - Balance deduct │                             │                │ - allowed_emails │
│ - rental_invoices│      │ - Cache invalid. │                             │                └──────────────────┘
│ - telegram_users │      └──────────────────┘                             │                         ▲
│ - miniapp_sess.  │               ▲                                       │                         │
└──────────────────┘               │ (Cache Invalidate / Webhook Relay)    │                         │
         ▲                         │                                       │                         │
         │                         │                                       │                         │
         └─────────────────────────┴───────────────────┬───────────────────┘                         │
                                                       │                                             │
                                                       ▼                                             │
                                    ┌──────────────────────────────────────┐                         │
                                    │    Crons & External Integrations     │                         │
                                    ├──────────────────────────────────────┤                         │
                                    │ - Vercel Cron: /api/admin/cron-expire│                         │
                                    │   (0 17 * * * UTC = 00:00:00 WIB)    │                         │
                                    │ - Xoftware Pay: Webhook Renewal QRIS │                         │
                                    │ - Google Sheets Sync (Finansial) ────┼─────────────────────────┘
                                    └──────────────────────────────────────┘
```

### 3.1 Technology Stack
- **Frontend Layer**:
  - HTML5 Semantik, Vanilla JavaScript (Modular ES Modules & Class Controllers).
  - Styling: Tailwind CSS v4 (`@tailwindcss/cli` build & minify ke `public/style/style.css`).
  - Komponen UI & Ikonografi: Font Awesome 6 Pro/Free, SweetAlert2 (dialog konfirmasi/alert), Canvas Confetti.
  - Runtime Eksternal: Telegram WebApp SDK (`telegram-web-app.js`).
- **Backend / API Gateway Layer**:
  - Node.js (Vercel Serverless Functions).
  - Kriptografi Native: `node:crypto` (HMAC-SHA256, `timingSafeEqual`, SHA-256 Hashes).
  - HTTP Client: `axios` (Xoftware status verification) dan Native `fetch` (bot relaying).
  - Database Client: `@supabase/supabase-js` (Connection pooling, RPC invocations, RLS bypass via service keys).
- **Timezone & Date Processing**:
  - `Intl.DateTimeFormat` engine (`Asia/Jakarta`) zero-dependency tanpa `moment` atau `dayjs`.
- **Database Engine**:
  - PostgreSQL di Supabase dengan RLS terisolasi, Enum Types, Triggers `updated_at`, dan PL/pgSQL Stored Functions.

---

## 4. Detailed Functional Requirements (FR)

### FR-1: Tenant Onboarding, Identity & Session Initialization
- **FR-1.1**: Registrasi tenant baru dilakukan via `POST /api/tenant/register` dengan otentikasi HMAC SHA-256. Menyimpan `bot_id`, `shop_name`, `owner_chat_id`, `bot_token`, dan kredensial database tenant di `tenant_configs`.
- **FR-1.2**: Inisialisasi sesi Mini App pelanggan melalui `POST /api/webapp/init`:
  - Menerima dan memvalidasi `initData` Telegram beserta `bot_id`.
  - Mendaftarkan atau memperbarui data pengguna ke tabel `telegram_users` (`telegram_id`, `username`, `first_name`, `language_code`, `last_seen_at`).
  - Menghasilkan atau memperbarui sesi aktif di `miniapp_sessions` dengan masa berlaku 24 jam dan pengecekan hash `init_data_hash`.
  - Memverifikasi status tenant (`ACTIVE`, `SUSPENDED`, `EXPIRED`, `BANNED`) dan masa berlaku langganan.
  - Mengembalikan `session_id`, profil user, status tenant, dan kredensial publik tenant (`supabase_url`, `supabase_anon_key`).
- **FR-1.3**: Gateway hanya mengekspos `supabase_anon_key` tenant ke browser dan **tidak pernah** membocorkan `service_role` key master maupun tenant.
- **FR-1.4**: Pengambilan konfigurasi toko secara publik via `GET /api/webapp/tenant-config?bot_id=...` secara dinamis mengambil foto profil bot resmi dari Telegram Bot API (`getMe` -> `getUserProfilePhotos` -> `getFile`).

### FR-2: Tenant Subscription Lifecycle & Timezone Precision (WIB)
- **FR-2.1**: Matriks status tenant:
  - `ACTIVE`: Bot dan Mini App beroperasi penuh.
  - `SUSPENDED`: Dinonaktifkan sementara oleh Superadmin (Mini App terkunci dengan pesan suspensi).
  - `EXPIRED`: Masa sewa habis (Mini App terkunci dengan instruksi perpanjangan sewa).
  - `BANNED`: Diblokir permanen karena pelanggaran sistem.
- **FR-2.2**: Validasi status bot dijalankan berkala oleh server bot tenant via `POST /api/tenant/validate` menggunakan signature HMAC.
- **FR-2.3**: Perhitungan jatuh tempo diselaraskan dengan tengah malam **00:00:00 WIB (Asia/Jakarta)**:
  - Pembayaran pada hari berjalan menambahkan sisa jam hingga midnight + 1 hari kalender berikutnya + durasi paket sewa (31 hari untuk paket standar).
  - Standar ISO tersimpan dalam UTC (`17:00:00.000Z` hari sebelumnya = `00:00:00 WIB`).
- **FR-2.4**: Vercel Cron harian mengeksekusi `0 17 * * * UTC` (pukul 00:00 WIB) memanggil `/api/admin/cron-expire` (`handleCronExpire`), menjalankan database RPC `sync_expired_tenants`.
- **FR-2.5**: Notifikasi Invalidasi Cache Bot Otomatis:
  - Setiap perubahan status tenant (baik via cron otomatis, webhook perpanjangan sewa, maupun aksi manual admin di master dashboard) mengirimkan callback HTTP `POST /api/internal/renewal-callback` dengan payload `{ action: 'invalidate_cache', bot_id }` ke URL bot server tenant (`metadata.bot_api_base_url`).

### FR-3: Centralized Payment & Webhook Processing (Xoftware Pay)
- **FR-3.1**: Callback pembayaran dari Xoftware Pay diterima di `POST /api/webhook/xoftware-renewal?token=SAAS_WEBHOOK_SECRET`.
- **FR-3.2**: Verifikasi Signature Webhook Fail-Closed:
  - Vercel dinonaktifkan body-parser bawaannya (`bodyParser: false`) agar signature HMAC-SHA256 (`SAAS_XOFTWARE_WEBHOOK_SECRET`) dihitung langsung dari raw buffer bytes request.
  - Verifikasi menggunakan `crypto.timingSafeEqual` untuk mitigasi *timing attack*.
- **FR-3.3**: Reverse Status Verification:
  - Gateway melakukan panggilan balik (*reverse lookup*) ke endpoint resmi Xoftware `/v1/api/transactions/status` menggunakan HMAC request signing (`signRequest`) untuk memvalidasi bahwa transaksi benar-benar berstatus `SUCCESS` di payment gateway sebelum mengubah data DB.
- **FR-3.4**: Atomic Transaction RPC (`process_renewal_payment`):
  - Mengunci baris `rental_invoices` dengan `FOR UPDATE`.
  - Menerima klaim dari invoice berstatus `PENDING` ataupun `EXPIRED` (mencegah kegagalan bila invoice kedaluwarsa tepat saat uang masuk).
  - Memperpanjang masa aktif tenant di `subscriptions`, mengaktifkan tenant di `tenants`, mencatat waktu bayar, dan mengembalikan status atomik.
  - Idempoten: Jika invoice sudah berstatus `PAID`, RPC mengembalikan data lengkap tenant agar webhook dapat mencoba ulang pengiriman notifikasi/penghapusan QRIS tanpa memperpanjang durasi ganda.
- **FR-3.5**: Pelacakan Notifikasi & Penghapusan Pesan QRIS:
  - Invoice menyimpan `qris_chat_id` dan `qris_message_id`.
  - Setelah pembayaran terkonfirmasi, bot tenant dipicu untuk menghapus pesan QRIS lama dan mengirim notifikasi sukses kepada pemilik bot.
  - Status pengiriman dilacak melalui flag `notification_sent` dan `qris_deleted` di `rental_invoices`.

### FR-4: Buyer Storefront Telegram Mini App
- **FR-4.1**: Inisialisasi antarmuka Telegram WebApp, membaca avatar toko, tema warna (Dark/Light mode via `theme.js`), dan profil pembeli.
- **FR-4.2**: Katalog produk dengan filter kategori, pencarian real-time dengan animasi placeholder dinamis berganti frasa secara berkala.
- **FR-4.3**: Modal detail produk:
  - Deskripsi produk lengkap.
  - Pilihan varian interaktif dengan visualisasi stok sisa dan status habis (*out of stock*).
  - Tabel harga bertingkat grosir (*wholesale tier pricing*): Menampilkan diskon otomatis berdasarkan batas minimum pembelian (contoh: Beli 5+ @Rp9.500, Beli 10+ @Rp9.000).
- **FR-4.4**: Profil & Saldo Terisolasi:
  - Pemanggilan `GET /api/webapp/checkout?bot_id=...` me-relay permintaan ke bot server tenant untuk mengambil saldo akun buyer dan total transaksi belanja, menghindari pembacaan langsung yang tidak aman dari browser.
- **FR-4.5**: Checkout Pesanan Terproteksi:
  - Tombol checkout mengirimkan payload ke `POST /api/webapp/checkout` disertai header `X-Telegram-Init-Data`.
  - Gateway memverifikasi integritas buyer via `telegramAuth.js`, lalu me-relay order ke bot tenant untuk pemotongan saldo aman atau penerbitan pembayaran QRIS bot tenant.

### FR-5: Tenant Shop Administration Portal
- **FR-5.1**: Portal khusus admin toko diakses melalui `/admin?bot_id=...&auth=...`.
- **FR-5.2**: Ringkasan Metrik Toko via `GET /api/webapp/admin-dashboard`:
  - Menampilkan total produk, varian, total stok tersedia, dan statistik pesanan toko dari bot server.
- **FR-5.3**: Manajemen Katalog Produk (`/api/webapp/admin-products`):
  - `GET`: Mengambil seluruh daftar produk dan varian toko.
  - `POST`: Menambah produk baru beserta multi-varian dan tier harga grosir.
  - `PUT`: Memperbarui data produk, nama, kategori, gambar, deskripsi, varian, dan aturan grosir.
  - `DELETE`: Menghapus produk dari katalog toko.
- **FR-5.4**: Manajemen Stok Varian (`/api/webapp/admin-stock`):
  - `GET`: Menampilkan daftar item stok aktif untuk varian yang dipilih.
  - `POST`: Upload stok massal baik melalui input teks multi-baris maupun file `.txt`.
  - **Deduplikasi Cerdas**: Sistem membersihkan spasi, mendeteksi dan mengeliminasi item duplikat sebelum dikirim ke database.
  - `DELETE`: Menghapus satu item stok tertentu berdasarkan ID atau menghapus seluruh stok (*clear all*) untuk varian terkait.

### FR-6: Master SaaS Administrative Dashboard (Rental Mode)
- **FR-6.1**: Akses terpusat di `/master` dengan proteksi `X-Admin-Secret`.
- **FR-6.2**: Monitoring Metrik SaaS Master:
  - Ringkasan kartu real-time: Total Tenant, Tenant Aktif (termasuk verifikasi aktif kalender), Tenant Expired, Segera Expired (<= 3 hari), Total Pendapatan Sewa (PAID invoices), Sesi Aktif Mini App, dan Total Pengguna Telegram.
- **FR-6.3**: Manajemen Tenant Telegram:
  - Pencarian, filter status (`ALL`, `ACTIVE`, `EXPIRING`, `EXPIRED`, `SUSPENDED`, `BANNED`), dan sorting nama toko, masa aktif, atau tanggal daftar.
  - Aksi Operasional:
    - Tambah Durasi Sewa: Opsi instan +30 Hari atau Custom Hari input manual.
    - Kontrol Akses: Tombol Suspend, Activate, Ban, dan Delete tenant.
    - Force Push Invalidate Cache: Memicu pembersihan cache internal bot tenant seketika.
  - Generator Pesan Pengingat Sewa Telegram:
    - Menghasilkan format pesan tagihan siap kirim Markdown Telegram yang mencantumkan nama bot, tanggal kedaluwarsa, sisa hari, dan instruksi perpanjangan.
- **FR-6.4**: Sinkronisasi Expired Manual:
  - Tombol manual sync untuk mengeksekusi RPC `sync_expired_tenants` secara instan dari dashboard.
- **FR-6.5**: Manajemen Rental Grup WhatsApp (`wa-groups`):
  - Tab khusus WhatsApp Bot Rental (`managed_groups`).
  - Metrik: Total Grup, Grup Aktif, Segera Expired, Total Pembayaran Disetujui.
  - Tabel grup: Nama grup, JID grup, nama penyewa (*renter*), status aktif/non-aktif, tanggal sewa (`paid_until`), dan sisa hari.
  - Aksi: Tambah grup sewa, perpanjang masa aktif sewa grup, edit rincian data grup, toggle status aktif/non-aktif, dan hapus grup.
  - Generator Template Pesan Tagihan WhatsApp: Pesan terformat resmi untuk dikirimkan ke grup/penyewa WA.

### FR-7: RNF Shop Finance & Operations Dashboard (Shop Mode)
- **FR-7.1**: Mode Khusus "Shop Finance" pada Master Super-Dashboard:
  - Dikelola melalui switcher mode di sidebar dashboard (`switchMode('shop')`).
  - Terkoneksi secara terisolasi ke database RNF Shop Supabase via `/api/admin/rnfshop` (`rnfshop-handler.js`).
- **FR-7.2**: Financial Overview (`rnf-overview`):
  - Kartu Metrik: Total Pemasukan (*Incoming*), Total Pengeluaran (*Outgoing*), Laba Bersih (*Net Profit*), dan Total Frekuensi Transaksi.
  - Distribusi Finansial: Distribusi pendapatan per aplikasi digital, volume penjualan per aplikasi, tren harian pemasukan vs pengeluaran, dan daftar mutasi terbaru.
- **FR-7.3**: Manajemen Transaksi Lengkap (`rnf-transactions`):
  - Filter interaktif: Tipe transaksi (`all`, `incoming`, `outgoing`), Filter per aplikasi master, Rentang tanggal (*Start Date* s/d *End Date*), dan kata kunci pencarian nama pelanggan atau catatan.
  - Pagination dinamis (25, 50, 100 baris per halaman).
  - Tambah Transaksi: Tanggal, Tipe, Aplikasi, Nama Pelanggan, Nominal Kotor (*Gross*), Biaya QRIS (*Fee QRIS*), Nominal Bersih (*Net*), Metode Pembayaran (QRIS, Transfer, Saldo), Catatan transaksi, dan status sinkronisasi.
  - Edit & Hapus Transaksi dengan konfirmasi SweetAlert2.
- **FR-7.4**: Batch Receipt & Mutation Parser (`import.js`):
  - Fitur parser cerdas untuk mengekstrak mutasi bank/struk secara massal dari format teks bebas (BCA, QRIS, mutasi perbankan).
  - Regex Engine: Otomatis mendeteksi tanggal, nominal, nama pembeli, dan catatan.
  - Normalisasi Alias: Memetakan variasi penulisan nama produk/aplikasi (contoh: "YT", "YOUTUBE", "YTP" -> "YOUTUBE PREMIUM").
  - Penghitungan Otomatis Fee & Net: Mengkalkulasi potongan fee QRIS secara otomatis.
  - Tampilan Pratinjau (*Validation Preview Table*) sebelum melakukan batch insert ke database.
- **FR-7.5**: Manajemen Master Aplikasi Digital (`rnf-apps`):
  - Pengelolaan katalog aplikasi toko digital (`apps` table).
  - Tambah aplikasi baru, edit nama aplikasi, atur ikon aplikasi, dan toggle status aktif/non-aktif.

---

## 5. Security & Cryptographic Architecture

```
[Buyer / Admin / Bot Client]
          │
          │ 1. Header: X-Telegram-Init-Data / Query: ?auth=... / Header: X-Signature
          ▼
[Vercel API Gateway] ──── 2. Kriptografi & Signature Gateways
          │                 ├─ Telegram: validateTelegramInitData (HMAC-SHA256 WebAppData)
          │                 ├─ Bot Tenant: verifyHMAC (timestamp.botId.body binding)
          │                 ├─ Admin: X-Admin-Secret verification
          │                 └─ Webhook: Raw body buffer HMAC-SHA256 + Xoftware Reverse API Check
          │
          ├──── 3. Database Operations (Server-Side Service Role)
          │         ├─ Master DB (RLS: Deny All for anon/authenticated)
          │         ├─ WA DB (RLS: Protected tables)
          │         └─ RNF Shop DB (RLS: Strict Schema Permissions)
          │
          └──── 4. Private Relay (INTERNAL_API_SECRET)
                    ▼
          [Bot Tenant Server] ────► [Tenant Isolated DB]
```

### 5.1 Telegram WebApp Cryptographic Validation (`telegramAuth.js`)
- Validasi sesuai spesifikasi resmi Telegram:
  - Ekstraksi `hash` dari `initData`.
  - Penyusunan `data-check-string` dengan mengurutkan seluruh key secara alfabetis dan memisahkan dengan baris baru (`\n`).
  - Penurunan kunci rahasia: `HMAC-SHA256('WebAppData', botToken)`.
  - Perhitungan hash: `HMAC-SHA256(secretKey, dataCheckString)`.
  - Komparasi menggunakan `crypto.timingSafeEqual` untuk mencegah kebocoran *side-channel timing*.
  - Token bot diperoleh secara dinamis berdasarkan `bot_id` tenant dari tabel `tenants` dengan *in-memory cache* selama 30 menit (`TOKEN_CACHE_TTL`).
  - Validasi *freshness*: Menolak `auth_date` yang berumur lebih dari 24 jam (86.400 detik).

### 5.2 Bot Tenant HMAC Protocol with BotId Binding (`hmacAuth.js`)
- Mencegah *request spoofing*, *tenant impersonation*, dan *replay attacks*:
  - **Payload yang ditandatangani**: `timestamp + "." + botId + "." + body`.
  - Penyertaan `botId` di dalam digest mencegah bot tenant yang memiliki `INTERNAL_API_SECRET` sama merekayasa header `X-Bot-Id` milik tenant lain.
  - **Jendela Toleransi Waktu (Window)**: Permintaan ditolak bila selisih `|now - timestamp| > 5 menit` (300.000 ms).
  - Menggunakan `crypto.timingSafeEqual` pada perbandingan signature.
  - Tetap mendukung fallback legacy payload (`timestamp.body`) selama masa transisi deployment multi-bot.

### 5.3 Webhook Fail-Closed Security & Raw Buffering (`xoftware-renewal.js`)
- Webhook Xoftware Pay mematikan parser body default (`bodyParser: false`).
- Menghitung HMAC langsung dari buffer biner mentah (`readRawBody`) agar tidak terpengaruh oleh perbedaan format serialisasi JSON (whitespace, key ordering).
- Dilengkapi verifikasi sekunder aktif: Gateway menghubungi balik endpoint `/v1/api/transactions/status` payment gateway dengan request bertanda tangan sebelum memperpanjang sewa.

### 5.4 Database Row-Level Security (RLS) & Isolation
- **Master Supabase**:
  - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` diaktifkan pada semua 8 tabel (`tenants`, `tenant_configs`, `tenant_api_keys`, `plans`, `subscriptions`, `telegram_users`, `miniapp_sessions`, `rental_invoices`).
  - Seluruh tabel menerapkan policy `deny_all` untuk role `anon` dan `authenticated`, kecuali `plans` yang memiliki policy `plans_public_read` (`is_active = true`) untuk pembacaan paket publik.
  - Akses CRUD penuh hanya diberikan kepada role internal serverless `service_role`.
- **Relay Server Bot**:
  - Seluruh operasi checkout, pemotongan saldo, katalog toko admin, dan mutasi stok dialirkan via HTTP relay ke bot server tenant dengan autentikasi header `X-Internal-Api-Secret` dan `X-Admin-Auth`.

---

## 6. API Gateway Endpoints Contract

### 6.1 Tenant Lifecycle & Subscription Management
| Method | Endpoint | Auth | Parameter / Payload | Deskripsi |
|---|---|---|---|---|
| `POST` | `/api/tenant/register` | HMAC Signature | `{ bot_id, shop_name, owner_chat_id, bot_token, config: { supabase_url, supabase_anon_key, supabase_service_key }, metadata }` | Mendaftarkan bot tenant baru dan menyimpan konfigurasi koneksi database. |
| `POST` | `/api/tenant/validate` | HMAC Signature | `{}` (Header: `X-Bot-Id`, `X-Timestamp`, `X-Signature`) | Memvalidasi status keaktifan tenant dan sisa masa aktif langganan. |
| `GET` | `/api/tenant/subscription` | HMAC Signature | Header: `X-Bot-Id`, `X-Timestamp`, `X-Signature` | Mengambil rincian langganan aktif, paket sewa, data toko, dan riwayat invoice sewa. |
| `POST` | `/api/tenant/subscription` | HMAC Signature | `{ plan_id, duration_days }` | Membuat invoice perpanjangan sewa baru dengan pembuatan QRIS dinamis Xoftware Pay. |
| `POST` | `/api/tenant/subscription/confirm-payment` | HMAC Signature | `{ invoice_id, amount }` | Safety-net poller dari bot untuk memicu finalisasi pembayaran via RPC `process_renewal_payment`. |
| `POST` | `/api/tenant/subscription/mark-notified` | HMAC Signature | `{ invoice_id, qris_deleted }` | Menandai flag `notification_sent` dan `qris_deleted` pada invoice setelah bot mengirimkan notifikasi. |
| `POST` | `/api/tenant/subscription/update-qris-info` | HMAC Signature | `{ invoice_id, qris_chat_id, qris_message_id }` | Menyimpan ID pesan Telegram QRIS agar dapat dihapus otomatis saat pembayaran lunas. |

### 6.2 WebApp Storefront & Tenant Admin APIs
| Method | Endpoint | Auth | Parameter / Payload | Deskripsi |
|---|---|---|---|---|
| `POST` | `/api/webapp/init` | Public / Telegram | `{ initData: string, bot_id: string }` | Inisialisasi sesi Mini App, validasi `initData`, upsert user Telegram, buat sesi, dan kembalikan config toko. |
| `GET` | `/api/webapp/tenant-config` | Optional `initData` | Query: `?bot_id=...` (Header: `X-Telegram-Init-Data`) | Mengambil kredensial database publik tenant (`anon_key`), nama toko, status, dan URL foto profil resmi Telegram. |
| `GET` | `/api/webapp/checkout` | `X-Telegram-Init-Data` | Query: `?bot_id=...` | Relay ke server bot untuk mengambil saldo akun buyer dan total riwayat transaksi belanja. |
| `POST` | `/api/webapp/checkout` | `X-Telegram-Init-Data` | `{ bot_id, items, total_amount, payment_method }` | Relay pemesanan checkout buyer ke bot server untuk pemotongan saldo atau penerbitan pembayaran. |
| `GET` | `/api/webapp/admin-dashboard` | Query Admin Auth | Query: `?bot_id=...&auth=...` | Relay ke bot server untuk memuat ringkasan statistik produk, varian, dan stok toko tenant. |
| `GET` | `/api/webapp/admin-products` | `X-Admin-Auth` | Query: `?bot_id=...&auth=...` | Relay pengambilan katalog produk lengkap toko tenant. |
| `POST` | `/api/webapp/admin-products` | `X-Admin-Auth` | `{ bot_id, auth, name, category_id, image_url, description, variants, wholesale_tiers }` | Relay pembuatan produk baru beserta varian dan tier harga grosir. |
| `PUT` | `/api/webapp/admin-products` | `X-Admin-Auth` | `{ bot_id, auth, id, ...productData }` | Relay pembaruan data produk toko tenant. |
| `DELETE`| `/api/webapp/admin-products` | `X-Admin-Auth` | Query: `?bot_id=...&auth=...&id=...` | Relay penghapusan produk dari toko tenant. |
| `GET` | `/api/webapp/admin-stock` | `X-Admin-Auth` | Query: `?bot_id=...&auth=...&variant_id=...` | Relay pengambilan daftar stok aktif varian tertentu. |
| `POST` | `/api/webapp/admin-stock` | `X-Admin-Auth` | `{ bot_id, auth, variant_id, items: string[] }` | Relay upload stok massal dengan eliminasi baris duplikat. |
| `DELETE`| `/api/webapp/admin-stock` | `X-Admin-Auth` | Query: `?bot_id=...&auth=...&id=...` atau `&variant_id=...` | Relay penghapusan satu baris stok atau penghapusan seluruh stok varian (*clear all*). |

### 6.3 Master Super-Dashboard & System Crons (`/api/admin/[resource]`)
| Method | Endpoint | Auth | Parameter / Payload | Deskripsi |
|---|---|---|---|---|
| `GET` | `/api/admin/stats` | `X-Admin-Secret` | - | Mengambil ringkasan metrik analitik SaaS master (eksekusi RPC `get_master_stats`). |
| `GET` | `/api/admin/tenants` | `X-Admin-Secret` | Query: `?search=...&status=...&sort=...` | Mengambil daftar seluruh tenant bot beserta masa aktif, subscription, dan metadata. |
| `PUT` | `/api/admin/tenants` | `X-Admin-Secret` | `{ action: 'extend'\|'status'\|'invalidate_cache', bot_id, days, status }` | Menambah masa sewa tenant (+30 atau custom hari), ubah status (ACTIVE, SUSPENDED, BANNED), atau paksa invalidate cache. |
| `DELETE`| `/api/admin/tenants` | `X-Admin-Secret` | Query: `?bot_id=...` | Menghapus tenant dan seluruh dependensi konfigurasinya dari sistem master. |
| `GET` | `/api/admin/subscriptions` | `X-Admin-Secret` | - | Mengambil riwayat daftar seluruh langganan tenant dan paketnya. |
| `POST` | `/api/admin/sync-expired` | `X-Admin-Secret` | - | Sinkronisasi manual tenant expired (memanggil RPC `sync_expired_tenants` dan mengirim invalidate callback ke bot). |
| `GET` | `/api/admin/wa-groups` | `X-Admin-Secret` | Query: `?action=stats` atau default list | Mengambil daftar grup WhatsApp sewaan (`managed_groups`) atau statistik rental WA. |
| `POST` | `/api/admin/wa-groups` | `X-Admin-Secret` | `{ group_name, store_group_id, target_group_id, renter_name, user_jid, paid_until }` | Mendaftarkan grup sewa bot WhatsApp baru. |
| `PUT` | `/api/admin/wa-groups` | `X-Admin-Secret` | `{ id, action: 'extend'\|'toggle', days, ...groupData }` | Memperpanjang sewa grup WA, toggle status aktif/non-aktif, atau update profil penyewa. |
| `DELETE`| `/api/admin/wa-groups` | `X-Admin-Secret` | Query: `?id=...` | Menghapus data grup sewa WhatsApp. |
| `GET` | `/api/admin/rnfshop` | `X-Admin-Secret` | Query: `?action=overview` \| `transactions` \| `apps` | Mengambil data ringkasan finansial, data transaksi terpaginasi, atau data master katalog aplikasi RNF Shop. |
| `POST` | `/api/admin/rnfshop` | `X-Admin-Secret` | `{ action: 'add_transaction'\|'save_app'\|'import_batch', ...payload }` | Menambahkan transaksi individual, menyimpan aplikasi baru/edit, atau impor batch hasil parsing struk mutasi bank/QRIS. |
| `PUT` | `/api/admin/rnfshop` | `X-Admin-Secret` | `{ id, ...transactionUpdateData }` | Memperbarui rincian transaksi finansial RNF Shop. |
| `DELETE`| `/api/admin/rnfshop` | `X-Admin-Secret` | Query: `?id=...` | Menghapus catatan transaksi finansial dari database RNF Shop. |
| `GET` | `/api/admin/cron-expire` | `Bearer CRON_SECRET` | Header: `Authorization: Bearer CRON_SECRET` | Endpoint terjadwal Vercel Cron harian untuk eksekusi otomatis `sync_expired_tenants`. |
| `POST` | `/api/webhook/xoftware-renewal` | Webhook Secret | Header HMAC / Query `?token=SAAS_WEBHOOK_SECRET` | Menerima notifikasi pelunasan QRIS perpanjangan sewa dari Xoftware Pay. |

---

## 7. Multi-Database Entity-Relationship & Schema Architecture

### 7.1 Master Supabase Database (`master_supabase_schema.sql`)
1. **`plans`**:
   - `id` (UUID PK), `name` (TEXT UNIQUE - `Trial`, `Premium`, `Enterprise`), `price` (INTEGER), `duration_days` (INTEGER), `features` (JSONB), `is_active` (BOOLEAN), `sort_order` (INTEGER).
2. **`tenants`**:
   - `bot_id` (BIGINT PK), `username` (TEXT), `shop_name` (TEXT), `owner_chat_id` (BIGINT), `bot_token` (TEXT), `status` (TEXT DEFAULT 'ACTIVE'), `db_url` (TEXT), `db_anon_key` (TEXT), `metadata` (JSONB - menyimpan `bot_api_base_url`), `created_at`, `updated_at`.
3. **`tenant_configs`**:
   - `bot_id` (BIGINT PK FK `tenants.bot_id`), `supabase_url` (TEXT), `supabase_anon_key` (TEXT), `supabase_service_key` (TEXT), `updated_at`.
4. **`tenant_api_keys`**:
   - `id` (UUID PK), `bot_id` (BIGINT FK `tenants.bot_id`), `key_hash` (TEXT), `key_prefix` (TEXT), `label` (TEXT), `is_active` (BOOLEAN), `last_used_at`, `created_at`.
5. **`subscriptions`**:
   - `id` (UUID PK), `bot_id` (BIGINT FK `tenants.bot_id`), `plan_id` (UUID FK `plans.id`), `start_date` (TIMESTAMPTZ), `expiry_date` (TIMESTAMPTZ), `status` (TEXT DEFAULT 'ACTIVE'), `last_payment_at` (TIMESTAMPTZ), `is_auto_off` (BOOLEAN), `created_at`, `updated_at`.
6. **`telegram_users`**:
   - `telegram_id` (BIGINT PK), `username` (TEXT), `first_name` (TEXT), `last_name` (TEXT), `language_code` (TEXT), `first_seen_at` (TIMESTAMPTZ), `last_seen_at` (TIMESTAMPTZ), `created_at`, `updated_at`.
7. **`miniapp_sessions`**:
   - `id` (UUID PK), `telegram_id` (BIGINT FK `telegram_users.telegram_id`), `bot_id` (BIGINT FK `tenants.bot_id`), `init_data_hash` (TEXT), `device_info` (JSONB), `created_at`, `expires_at` (TIMESTAMPTZ DEFAULT NOW() + 24 HOURS).
8. **`rental_invoices`**:
   - `id` (UUID PK), `bot_id` (BIGINT FK `tenants.bot_id`), `plan_id` (UUID FK `plans.id`), `amount` (INTEGER), `status` (invoice_status: `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`), `qris_chat_id` (BIGINT), `qris_message_id` (BIGINT), `notification_sent` (BOOLEAN DEFAULT FALSE), `qris_deleted` (BOOLEAN DEFAULT FALSE), `paid_at` (TIMESTAMPTZ), `created_at`, `updated_at`.

### 7.2 WhatsApp Rental Supabase Database
1. **`managed_groups`**:
   - `id` (BIGINT / UUID PK), `store_group_id` (TEXT), `target_group_id` (TEXT), `group_name` (TEXT), `renter_name` (TEXT), `user_jid` (TEXT), `is_active` (BOOLEAN DEFAULT TRUE), `paid_until` (DATE / TIMESTAMPTZ), `joined_at`, `updated_at`.
2. **`payments`**:
   - `id` (UUID PK), `target_group_id` (TEXT), `amount` (NUMERIC), `status` (TEXT - `approved`, `pending`, `rejected`), `created_at`.

### 7.3 RNF Shop Finance Supabase Database (`rnfshop_supabase_schema.sql`)
1. **`apps`** (Katalog Aplikasi / Produk Digital Master):
   - `id` (UUID PK DEFAULT `gen_random_uuid()`), `name` (TEXT NOT NULL UNIQUE), `icon_url` (TEXT NULL), `is_active` (BOOLEAN DEFAULT TRUE), `created_by` (UUID NULL), `updated_by` (UUID NULL), `created_at`, `updated_at`.
2. **`transactions`** (Buku Besar Mutasi & Transaksi Keuangan Toko):
   - `id` (UUID PK DEFAULT `gen_random_uuid()`), `trx_date` (DATE NOT NULL), `trx_type` (ENUM: `incoming`, `outgoing`), `app_id` (UUID FK `apps.id` ON DELETE CASCADE), `customer_name` (TEXT NOT NULL), `amount` (NUMERIC >= 0), `fee_qris` (NUMERIC DEFAULT 0), `net_amount` (NUMERIC >= 0), `payment_method` (TEXT DEFAULT 'QRIS'), `note` (TEXT NULL), `is_synced` (BOOLEAN DEFAULT FALSE), `created_at`, `updated_at`.
3. **`transactions_view`** (View Pendukung Relasional):
   - Query gabungan `transactions` dengan `apps.name` (`app_name`) untuk penyajian data instan tanpa join client-side yang berulang.
4. **`allowed_emails`** (Arsip Whitelist Akses):
   - `email` (TEXT PK), `role` (TEXT), `is_active` (BOOLEAN), `created_at`.

### 7.4 Stored Procedures & Database RPC Functions
- **`process_renewal_payment(p_invoice_id UUID, p_amount INT) -> JSONB`**:
  - Mengunci row invoice dengan `FOR UPDATE`.
  - Menerima perpanjangan dari invoice berstatus `PENDING` atau `EXPIRED`.
  - Menghitung tanggal expired baru selaras **00:00:00 WIB** dengan memperhitungkan GREATEST(current_expiry, now) + durasi paket sewa (+ 1 hari bonus bila lewat tengah malam).
  - Meng-upsert data ke tabel `subscriptions` dan memperbarui `tenants.status = 'ACTIVE'`.
  - Menghandle skenario idempoten (`already_processed`) dengan mengembalikan metadata bot untuk pengulangan notifikasi/penghapusan QRIS.
- **`sync_expired_tenants() -> TABLE(bot_id BIGINT)`**:
  - Menandai subscription yang telah melewati masa aktif menjadi `EXPIRED`.
  - Menandai status tenant menjadi `EXPIRED` bila seluruh subscription-nya sudah lewat waktu.
  - Mengembalikan daftar `bot_id` yang statusnya berubah agar caller di API Gateway dapat mengirimkan push invalidate callback ke bot server terkait.
- **`get_master_stats() -> JSON`**:
  - Menghitung metrik analitik dashboard secara ringkas dan efisien (total tenant, tenant aktif valid kalender, tenant expired, segera expired, total omzet sewa PAID, sesi aktif, total pengguna Telegram).
- **`cleanup_expired_sessions() -> INTEGER`**:
  - Membersihkan record `miniapp_sessions` yang masa berlakunya telah habis (`expires_at < NOW()`).

---

## 8. Frontend Interface & Module Breakdown

### 8.1 Buyer Mini App (`public/index.html` & `public/js/buyer/`)
- **`buyer.js` / `buyer-main.js`**:
  - Lifecycle initialization Mini App Telegram.
  - Dynamic typewriter animated search placeholder (`getPlaceholderPhrases`, `stepRunningPlaceholder`).
  - Rendering kartu produk responsif dengan badge ketersediaan stok.
  - Detail modal produk, pemilih varian aktif, dan kalkulator harga grosir (*wholesale discount table*).
  - Pengecekan profil buyer via relay backend dan checkout pesanan.
- **`public/js/shared/`**:
  - `store.js`: State manager katalog, detail produk, cache tenant config, dan riwayat pesanan.
  - `theme.js`: Pengendali tema Dark/Light mode sinkron dengan tema Telegram client.
  - `utils.js`: Helper format mata uang Rupiah (`formatRupiah`), sanitasi HTML (`escapeHtml`), dan notifikasi toast.

### 8.2 Tenant Admin Portal (`public/admin.html` & `public/js/tenant-admin/`)
- **`adminProducts.js`**:
  - CRUD katalog produk toko tenant.
  - Form builder multi-varian interaktif.
  - Form builder tier harga grosir bertingkat (min qty -> harga grosir).
- **`adminStock.js`**:
  - Pengelolaan stok barang per varian.
  - Upload batch file `.txt` atau paste teks dengan filter otomatis item duplikat.
  - Hapus stok satuan atau bersihkan seluruh stok varian.

### 8.3 Master Super-Dashboard (`public/master-dashboard.html`, `public/js/master/`, & `public/js/rnfshop/`)
- **`masterDashboard.js`**:
  - Pengendali utama Super Dashboard.
  - Mode Switcher: Berganti antara `Rental SaaS Mode` dan `Shop Finance Mode`.
  - Modul Rental Telegram: Tabel tenant, kontrol aksi perpanjangan sewa (+30/custom hari), suspend/activate/ban/delete, invalidate cache, sync expired manual, dan modal generator pengingat Markdown Telegram.
  - Modul Rental WhatsApp: Tabel grup WA (`managed_groups`), perpanjangan masa aktif sewa, toggle status aktif, dan generator pesan WhatsApp.
- **`public/js/rnfshop/` (Modul Finansial RNF Shop)**:
  - `dashboard.js`: Inisialisasi tampilan overview finansial, kalkulasi laba bersih, chart tren pemasukan/pengeluaran, dan rekapitulasi per aplikasi digital.
  - `transactions.js`: Tabel mutasi transaksi finansial, filter multi-parameter, pagination, form tambah/edit transaksi, dan aksi hapus.
  - `import.js`: Parser mutasi/struk bank & QRIS batch cerdas. Deteksi baris tanggal, nama, amount, fee QRIS, net amount, alias mapping ke master aplikasi, dan tabel pratinjau sebelum batch insert.
  - `apps.js`: Pengelolaan katalog master aplikasi digital (CRUD apps).
  - `sheets.js`: Integrasi pratinjau sinkronisasi Google Sheets.
  - `apiClient.js` / `supabaseClient.js`: Client gateway komunikasi backend finansial terlindungi `X-Admin-Secret`.

---

## 9. Deployment, Hosting & Environment Configuration

### 9.1 Environment Variables Required (Vercel)
```env
# =========================================================
# Vercel Environment Variables (Web App + API Gateway)
# =========================================================

# ========= Master Xoftware Pay Config =========
XOFTWARE_MERCHANT_ID=your_master_xoftware_merchant_id
XOFTWARE_API_KEY=your_master_xoftware_api_key
XOFTWARE_BASE_URL=https://payment1.xoftware.id
SAAS_XOFTWARE_WEBHOOK_SECRET=your_master_xoftware_webhook_hmac_secret

# ========= Master Supabase (SERVER ONLY) =========
MASTER_SUPABASE_URL=https://your_master_project.supabase.co
MASTER_SUPABASE_SERVICE_KEY=your_master_service_role_key

# ========= WhatsApp Supabase (SERVER ONLY) =========
WA_SUPABASE_URL=https://your_wa_project.supabase.co
WA_SUPABASE_SERVICE_KEY=your_wa_service_role_key

# ========= RNF Shop Supabase (SERVER ONLY) =========
RNFSHOP_SUPABASE_URL=https://your_rnfshop_project.supabase.co
RNFSHOP_SUPABASE_ANON_KEY=your_rnfshop_anon_key
RNFSHOP_SUPABASE_SERVICE_KEY=your_rnfshop_service_role_key

# ========= Secrets & Authentication =========
INTERNAL_API_SECRET=your_32byte_hex_shared_secret
ADMIN_DASHBOARD_SECRET=your_secure_admin_password_secret
SAAS_WEBHOOK_SECRET=your_saas_webhook_token_secret
CRON_SECRET=your_vercel_cron_bearer_secret
```

### 9.2 Vercel Configuration (`vercel.json`)
- **Clean URLs**: `true`.
- **Redirects**: `/public/master-dashboard.html` dan `/master-dashboard.html` diarahkan secara permanen (301) ke `/master`.
- **Rewrites**:
  - `/master` -> `/public/master-dashboard.html`
  - `/admin` -> `/public/admin.html`
  - `/((?!api/).*)` -> `/public/$1`
- **Security & Cache Headers**:
  - `/api/(.*)`: `Cache-Control: no-store`, mengizinkan header `Content-Type, X-Bot-Id, X-Timestamp, X-Signature, X-Telegram-Init-Data, X-Admin-Secret`.
  - `/(fonts|webfonts)/(.*)`: `Cache-Control: public, max-age=31536000, immutable`.
  - `/images/(.*)`: `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`.
  - `/(style|js)/(.*)`: `Cache-Control: public, max-age=0, must-revalidate`.
- **Crons Terjadwal**:
  - Path: `/api/admin/cron-expire`
  - Schedule: `0 17 * * *` (Pukul 00:00:00 WIB setiap hari).

---

## 10. Codebase Structure & Directory Map

```
Web App/
├── api/
│   ├── _lib/
│   │   ├── hmacAuth.js              # Verifikasi HMAC-SHA256 bot tenant (botId bound + anti-replay)
│   │   ├── masterSupabase.js        # Supabase client singleton untuk Master DB
│   │   ├── response.js              # Standarisasi JSON response helper (success, error, cors)
│   │   ├── rnfSupabase.js           # Supabase client singleton untuk RNF Shop DB
│   │   ├── rnfshop-handler.js       # Handler gateway keuangan RNF Shop (overview, trxs, apps, import)
│   │   ├── telegramAuth.js          # Validator Telegram WebApp initData + in-memory token cache
│   │   ├── wa-groups-handler.js     # Handler gateway rental grup bot WhatsApp (managed_groups)
│   │   ├── waSupabase.js            # Supabase client singleton untuk WhatsApp DB
│   │   └── wibDate.js               # Helper kalkulasi tanggal & selisih hari WIB (Asia/Jakarta)
│   ├── admin/
│   │   └── [resource].js            # Consolidated router admin (/stats, /tenants, /subscriptions, /wa-groups, /rnfshop, /cron-expire)
│   ├── tenant/
│   │   ├── register.js              # Pendaftaran tenant bot baru
│   │   ├── subscription.js          # Cek subscription aktif (GET) & pembuatan QRIS perpanjangan sewa (POST)
│   │   ├── subscription/
│   │   │   └── [action].js          # Sub-aksi sewa: confirm-payment, mark-notified, update-qris-info
│   │   └── validate.js              # Pengecekan status lisensi aktif bot tenant
│   ├── webapp/
│   │   ├── admin-dashboard.js       # Relay ringkasan statistik toko bot untuk admin toko
│   │   ├── admin-products.js        # Relay CRUD katalog produk & harga grosir toko
│   │   ├── admin-stock.js           # Relay manajemen stok massal & varian toko
│   │   ├── checkout.js              # Relay profil saldo/order buyer (GET) & order checkout (POST)
│   │   ├── init.js                  # Inisialisasi sesi Mini App pelanggan + registrasi telegram_users
│   │   └── tenant-config.js         # Pengambilan konfigurasi publik toko (anon_key) + foto profil bot
│   └── webhook/
│       └── xoftware-renewal.js      # Callback webhook Xoftware Pay + reverse verification + atomic RPC
├── public/
│   ├── admin.html                   # Antarmuka Admin Toko Tenant (Katalog & Stok)
│   ├── index.html                   # Antarmuka Storefront Buyer Telegram Mini App
│   ├── master-dashboard.html        # Antarmuka Master SaaS Super-Dashboard (Rental SaaS & Shop Finance)
│   ├── favicon.svg                  # Favicon aplikasi
│   ├── index.css                    # Tailwind CSS source input
│   ├── style/
│   │   └── style.css                # Minified output Tailwind CSS v4
│   ├── js/
│   │   ├── buyer/
│   │   │   ├── buyer-main.js        # Entrypoint buyer app
│   │   │   └── buyer.js             # Logika interaktif storefront buyer
│   │   ├── master/
│   │   │   ├── masterDashboard.js   # Logika master dashboard controller
│   │   │   └── masterDashboard.min.js
│   │   ├── rnfshop/                 # Modul Finansial & Operasional RNF Shop
│   │   │   ├── apiClient.js         # API gateway fetch client
│   │   │   ├── apps.js              # Manajemen aplikasi digital
│   │   │   ├── config.js            # Konfigurasi frontend shop
│   │   │   ├── dashboard.js         # Overview metrik & analitik laba bersih
│   │   │   ├── import.js            # Parser struk & mutasi bank batch
│   │   │   ├── main.js              # Controller modul shop
│   │   │   ├── mockData.js          # Mock data dev/testing
│   │   │   ├── sheets.js            # Integrasi Google Sheets
│   │   │   ├── supabaseClient.js    # Client supabase helper
│   │   │   ├── transactions.js      # CRUD & pagination transaksi
│   │   │   └── utils.js             # Formatting & helper finansial
│   │   ├── shared/
│   │   │   ├── store.js             # State management buyer/tenant
│   │   │   ├── supabaseClient.js    # Client dynamic initialization
│   │   │   ├── theme.js             # Theme switcher dark/light
│   │   │   └── utils.js             # Utility helpers
│   │   └── tenant-admin/
│   │       ├── admin-main.js        # Entrypoint tenant admin
│   │       ├── adminProducts.js     # Manajemen produk & wholesale
│   │       └── adminStock.js        # Manajemen stok & deduplikasi
├── master_supabase_schema.sql       # Skema DDL lengkap Master Supabase (v2) + Stored Procedures
├── rnfshop_supabase_schema.sql      # Skema DDL lengkap RNF Shop Finance Database
├── package.json                     # Konfigurasi dependencies & build scripts
├── vercel.json                      # Konfigurasi hosting Vercel (routing, rewrites, headers, crons)
├── prd.md                           # Product Requirements Document (Dokumen Ini)
└── README.md                        # Dokumentasi ringkas repositori
```

---

## 11. Maintenance, Testing & Verification Protocol

1. **Verifikasi Integritas Arsitektur (Knowledge Graph & Graphify)**:
   - Jalankan `code-review-graph status` dan `code-review-graph update` untuk memastikan seluruh relasi simbol kode dan eksekusi flow terindeks dengan benar.
   - Jalankan `graphify update .` untuk memperbarui topologi graf kode setiap kali ada penambahan file arsitektural baru.
2. **Pengujian Kriptografis HMAC & Signature**:
   - Uji verifikasi endpoint `/api/tenant/*` dengan timestamp kadaluwarsa (> 5 menit) untuk memastikan *replay attack prevention* berfungsi dengan tepat.
   - Uji payload dengan ketidakcocokan `botId` di signature untuk memvalidasi *bot-id binding*.
3. **Pengujian Atomisitas Pembayaran (Stres Webhook)**:
   - Validasi bahwa pemanggilan ganda pada webhook `/api/webhook/xoftware-renewal` dengan order ID yang sama mengembalikan status `already_processed` tanpa menambah hari sewa ganda.
   - Uji pembayaran pada invoice berstatus `EXPIRED` untuk memverifikasi pemulihan masa sewa otomatis (*recovered from expired*).
4. **Verifikasi Konsistensi Kalender WIB**:
   - Pastikan tanggal kadaluwarsa hasil kalkulasi `calcRenewalExpiryWIB` dan RPC `process_renewal_payment` selalu mengarah ke jam `17:00:00Z` UTC (tepat pukul 00:00:00 WIB).
5. **Verifikasi Kompatibilitas Browser & Telegram WebApp**:
   - Pastikan Mini App berjalan mulus pada platform Telegram Android, iOS, Desktop, dan Web tanpa runtime error.
