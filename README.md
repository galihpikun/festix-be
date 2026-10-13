# Festix Backend

Backend untuk platform ticketing Festix yang dibangun dengan NestJS, TypeScript, Prisma ORM, dan PostgreSQL. Project ini berfokus pada autentikasi pengguna, pengajuan organizer, pengelolaan event, kategori event, dan upload media untuk kebutuhan event.

## Tentang proyek

Festix Backend adalah API backend untuk sistem ticketing event yang mencakup:

- registrasi dan login pengguna
- verifikasi email dan reset password dengan OTP
- kategori event
- pengajuan dan review profil organizer
- pembuatan, update, review, dan approval event oleh organizer serta admin
- upload gambar event dan dokumen organizer ke Cloudinary
- manajemen ticket type per event

Catatan: model database untuk order, refund, issued ticket, serta relasi staff event sudah tersedia di Prisma schema, tetapi API untuk fitur-fitur tersebut masih belum sepenuhnya dikembangkan/di-expose di backend ini.

## Fitur yang sudah tersedia

- [x] Registrasi user
- [x] Verifikasi email dengan OTP
- [x] Login user dengan JWT
- [x] Mendapatkan data user yang sedang login
- [x] Lupa password dan reset password
- [x] Manajemen kategori event
- [x] Pengajuan organizer dengan upload dokumen
- [x] Melihat profil organizer sendiri
- [x] Admin melihat daftar dan detail pengajuan organizer
- [x] Admin menyetujui atau menolak organizer
- [x] Membuat event oleh organizer
- [x] Update event oleh organizer
- [x] Submit event untuk review admin
- [x] Admin melihat daftar dan detail event
- [x] Admin approve/reject event
- [x] Melihat daftar event publik dan detail event
- [x] Upload cover image dan venue image ke Cloudinary
- [x] Upload dokumen organizer ke Cloudinary
- [x] Validasi request menggunakan ValidationPipe
- [x] Autentikasi JWT dan role-based access control
- [x] CRUD ticket type per event
- [x] Membuat order dengan reservasi quota ticket
- [x] Melihat daftar dan detail order milik user
- [x] Membuat payment session melalui Xendit
- [x] Menerima webhook payment completed dan payment expired dari Xendit
- [x] Penerbitan e-ticket (issued tickets) otomatis setelah pembayaran berhasil
- [x] Melihat daftar tiket e-ticket milik user (`/issued-tickets/my`) dan detail tiket
- [x] Admin melihat daftar dan detail semua issued ticket (`/issued-tickets/admin`)
- [x] Validasi dan lookup tiket oleh staff (`/ticket-redemption/lookup`)
- [x] Penebusan/check-in tiket (redemption) atomik & race-safe oleh staff (`/ticket-redemption/redeem`)
- [x] Staff melihat daftar event yang ditugaskan (`/staff/events`)
- [x] Staff dashboard per event dengan ringkasan statistik & riwayat check-in (`/staff/events/:eventId/dashboard`)
- [x] Manajemen staf oleh admin (list staf, detail staf, penugasan ke event, hapus penugasan)
- [x] Manajemen user oleh admin (list user, ganti role, suspend/unsuspend)
- [x] Admin dashboard agregat metrik platform (`/admin/dashboard`)
- [x] Pencatatan audit log terintegrasi untuk aksi admin dan staf

## Stack teknologi

- Node.js
- NestJS 11
- TypeScript
- Prisma ORM 7
- PostgreSQL
- Express
- JWT + Passport
- Cloudinary
- Nodemailer
- Jest
- ESLint + Prettier

## Struktur project

```text
festix-be/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── generated/
│   └── prisma/
├── src/
│   ├── app.module.ts
│   ├── app.controller.ts
│   ├── app.service.ts
│   ├── auth/
│   ├── categories/
│   ├── cloudinary/
│   ├── events/
│   ├── mail/
│   ├── organizer/
│   ├── orders/
│   ├── payments/
│   ├── issued-tickets/
│   ├── ticket-redemption/
│   ├── staff/
│   ├── users/
│   ├── admin-dashboard/
│   ├── audit-logs/
│   ├── prisma/
│   └── ticket-types/
├── test/
├── .env.example (jika digunakan)
├── package.json
├── tsconfig.json
├── nest-cli.json
├── prisma.config.ts
├── README.md
└── eslint.config.mjs
```

## Modul utama

