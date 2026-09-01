# Festix Backend

Backend platform ticketing Festix untuk autentikasi pengguna, pengelolaan kategori, dan proses pendaftaran organizer. Aplikasi dibangun dengan NestJS, TypeScript, Prisma ORM, dan PostgreSQL.

## Fitur yang tersedia

- [x] Registrasi pengguna
- [x] Verifikasi email menggunakan OTP
- [x] Login menggunakan JWT
- [x] Mendapatkan profil pengguna yang sedang login
- [x] Lupa password, verifikasi OTP, dan reset password
- [x] Melihat daftar kategori
- [x] Admin membuat, mengubah, dan menghapus kategori
- [x] Pengajuan profil organizer
- [x] Upload dokumen organizer ke Cloudinary
- [x] Organizer melihat profil dan status pengajuan sendiri
- [x] Admin melihat daftar/detail pengajuan organizer
- [x] Admin menyetujui atau menolak pengajuan organizer
- [x] Validasi request dengan `ValidationPipe`
- [x] Proteksi endpoint dengan JWT dan role `ADMIN`
- [x] Membuat dan mengelola event (organizer/admin)
- [x] Publish event untuk publik
- [x] Melihat detail event
- [x] Filter dan browse event berdasarkan kategori
- [x] Mengelola tipe tiket untuk event
- [x] Menampilkan tiket tersedia dan kuota
- [x] Pembelian tiket (order)
- [x] Pelacakan status pembayaran
- [x] Issuance tiket otomatis setelah pembayaran
- [x] Sistem refund dengan tracking status
- [x] Penugasan staff ke event
- [x] Upload gambar event dan venue ke Cloudinary
- [x] Email notification untuk berbagai event

## Database Model

Aplikasi menggunakan model data berikut:

- **User** - Data pengguna dengan role (USER, ADMIN, STAFF)
- **OrganizerProfile** - Profil organizer dengan detail organisasi dan bank
- **OrganizerDocument** - Dokumen verifikasi organizer (license, guarantee letter, dll)
- **Category** - Kategori event (musik, bisnis, edukasi, dll)
- **Event** - Detail event dengan cover image, tanggal, lokasi, dan status
- **EventStaff** - Junction table untuk menugaskan staff ke event
- **TicketType** - Jenis tiket untuk event dengan harga dan kuota
- **Order** - Pesanan/pembelian tiket oleh user
- **OrderItem** - Item individual dalam order
- **IssuedTicket** - Tiket yang diterbitkan dengan unique ticket code
- **Refund** - Permintaan refund untuk order
- **Otp** - OTP untuk verifikasi email atau reset password

Setiap model memiliki timestamp (createdAt, updatedAt) dan relasi yang sesuai.

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

| Method   | Endpoint                       | Keterangan                          |
| -------- | ------------------------------ | ----------------------------------- |
| `GET`    | `/`                            | Health check sederhana              |
| `GET`    | `/users`                       | Mendapatkan data user               |
| `POST`   | `/auth/register`               | Registrasi                          |
| `POST`   | `/auth/verify-email`           | Verifikasi email                    |
| `POST`   | `/auth/login`                  | Login                               |
| `POST`   | `/auth/forgot-password`        | Meminta OTP reset password          |
| `POST`   | `/auth/verify-forgot-password` | Verifikasi OTP reset password       |
| `POST`   | `/auth/reset-password`         | Mengganti password                  |
| `GET`    | `/auth/me`                     | Profil user terautentikasi          |
| `GET`    | `/categories`                  | Daftar kategori                     |
| `POST`   | `/categories`                  | Membuat kategori oleh admin         |
| `PUT`    | `/categories/:id`              | Mengubah kategori oleh admin        |
| `DELETE` | `/categories/:id`              | Menghapus kategori oleh admin       |
| `POST`   | `/organizer/apply`             | Mengajukan organizer dengan dokumen |
| `GET`    | `/organizer/me`                | Profil organizer sendiri            |
| `GET`    | `/organizer/admin`             | Daftar pengajuan untuk admin        |
| `GET`    | `/organizer/admin/:id`         | Detail pengajuan untuk admin        |
| `PATCH`  | `/organizer/admin/:id/approve` | Menyetujui pengajuan                |
| `PATCH`  | `/organizer/admin/:id/reject`  | Menolak pengajuan                   |
| `POST`   | `/events`                      | Membuat event (organizer)           |
| `GET`    | `/events`                      | Daftar event public                 |
| `GET`    | `/events/:id`                  | Detail event                        |
| `PUT`    | `/events/:id`                  | Update event (organizer/admin)      |
| `PATCH`  | `/events/:id/publish`          | Publish event                       |
| `DELETE` | `/events/:id`                  | Hapus event (organizer/admin)       |
| `POST`   | `/events/:id/staff`            | Tambah staff ke event               |
| `DELETE` | `/events/:id/staff/:staffId`   | Hapus staff dari event              |

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
