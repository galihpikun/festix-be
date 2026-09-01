# Festix Backend

Backend platform ticketing Festix untuk manajemen event, user authentication, organizer verification, dan event approval. Aplikasi dibangun dengan NestJS, TypeScript, Prisma ORM, dan PostgreSQL.

## Deskripsi Proyek

Festix Backend adalah backend untuk sistem ticketing yang memungkinkan:

- **User Management**: Registrasi, autentikasi, verifikasi email dengan OTP
- **Event Management**: Organizer dapat membuat dan mengelola event, admin me-review dan approve event
- **Organizer Profiles**: Organizer dapat mendaftar dengan verifikasi dokumen lengkap
- **Event Categories**: Pengorganisasian event berdasarkan kategori
- **Image Management**: Upload cover image dan venue image untuk event menggunakan Cloudinary

Fitur booking tiket, payment, dan refund sudah ter-design di database schema namun masih dalam tahap pengembangan endpoint.

## Fitur yang tersedia

- [x] Registrasi pengguna
- [x] Verifikasi email menggunakan OTP
- [x] Login menggunakan JWT
- [x] Mendapatkan profil pengguna yang sedang login
- [x] Lupa password, verifikasi OTP, dan reset password
- [x] Melihat daftar kategori
- [x] Admin membuat, mengubah, dan menghapus kategori
- [x] Pengajuan profil organizer dengan dokumen
- [x] Upload dokumen organizer ke Cloudinary
- [x] Organizer melihat profil dan status pengajuan sendiri
- [x] Admin melihat daftar/detail pengajuan organizer
- [x] Admin menyetujui atau menolak pengajuan organizer
- [x] Membuat event oleh organizer
- [x] Update event oleh organizer
- [x] Submit event untuk review admin
- [x] Admin review dan approve/reject event
- [x] Melihat daftar event publik
- [x] Melihat detail event
- [x] Upload cover image dan venue image ke Cloudinary
- [x] Validasi request dengan `ValidationPipe`
- [x] Proteksi endpoint dengan JWT dan role `ADMIN`

Database models sudah tersedia untuk ticket types, orders, refunds, dan event staff (relasi), namun endpoints untuk fitur-fitur tersebut masih dalam tahap development.

## Teknologi

- Node.js
- NestJS 11
- TypeScript
- Prisma ORM 7 dengan PostgreSQL adapter
- PostgreSQL
- Express
- Jest
- ESLint dan Prettier

## Package yang ter-install

### Dependencies

- `@nestjs/common`, `@nestjs/core`, `@nestjs/jwt`, `@nestjs/passport`, `@nestjs/platform-express`
- `@prisma/adapter-pg`, `@prisma/client`
- `bcrypt`, `class-transformer`, `class-validator`
- `cloudinary`, `cors`, `dotenv`
- `jsonwebtoken`, `nodemailer`, `passport`, `passport-jwt`
- `pg`, `reflect-metadata`, `rxjs`, `slugify`

### Dev dependencies

- `@eslint/eslintrc`, `@eslint/js`
- `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`
- `@types/express`, `@types/jest`, `@types/multer`, `@types/node`, `@types/nodemailer`, `@types/pg`, `@types/supertest`
- `eslint`, `eslint-config-prettier`, `eslint-plugin-prettier`, `globals`
- `jest`, `prettier`, `prisma`, `source-map-support`, `supertest`
- `ts-jest`, `ts-loader`, `ts-node`, `tsconfig-paths`
- `typescript`, `typescript-eslint`

## Environment variable

Buat file `.env` di root project. README ini hanya mencantumkan nama variabel; isi nilai dan kredensial disimpan secara lokal.

- [x] `DATABASE_URL` - koneksi PostgreSQL untuk Prisma
- [x] `JWT_SECRET` - secret untuk JWT
- [x] `MAIL_USER` - akun Gmail pengirim OTP
- [x] `MAIL_PASSWORD` - password atau app password akun email
- [x] `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- [x] `CLOUDINARY_API_KEY` - Cloudinary API key
- [x] `CLOUDINARY_API_SECRET` - Cloudinary API secret
- [ ] `PORT` - port server, opsional; default `3000`

## Instalasi

```bash
npm install
```

## Database

Generate Prisma Client dan jalankan migration:

```bash
npx prisma generate
npx prisma migrate dev
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

