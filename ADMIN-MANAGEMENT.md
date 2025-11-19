# 👑 Admin Management Guide

Panduan lengkap untuk mengelola admin di Komatsu Flood Control System.

---

## 📚 Available Scripts

| Script | Fungsi | Command |
|--------|--------|---------|
| `set-first-admin.js` | Setup admin pertama kali | `node set-first-admin.js` |
| `add-admin.js` | Tambah admin baru | `node add-admin.js email@example.com` |
| `list-admins.js` | Lihat daftar semua admin & user | `node list-admins.js` |
| `remove-admin.js` | Remove admin privileges | `node remove-admin.js email@example.com` |

---

## 🚀 Quick Start

### Prerequisites

```bash
# Install Firebase Admin SDK (hanya sekali)
npm install firebase-admin

# Download serviceAccountKey.json dari Firebase Console
# Letakkan di folder yang sama dengan script
```

---

## 1️⃣ Setup Admin Pertama

**Script:** `set-first-admin.js`

### Langkah-langkah:

1. **Edit email di script (baris 20):**
   ```javascript
   const EMAIL_ADMIN = 'admin@yourdomain.com';
   ```

2. **Buat user di Firebase Console:**
   - https://console.firebase.google.com/project/hyd-flood-control-system/authentication/users
   - Add user dengan email yang sama

3. **Jalankan script:**
   ```bash
   node set-first-admin.js
   ```

✅ **Output:**
```
🎉 SUCCESS! Admin set up successfully!
👑 Admin Email: admin@yourdomain.com
```

---

## 2️⃣ Menambah Admin Baru

**Script:** `add-admin.js` ⭐ **RECOMMENDED**

### Cara Pakai:

```bash
# Format
node add-admin.js email@example.com

# Contoh
node add-admin.js admin2@company.com
```

### Langkah Detail:

1. **Buat user di Firebase Console:**
   - Go to: https://console.firebase.google.com/project/hyd-flood-control-system/authentication/users
   - Click **Add user**
   - Email: `admin2@company.com`
   - Password: (buat password kuat)
   - Click **Add user**

2. **Jalankan script dengan email sebagai argument:**
   ```bash
   node add-admin.js admin2@company.com
   ```

3. **Selesai!** Admin baru sudah ditambahkan.

✅ **Keuntungan:**
- ✅ Tidak perlu edit file
- ✅ Cepat untuk tambah multiple admin
- ✅ Validasi email otomatis
- ✅ Check jika sudah admin

---

## 3️⃣ Melihat Daftar Admin

**Script:** `list-admins.js`

### Cara Pakai:

```bash
node list-admins.js
```

✅ **Output:**
```
═══════════════════════════════════════════════════════
👑 ADMINS (2)
═══════════════════════════════════════════════════════

1. admin@company.com
   UID: abc123xyz...
   Created: 2025-01-15
   Last Login: 2025-01-15

2. admin2@company.com
   UID: def456uvw...
   Created: 2025-01-16
   Last Login: Never

═══════════════════════════════════════════════════════
👤 USERS (3)
═══════════════════════════════════════════════════════

1. user1@company.com
   UID: ghi789rst...
   Created: 2025-01-16
   Last Login: 2025-01-16

...

═══════════════════════════════════════════════════════
📊 SUMMARY
═══════════════════════════════════════════════════════
   👑 Admins: 2
   👤 Users: 3
   ❓ Others: 0
   📊 Total: 5
═══════════════════════════════════════════════════════
```

---

## 4️⃣ Remove Admin Privileges

**Script:** `remove-admin.js`

### Cara Pakai:

```bash
# Format
node remove-admin.js email@example.com

# Contoh
node remove-admin.js admin2@company.com
```

⚠️ **Catatan:**
- User **TIDAK DIHAPUS** dari sistem
- Hanya **admin privileges yang diremove**
- User downgrade menjadi **regular user**
- User masih bisa login & control pump
- User **TIDAK BISA** modify settings lagi

✅ **Output:**
```
✅ SUCCESS! Admin privileges removed!

👤 User Email: admin2@company.com
📊 New Role: Regular User

📝 User can now:
   ✅ Login to web dashboard
   ✅ View water levels and pump status
   ✅ Control pumps ON/OFF
   ❌ CANNOT modify auto-pump settings
   ❌ CANNOT modify configurations
```

---

## 📋 Workflow Examples

### Example 1: Tambah 3 Admin Baru

```bash
# 1. Buat 3 user di Firebase Console
# - admin1@company.com
# - admin2@company.com
# - admin3@company.com

# 2. Run script untuk masing-masing
node add-admin.js admin1@company.com
node add-admin.js admin2@company.com
node add-admin.js admin3@company.com

# 3. Verify
node list-admins.js
```