- `src/auth` : registrasi, login, forgot password, verify email, JWT, role guard
- `src/categories` : manajemen kategori event
- `src/events` : pembuatan event, update event, submit review, approval admin
- `src/organizer` : pengajuan organizer, upload dokumen, review admin
- `src/orders` : pembuatan order, reservasi quota ticket, dan riwayat order user
- `src/payments` : pembuatan payment session Xendit dan webhook status pembayaran
- `src/issued-tickets` : penerbitan tiket, akses e-ticket user, dan review tiket oleh admin
- `src/ticket-redemption` : lookup validasi tiket dan check-in/redemption race-safe oleh staff
- `src/staff` : manajemen staf oleh admin, event staf, dan dashboard staf per event
- `src/users` : manajemen user platform, update role, suspend/unsuspend akun oleh admin
- `src/admin-dashboard` : ringkasan metrik dan statistik platform untuk admin
- `src/audit-logs` : pencatatan riwayat audit aktivitas admin dan staf
- `src/ticket-types` : CRUD tiket per event
- `src/cloudinary` : upload media ke Cloudinary
- `src/mail` : pengiriman email OTP dan notifikasi
- `src/prisma` : service Prisma database

## Environment variable

Buat file `.env` di root project dan isi variabel berikut sesuai environment lokal Anda:

```env
DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<database>?schema=public"
JWT_SECRET="your_jwt_secret"
MAIL_USER="your_email@gmail.com"
MAIL_PASSWORD="your_email_app_password"
CLOUDINARY_CLOUD_NAME="your_cloud_name"
CLOUDINARY_API_KEY="your_api_key"
CLOUDINARY_API_SECRET="your_api_secret"
XENDIT_SECRET_KEY="your_xendit_secret_key"
XENDIT_WEBHOOK_TOKEN="your_xendit_webhook_token"
PORT=3000
```

## Persiapan instalasi

```bash
npm install
```

## Setup database Prisma

Setelah konfigurasi `DATABASE_URL`, jalankan:

```bash
npx prisma generate
npx prisma migrate dev
```

Jika ingin melihat database dengan Prisma Studio:

```bash
npx prisma studio
```

## Menjalankan aplikasi

Development:

```bash
npm run start:dev
```

Production:

```bash
npm run build
npm run start:prod
```

## Script yang tersedia

```bash
npm run start
npm run start:dev
npm run start:debug
npm run build
npm run lint
npm run format
npm run test
npm run test:watch
npm run test:cov
npm run test:debug
npm run test:e2e
```

## Base URL

```text
http://localhost:3000
```

## Endpoint API

### Auth

| Method | Endpoint                       | Deskripsi                       | Auth |
| ------ | ------------------------------ | ------------------------------- | ---- |
| POST   | `/auth/register`               | Registrasi user baru            | None |
| POST   | `/auth/verify-email`           | Verifikasi email dengan OTP     | None |
| POST   | `/auth/login`                  | Login user                      | None |
| POST   | `/auth/forgot-password`        | Request reset password          | None |
| POST   | `/auth/verify-forgot-password` | Verifikasi OTP forgot password  | None |
| POST   | `/auth/reset-password`         | Reset password                  | None |
| GET    | `/auth/me`                     | Data pengguna yang sedang login | JWT  |

### Categories

| Method | Endpoint          | Deskripsi       | Auth        |
| ------ | ----------------- | --------------- | ----------- |
| GET    | `/categories`     | Daftar kategori | JWT         |
| POST   | `/categories`     | Buat kategori   | JWT + ADMIN |
| PUT    | `/categories/:id` | Edit kategori   | JWT + ADMIN |
| DELETE | `/categories/:id` | Hapus kategori  | JWT + ADMIN |

### Organizer

| Method | Endpoint                       | Deskripsi                              | Auth        |
| ------ | ------------------------------ | -------------------------------------- | ----------- |
| POST   | `/organizer/apply`             | Ajukan profil organizer dengan dokumen | JWT         |
| GET    | `/organizer/me`                | Profil organizer sendiri               | JWT         |
| GET    | `/organizer/admin`             | Daftar pengajuan organizer             | JWT + ADMIN |
| GET    | `/organizer/admin/:id`         | Detail pengajuan organizer             | JWT + ADMIN |
| PATCH  | `/organizer/admin/:id/approve` | Approve organizer                      | JWT + ADMIN |
| PATCH  | `/organizer/admin/:id/reject`  | Reject organizer                       | JWT + ADMIN |

### Events

| Method | Endpoint                    | Deskripsi                       | Auth        |
| ------ | --------------------------- | ------------------------------- | ----------- |
| GET    | `/events`                   | Daftar event publik             | None        |
| GET    | `/events/:id`               | Detail event publik             | None        |
| POST   | `/events`                   | Buat event                      | JWT         |
| PATCH  | `/events/:id`               | Update event                    | JWT         |
| PATCH  | `/events/:id/submit`        | Submit event untuk review admin | JWT         |
| GET    | `/events/admin`             | Daftar event untuk admin        | JWT + ADMIN |
| GET    | `/events/admin/:id`         | Detail event untuk admin        | JWT + ADMIN |
| PATCH  | `/events/admin/:id/approve` | Approve event                   | JWT + ADMIN |
| PATCH  | `/events/admin/:id/reject`  | Reject event                    | JWT + ADMIN |

