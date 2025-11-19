# 🔐 Cara Setup Admin Pertama - MUDAH!

## ⚡ Metode Termudah: Via Script Node.js

Firebase Console **tidak selalu menampilkan** menu Custom Claims di UI.
Jadi cara tercepat adalah dengan script.

### **Langkah-langkah:**

#### 1. Pastikan Node.js sudah terinstall
```bash
node --version
# Jika belum ada, download dari: https://nodejs.org
```

#### 2. Download Service Account Key dari Firebase

1. Buka: https://console.firebase.google.com
2. Pilih project Anda: **hyd-flood-control-system**
3. Klik **⚙️ Settings** (gear icon) → **Project settings**
4. Tab **Service accounts**
5. Klik tombol **Generate new private key**
6. Klik **Generate key**
7. File JSON akan ter-download
8. **Rename** file menjadi: `serviceAccountKey.json`
9. **Pindahkan** file ke folder project (dimana file `set-first-admin.js` berada)

⚠️ **PENTING:** File ini sangat sensitif! Jangan share atau commit ke GitHub!

#### 3. Buat User di Firebase (jika belum ada)

1. Firebase Console → **Authentication** → **Users**
2. Klik **Add user**
3. Masukkan:
   - Email: **admin@yourdomain.com** (ganti dengan email Anda)
   - Password: **(buat password yang kuat)**
4. Klik **Add user**

#### 4. Edit Script set-first-admin.js

Buka file `set-first-admin.js`, cari baris 20:

```javascript
const EMAIL_ADMIN = 'admin@example.com';  // <-- GANTI INI!
```

Ganti dengan email yang tadi Anda buat:

```javascript
const EMAIL_ADMIN = 'admin@yourdomain.com';  // Email Anda
```

#### 5. Install Firebase Admin SDK

```bash
npm install firebase-admin
```

#### 6. Jalankan Script

```bash
node set-first-admin.js
```

Jika berhasil, akan muncul:

```
═══════════════════════════════════════════════════════
🎉 SUCCESS! Admin set up successfully!
═══════════════════════════════════════════════════════

👑 Admin Email: admin@yourdomain.com
🆔 UID: xxxxxxxxxx

📝 Next Steps:
   1. Open login.html in browser
   2. Login with: admin@yourdomain.com
   3. You should see "👑 Admin" badge in header
   4. Auto-pump toggles should be enabled
```

#### 7. Login ke Web

1. Buka `login.html` di browser
2. Login dengan email & password yang tadi dibuat
3. ✅ Seharusnya muncul badge **👑 Admin** di header!

---

## 🆘 Troubleshooting

### Error: "Cannot find module 'firebase-admin'"
**Solusi:**
```bash
npm install firebase-admin
```

### Error: "service account key not found"
**Solusi:**
- Pastikan file `serviceAccountKey.json` ada di folder yang sama dengan `set-first-admin.js`
- Check nama file harus **persis**: `serviceAccountKey.json`

### Error: "User not found"
**Solusi:**
- Buat user dulu di Firebase Console → Authentication → Add User
- Pastikan email di script sama dengan email di Firebase

### Masih muncul "👤 User" bukan "👑 Admin"
**Solusi:**
1. **LOGOUT** dari web
2. **Close browser completely**
3. **Open browser baru**
4. **Login ulang**
5. Custom claims butuh re-authentication untuk apply

---

## ✅ Cek Apakah Sudah Admin

Setelah login, cek:

| ✅ Sudah Admin | ❌ Masih User |
|---------------|---------------|
| Badge **👑 Admin** (kuning) | Badge **👤 User** (hijau) |
| Toggle auto-pump **BISA diklik** | Toggle auto-pump **DISABLED** |
| **TIDAK ada** badge "🔒 Admin Only" | **ADA** badge "🔒 Admin Only" |

---

## 📧 Menambahkan Admin Lain

Setelah punya satu admin, untuk tambah admin baru:

1. Edit file `set-first-admin.js`
2. Ganti `EMAIL_ADMIN` dengan email admin baru
3. Jalankan lagi: `node set-first-admin.js`

---

Selamat! Anda sekarang punya akun admin! 🎉