## Endpoint utama

Base URL default: `http://localhost:3000`

### Auth

| Method | Endpoint                       | Deskripsi                     | Auth |
| ------ | ------------------------------ | ----------------------------- | ---- |
| `POST` | `/auth/register`               | Registrasi user baru          | None |
| `POST` | `/auth/verify-email`           | Verifikasi email dengan OTP   | None |
| `POST` | `/auth/login`                  | Login dengan email & password | None |
| `POST` | `/auth/forgot-password`        | Meminta OTP reset password    | None |
| `POST` | `/auth/verify-forgot-password` | Verifikasi OTP reset password | None |
| `POST` | `/auth/reset-password`         | Mengganti password            | None |
| `GET`  | `/auth/me`                     | Profil user terautentikasi    | JWT  |

### Categories

| Method   | Endpoint          | Deskripsi                  | Auth       |
| -------- | ----------------- | -------------------------- | ---------- |
| `GET`    | `/categories`     | Daftar kategori            | JWT        |
| `POST`   | `/categories`     | Membuat kategori (admin)   | JWT, ADMIN |
| `PUT`    | `/categories/:id` | Mengubah kategori (admin)  | JWT, ADMIN |
| `DELETE` | `/categories/:id` | Menghapus kategori (admin) | JWT, ADMIN |

### Organizer

| Method  | Endpoint                       | Deskripsi                      | Auth       |
| ------- | ------------------------------ | ------------------------------ | ---------- |
| `POST`  | `/organizer/apply`             | Mengajukan organizer + dokumen | JWT        |
| `GET`   | `/organizer/me`                | Profil organizer sendiri       | JWT        |
| `GET`   | `/organizer/admin`             | Daftar pengajuan organizer     | JWT, ADMIN |
| `GET`   | `/organizer/admin/:id`         | Detail pengajuan organizer     | JWT, ADMIN |
| `PATCH` | `/organizer/admin/:id/approve` | Menyetujui pengajuan organizer | JWT, ADMIN |
| `PATCH` | `/organizer/admin/:id/reject`  | Menolak pengajuan organizer    | JWT, ADMIN |

### Events

| Method  | Endpoint                    | Deskripsi                 | Auth       |
| ------- | --------------------------- | ------------------------- | ---------- |
| `GET`   | `/events`                   | Daftar event publik       | None       |
| `GET`   | `/events/:id`               | Detail event publik       | None       |
| `POST`  | `/events`                   | Membuat event (organizer) | JWT        |
| `PATCH` | `/events/:id`               | Update event (organizer)  | JWT        |
| `PATCH` | `/events/:id/submit`        | Submit event untuk review | JWT        |
| `GET`   | `/events/admin`             | Daftar event untuk admin  | JWT, ADMIN |
| `GET`   | `/events/admin/:id`         | Detail event untuk admin  | JWT, ADMIN |
| `PATCH` | `/events/admin/:id/approve` | Approve event (admin)     | JWT, ADMIN |
| `PATCH` | `/events/admin/:id/reject`  | Reject event (admin)      | JWT, ADMIN |

## Script yang tersedia

- `npm run start` - menjalankan aplikasi
- `npm run start:dev` - menjalankan aplikasi dalam watch mode
- `npm run start:debug` - menjalankan aplikasi dalam debug watch mode
- `npm run build` - build aplikasi
- `npm run lint` - menjalankan ESLint
- `npm run format` - memformat source code
- `npm run test` - unit test
- `npm run test:watch` - unit test dalam watch mode
- `npm run test:cov` - unit test dengan coverage
- `npm run test:e2e` - end-to-end test

## Struktur project

- `src/` - source code NestJS dan modul fitur
  - `auth/` - modul autentikasi, registrasi, login, JWT, OTP
  - `categories/` - modul kategori event
  - `organizer/` - modul profil organizer dan verifikasi dokumen
  - `events/` - modul pembuatan, pengelolaan, dan browsing event
  - `mail/` - modul email notification dan OTP sender
  - `cloudinary/` - modul upload gambar ke Cloudinary
  - `prisma/` - modul database service
- `prisma/` - schema dan migration Prisma
- `generated/prisma/` - Prisma Client hasil generate
- `test/` - konfigurasi dan file end-to-end test

## License

Project ini belum memiliki lisensi.