### Ticket Types

| Method | Endpoint                       | Deskripsi                     | Auth |
| ------ | ------------------------------ | ----------------------------- | ---- |
| GET    | `/ticket-types/event/:eventId` | Daftar ticket type pada event | None |
| GET    | `/ticket-types/:id`            | Detail ticket type            | None |
| POST   | `/ticket-types/event/:eventId` | Tambah ticket type            | JWT  |
| PUT    | `/ticket-types/:id`            | Update ticket type            | JWT  |
| DELETE | `/ticket-types/:id`            | Hapus ticket type             | JWT  |

### Orders

| Method | Endpoint      | Deskripsi                         | Auth |
| ------ | ------------- | --------------------------------- | ---- |
| POST   | `/orders`     | Membuat order dan payment session | JWT  |
| GET    | `/orders`     | Melihat daftar order milik user   | JWT  |
| GET    | `/orders/:id` | Melihat detail order milik user   | JWT  |

### Payments

| Method | Endpoint            | Deskripsi                                 | Auth         |
| ------ | ------------------- | ----------------------------------------- | ------------ |
| POST   | `/payments/webhook` | Menerima webhook status pembayaran Xendit | Token Xendit |

### Issued Tickets

| Method | Endpoint                    | Deskripsi                               | Auth        |
| ------ | --------------------------- | --------------------------------------- | ----------- |
| GET    | `/issued-tickets/my`        | Melihat tiket saya yang aktif           | JWT         |
| GET    | `/issued-tickets/:id`       | Melihat detail tiket saya               | JWT         |
| GET    | `/issued-tickets/admin`     | Melihat daftar tiket semua user (Admin) | JWT + ADMIN |
| GET    | `/issued-tickets/admin/:id` | Melihat detail tiket untuk Admin        | JWT + ADMIN |

### Ticket Redemption

| Method | Endpoint                    | Deskripsi                               | Auth        |
| ------ | --------------------------- | --------------------------------------- | ----------- |
| POST   | `/ticket-redemption/lookup` | Validasi & lookup informasi tiket       | JWT + STAFF |
| POST   | `/ticket-redemption/redeem` | Check-in / redemption tiket (race-safe) | JWT + STAFF |

### Staff

| Method | Endpoint                           | Deskripsi                                      | Auth        |
| ------ | ---------------------------------- | ---------------------------------------------- | ----------- |
| GET    | `/staff/events`                    | Daftar event yang ditugaskan kepada staff      | JWT + STAFF |
| GET    | `/staff/events/:eventId/dashboard` | Dashboard event staff (statistik & ringkasan)  | JWT + STAFF |
| GET    | `/staff/admin`                     | Daftar staff platform (Admin)                  | JWT + ADMIN |
| GET    | `/staff/admin/event/:eventId`      | Daftar staff pada event tertentu               | JWT + ADMIN |
| GET    | `/staff/admin/:id`                 | Detail staf beserta event yang ditugaskan      | JWT + ADMIN |
| POST   | `/staff/admin/assign`              | Menugaskan user ber-role STAFF ke suatu event  | JWT + ADMIN |
| DELETE | `/staff/admin/assign/:id`          | Menghapus penugasan staf dari event            | JWT + ADMIN |

### Users Management

| Method | Endpoint                   | Deskripsi                                  | Auth        |
| ------ | -------------------------- | ------------------------------------------ | ----------- |
| GET    | `/users/admin`             | Daftar user platform                       | JWT + ADMIN |
| GET    | `/users/admin/:id`         | Detail user                                | JWT + ADMIN |
| PATCH  | `/users/admin/:id/role`    | Ubah role user                             | JWT + ADMIN |
| PATCH  | `/users/admin/:id/suspend` | Suspend user                               | JWT + ADMIN |
| PATCH  | `/users/admin/:id/unsuspend` | Batalkan suspend user                    | JWT + ADMIN |

### Admin Dashboard

| Method | Endpoint           | Deskripsi                                       | Auth        |
| ------ | ------------------ | ----------------------------------------------- | ----------- |
| GET    | `/admin/dashboard` | Mengambil data statistik & ringkasan platform   | JWT + ADMIN |

## Role yang dipakai

Project ini menggunakan role enum berikut di Prisma schema:

- `USER`
- `ADMIN`
- `STAFF`

Beberapa endpoint dilindungi dengan `JwtAuthGuard` dan role check via `RoleGuard`, terutama endpoint admin.

## Status proyek

Project ini masih dalam tahap pengembangan backend event ticketing. Fitur utama autentikasi, organizer, kategori, event, dan ticket type sudah tersedia, sementara fitur order, payment, refund, dan issued ticket masih berada pada tahap perencanaan/penyiapan integrasi lebih lanjut sesuai schema yang sudah dibuat.

### 80%% Work Progress

## Lisensi

Project ini belum memiliki lisensi resmi.