### Example 2: Downgrade Admin ke User

```bash
# 1. Check current admins
node list-admins.js

# 2. Remove admin privileges
node remove-admin.js admin2@company.com

# 3. Verify
node list-admins.js
```

### Example 3: Replace Admin

```bash
# Scenario: admin1 keluar, diganti admin-new

# 1. Add admin baru
node add-admin.js admin-new@company.com

# 2. Remove admin lama
node remove-admin.js admin1@company.com

# 3. (Optional) Hapus user lama dari Firebase Console
# Authentication → Users → Find admin1 → Delete
```

---

## 🎯 Best Practices

### 1. **Jumlah Admin yang Ideal**

✅ **Recommended:** 2-3 admin
- 1 admin utama
- 1-2 admin backup

❌ **Avoid:** Terlalu banyak admin
- Resiko security lebih tinggi
- Sulit tracking siapa yang ubah apa

### 2. **Security Tips**

✅ **DO:**
- Gunakan email yang jelas (misal: admin.plant@company.com)
- Password minimal 12 karakter
- Review admin list secara berkala (bulanan)
- Remove admin yang sudah tidak aktif

❌ **DON'T:**
- Share admin credentials
- Gunakan password yang lemah
- Biarkan admin yang sudah resign tetap aktif

### 3. **Audit Trail**

Semua perubahan admin disimpan di Firebase:
- Path: `userRoles/{uid}`
- Data: email, role, isAdmin, createdAt, createdBy

Check di Firebase Console:
https://console.firebase.google.com/project/hyd-flood-control-system/database/data/userRoles

---

## 🆘 Troubleshooting

### Error: "Cannot find module 'firebase-admin'"

**Solusi:**
```bash
npm install firebase-admin
```

### Error: "serviceAccountKey.json not found"

**Solusi:**
1. Download dari: Firebase Console → Settings → Service Accounts
2. Generate new private key
3. Rename menjadi: `serviceAccountKey.json`
4. Letakkan di folder yang sama dengan script

### Error: "User not found"

**Solusi:**
- Buat user dulu di Firebase Console → Authentication
- Pastikan email di command benar (case-sensitive)

### Admin masih bisa modify settings setelah di-remove

**Solusi:**
1. User harus **LOGOUT** dari web
2. **Clear browser cache**
3. **Login ulang**
4. Custom claims butuh re-authentication

### Script tidak jalan di Windows

**Solusi:**
```powershell
# Pastikan di folder project
cd path\to\Code-Project

# Check file ada
dir add-admin.js

# Run dengan full path jika perlu
node "C:\path\to\Code-Project\add-admin.js" email@example.com
```

---

## 📊 Permission Matrix

| Action | Admin 👑 | User 👤 | Unregistered 🚫 |
|--------|----------|---------|-----------------|
| Login to Web | ✅ | ✅ | ❌ |
| View Dashboard | ✅ | ✅ | ❌ |
| Control Pump ON/OFF | ✅ | ✅ | ❌ |
| Modify Auto-Pump Settings | ✅ | ❌ | ❌ |
| Modify Configurations | ✅ | ❌ | ❌ |
| Manage Users | ✅ | ❌ | ❌ |

---

## 🔗 Helpful Links

- **Firebase Console:** https://console.firebase.google.com/project/hyd-flood-control-system
- **Authentication Users:** https://console.firebase.google.com/project/hyd-flood-control-system/authentication/users
- **Database Rules:** https://console.firebase.google.com/project/hyd-flood-control-system/database/rules
- **Service Accounts:** https://console.firebase.google.com/project/hyd-flood-control-system/settings/serviceaccounts/adminsdk

---

## 📝 Checklist

### Setup Admin Pertama:
- [ ] Download serviceAccountKey.json
- [ ] Buat user di Firebase Console
- [ ] Edit EMAIL_ADMIN di set-first-admin.js
- [ ] Run: `node set-first-admin.js`
- [ ] Login ke web, check badge 👑 Admin

### Tambah Admin Baru:
- [ ] Buat user di Firebase Console
- [ ] Run: `node add-admin.js email@example.com`
- [ ] Verify dengan: `node list-admins.js`
- [ ] User login dan check badge 👑 Admin

### Remove Admin:
- [ ] Run: `node remove-admin.js email@example.com`
- [ ] User logout dari web
- [ ] User login ulang
- [ ] Check badge berubah jadi 👤 User
- [ ] Auto-pump toggle harus disabled

---

Selamat mengelola admin! 🎉
