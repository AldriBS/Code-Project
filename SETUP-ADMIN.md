# 🔐 Panduan Setup Admin - Komatsu Flood Control System

## 📌 Quick Start - Setup Admin Pertama

### Metode 1: Via Firebase Console (Termudah)

1. **Buka Firebase Console:**
   - Kunjungi: https://console.firebase.google.com
   - Login dengan akun Google Anda
   - Pilih project Anda

2. **Tambah User (Jika belum ada):**
   - Klik menu **Authentication** (di sidebar kiri)
   - Tab **Users**
   - Klik **Add User**
   - Masukkan:
     - Email: `admin@example.com` (ganti dengan email Anda)
     - Password: Buat password yang kuat
   - Klik **Add User**

3. **Set sebagai Admin:**
   - Klik pada user yang baru dibuat
   - Scroll ke bawah, cari bagian **Custom claims**
   - Klik **Edit**
   - Masukkan JSON berikut:
   ```json
   {
     "admin": true,
     "role": "admin"
   }
   ```
   - Klik **Save**

4. **Deploy Firebase Rules:**
   - Klik menu **Realtime Database** → **Rules**
   - Copy isi file `firebase-rules-rbac.json` atau `firebase-rules-ultra-secure.json`
   - Paste dan klik **Publish**

5. **Login ke Web:**
   - Buka `login.html` di browser
   - Masukkan email dan password yang tadi dibuat
   - Login
   - Anda akan melihat badge **👑 Admin** di header

✅ **Selesai!** Sekarang Anda login sebagai Admin dengan full access.

---

### Metode 2: Via Script Node.js (Untuk Developer)

#### Prerequisites:
- Node.js sudah terinstall
- Firebase Service Account Key (download dari Firebase Console)

#### Langkah-langkah:

1. **Download Service Account Key:**
   - Firebase Console → Project Settings → Service Accounts
   - Klik **Generate new private key**
   - Save file sebagai `serviceAccountKey.json` di folder project
   - ⚠️ **JANGAN commit file ini ke git!**

2. **Jalankan script `set-first-admin.js`:**
   - Sudah tersedia di folder project
   - Edit file, ganti email dengan email Anda
   - Run:
   ```bash
   npm install firebase-admin
   node set-first-admin.js
   ```

3. **Login ke web** dengan email tersebut

---

## 👥 Cara Menambahkan Admin Baru (Setelah Ada Admin)

### Via Firebase Console (Sama seperti metode 1 di atas)

Ulangi langkah 2-3 dari Metode 1 untuk user baru.

---

### Via Cloud Functions (Advanced)

**Coming soon** - Memerlukan Firebase Functions deployment.

---

## 🧪 Testing

### Cek apakah sudah Admin:

1. Login ke web dashboard
2. Lihat header (pojok kanan atas)
3. Harus muncul:
   - Badge kuning **👑 Admin**
   - Email Anda
   - Tombol **Logout**

4. Cek auto-pump settings:
   - Toggle auto-pump harus **bisa diklik** (tidak disabled)
   - **TIDAK** ada badge **🔒 Admin Only**

### Jika Masih User Biasa (bukan Admin):

1. Badge hijau **👤 User**
2. Toggle auto-pump **disabled** (greyed out)
3. Ada badge **🔒 Admin Only** di auto-pump section
4. Muncul notifikasi: "You are logged in as User (Read-only for settings)"

---

## 🔑 Cara Menambahkan User Biasa (Non-Admin)

1. Firebase Console → Authentication → Add User
2. Masukkan email & password
3. **JANGAN** set custom claims (atau set sebagai `{"role": "user"}`)
4. User ini bisa:
   - ✅ Login ke web
   - ✅ Melihat dashboard
   - ✅ Control pump ON/OFF
   - ❌ Tidak bisa ubah auto-pump settings
   - ❌ Tidak bisa ubah konfigurasi

---

## ⚠️ Penting!

### Custom Claims Update:
Setelah menambahkan custom claims di Firebase Console:
1. User harus **logout** dari web
2. Kemudian **login ulang**
3. Baru custom claims akan terApply

### Security Rules:
Pastikan sudah deploy Firebase Rules dari file:
- `firebase-rules-rbac.json` (basic RBAC), atau
- `firebase-rules-ultra-secure.json` (enhanced security)

---

## 🆘 Troubleshooting

### "Permission Denied" setelah set admin
**Solusi:**
1. Logout dari web
2. Close browser
3. Buka browser baru
4. Login ulang
5. Custom claims harus sudah terApply

### Toggle auto-pump masih disabled untuk admin
**Solusi:**
1. Buka browser console (F12)
2. Check error messages
3. Pastikan custom claims sudah benar: `{"admin": true, "role": "admin"}`
4. Clear cache dan hard reload (Ctrl+Shift+R)

### Tidak bisa login sama sekali
**Solusi:**
1. Check Firebase Rules sudah di-publish
2. Check email & password benar
3. Check user ada di Authentication → Users
4. Check browser console untuk error

---

## 📧 Role Summary

| Role | Badge | Can Control Pump | Can Modify Settings |
|------|-------|------------------|---------------------|
| **Admin** | 👑 Admin (kuning) | ✅ Yes | ✅ Yes |
| **User** | 👤 User (hijau) | ✅ Yes | ❌ No |
| **Unregistered** | - | ❌ No | ❌ No |

---

## 🔒 Best Practices

1. **Buat minimal 2 admin** - Untuk backup jika satu lupa password
2. **Gunakan email yang mudah diingat** untuk admin
3. **Password harus kuat** - Min 12 karakter, kombinasi huruf/angka/simbol
4. **Review user list secara berkala** di Firebase Console
5. **Hapus user yang tidak aktif** untuk keamanan

---

Jika ada pertanyaan atau masalah, check:
- Browser console (F12) untuk error messages
- Firebase Console → Authentication → Users
- Firebase Console → Realtime Database → Rules
