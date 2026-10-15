# Panduan Deploy Game Remi Minuman (Vercel + Railway)

Game ini dirancang dengan arsitektur modern:
- **Frontend**: [index.html](file:///c:/xampp/htdocs/remi/index.html) (HTML, Bootstrap 5, jQuery, Socket.IO Client) dipasang di **Vercel** (Gratis).
- **Backend Multiplayer**: [server.js](file:///c:/xampp/htdocs/remi/server.js) (Node.js + Express + Socket.IO) dipasang di **Railway** (Mendukung WebSocket).

---

## BAGIAN 1: Deploy Backend ke Railway (Socket.IO)

Railway sangat cocok untuk Socket.IO karena mendukung protokol WebSocket secara penuh tanpa batasan serverless timeout.

### Langkah-langkah:
1. **Buat Repository di GitHub**:
   - Buat repo baru di GitHub Anda, misal: `remi-minuman`.
   - Masukkan file proyek ini (`server.js`, `package.json`, `.gitignore`, `index.html`) lalu push ke GitHub:
     ```bash
     git init
     git add .
     git commit -m "feat: multiplayer remi minuman"
     git branch -M main
     git remote add origin https://github.com/USERNAME/remi-minuman.git
     git push -u origin main
     ```
2. **Deploy di Railway**:
   - Buka [railway.com](https://railway.com) dan login menggunakan akun GitHub Anda.
   - Klik **"+ New Project"** -> Pilih **"Deploy from GitHub repo"**.
   - Pilih repository `remi-minuman` yang baru saja Anda buat.
   - Railway akan otomatis mendeteksi Node.js dari `package.json` dan menjalankan `npm start` (`node server.js`).
3. **Generate Domain Publik di Railway**:
   - Setelah project selesai di-build, klik service project Anda di dashboard Railway.
   - Masuk ke tab **"Settings"** -> scroll ke bagian **"Networking"** / **"Public Networking"**.
   - Klik **"Generate Domain"**.
   - Anda akan mendapatkan URL HTTPS publik, contohnya:
     `https://remi-minuman-production.up.railway.app`
   - *Simpan URL ini untuk dimasukkan ke game.*

---

## BAGIAN 2: Deploy Frontend HTML ke Vercel

Frontend HTML murni statis sehingga sangat cepat dan ringan di Vercel.

### Langkah-langkah:
1. Buka [vercel.com](https://vercel.com) dan login dengan akun GitHub Anda.
2. Klik **"Add New..."** -> **"Project"**.
3. Pilih repository `remi-minuman` dari daftar GitHub Anda.
4. Pada bagian **"Framework Preset"**, biarkan **Other** (karena HTML statis).
5. Klik **"Deploy"**.
6. Dalam hitungan detik Vercel akan memberikan link web Anda, misal:
   `https://remi-minuman.vercel.app`

---

## BAGIAN 3: Cara Bermain Bersama Teman

1. Buka link Vercel Anda di browser (HP / Laptop).
2. Klik tombol biru **"Mode Online Multiplayer"** di pojok kanan atas.
3. Masukkan URL server Railway Anda (misal `https://remi-minuman-production.up.railway.app`) dan nama Anda.
4. **Pemain 1 (Host)**:
   - Pilih tab **"Buat Room Baru"** -> Pilih jumlah kartu awal -> Klik **"Buat Room & Jadi Host"**.
   - Anda akan menerima **Kode Ruangan 5 Huruf** (contoh: `K7X9P`).
   - Berikan kode tersebut ke teman-teman Anda.
5. **Pemain 2 s/d 7 (Teman)**:
   - Buka link Vercel yang sama -> Klik **"Mode Online Multiplayer"**.
   - Masukkan URL server Railway yang sama.
   - Pilih tab **"Gabung Room"** -> Masukkan kode room `K7X9P` -> Klik **"Gabung ke Ruangan"**.
6. Setelah semua teman masuk ke room, Host cukup menekan tombol hijau **"Mulai Game Sekarang (Host)"**!
7. Permainan berjalan secara realtime sinkron antar semua pemain dengan aturan lengkap Remi Minuman Solo Raya!
