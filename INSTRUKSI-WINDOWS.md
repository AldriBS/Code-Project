# 🪟 Instruksi Setup Admin di Windows

## 📍 Lokasi File Project

File `set-first-admin.js` berada di folder project GitHub Anda.

### **Cara 1: Clone Repository (Recommended)**

```powershell
# Buka Command Prompt atau PowerShell
# Navigate ke folder dimana Anda ingin simpan project

cd Desktop

# Clone repository
git clone https://github.com/AldriBS/Code-Project.git

# Masuk ke folder project
cd Code-Project

# Verify file ada
dir set-first-admin.js
```

Output harusnya:
```
 set-first-admin.js
 firebase-config.js
 index.html
 area1.html
 ...dll
```

---

### **Cara 2: Download Manual**

1. **Download file dari GitHub:**
   - Buka: https://github.com/AldriBS/Code-Project
   - Klik tombol hijau **Code** → **Download ZIP**
   - Extract ZIP ke folder (misal: `C:\Users\YourName\Desktop\Code-Project`)

2. **Navigate ke folder:**
   ```powershell
   cd Desktop\Code-Project
   ```

---

## 🔐 Setup Admin - Step by Step

### **Step 1: Download Service Account Key**

1. Buka: https://console.firebase.google.com/project/hyd-flood-control-system/settings/serviceaccounts/adminsdk
2. Tab **Service accounts**
3. Klik **Generate new private key**
4. Klik **Generate key**
5. File JSON akan ter-download
6. **Rename** file menjadi: `serviceAccountKey.json`
7. **Pindahkan** file ke folder project (dimana ada `set-first-admin.js`)

### **Step 2: Buat User di Firebase**

1. Buka: https://console.firebase.google.com/project/hyd-flood-control-system/authentication/users
2. Klik **Add user**
3. Masukkan:
   - Email: `admin@yourdomain.com` (ganti dengan email Anda)
   - Password: Buat password yang kuat
4. Klik **Add user**

### **Step 3: Edit Script**

1. Buka file `set-first-admin.js` dengan Notepad atau text editor
2. Cari baris 20:
   ```javascript
   const EMAIL_ADMIN = 'admin@example.com';
   ```
3. Ganti dengan email Anda:
   ```javascript
   const EMAIL_ADMIN = 'admin@yourdomain.com';
   ```
4. Save file

### **Step 4: Install Dependencies**

```powershell
# Pastikan Anda di folder project
npm install firebase-admin
```

### **Step 5: Jalankan Script**

```powershell
node set-first-admin.js
```

Output jika berhasil:
```
✅ Firebase Admin initialized
🔐 Setting up first admin...
📧 Email: admin@yourdomain.com

✅ User found in Firebase Authentication
   UID: abc123xyz...

⚙️  Setting custom claims as admin...
✅ Custom claims set successfully

💾 Saving to database...
✅ Saved to database: userRoles/abc123xyz

🔍 Verifying...
   Custom claims: { admin: true, role: 'admin' }

═══════════════════════════════════════════════════════
🎉 SUCCESS! Admin set up successfully!
═══════════════════════════════════════════════════════

👑 Admin Email: admin@yourdomain.com
🆔 UID: abc123xyz...

📝 Next Steps:
   1. Open login.html in browser
   2. Login with: admin@yourdomain.com
   3. You should see "👑 Admin" badge in header
   4. Auto-pump toggles should be enabled

⚠️  IMPORTANT:
   - If user already logged in, they must LOGOUT first
   - Then login again to get admin permissions
   - Custom claims update requires re-authentication

═══════════════════════════════════════════════════════
```

---

## 🌐 Deploy ke Firebase Hosting (Optional)

Jika ingin host web di Firebase:

```powershell
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize hosting
firebase init hosting
# Pilih: hyd-flood-control-system
# Public directory: . (titik)
# Single-page app: No
# GitHub integration: No

# Deploy
firebase deploy --only hosting
```

Web akan bisa diakses di:
https://hyd-flood-control-system.web.app

---

## 🆘 Troubleshooting

### Error: "Cannot find module"
**Penyebab:** Anda tidak di folder project

**Solusi:**
```powershell
# Check folder sekarang
cd

# Navigate ke folder project
cd path\to\Code-Project

# Verify
dir set-first-admin.js
```

### Error: "serviceAccountKey.json not found"
**Solusi:**
- Download lagi dari Firebase Console
- Pastikan nama file PERSIS: `serviceAccountKey.json`
- Pastikan file di folder yang sama dengan `set-first-admin.js`

### Error: "User not found"
**Solusi:**
- Buat user dulu di Firebase Console → Authentication
- Pastikan email di script sama dengan email di Firebase

---

## ✅ Checklist

- [ ] Clone atau download repository
- [ ] Navigate ke folder project: `cd Code-Project`
- [ ] Download `serviceAccountKey.json` dari Firebase
- [ ] Letakkan `serviceAccountKey.json` di folder project
- [ ] Buat user di Firebase Authentication
- [ ] Edit `EMAIL_ADMIN` di `set-first-admin.js`
- [ ] Run: `npm install firebase-admin`
- [ ] Run: `node set-first-admin.js`
- [ ] Login ke web, cek badge 👑 Admin

---

Jika masih ada masalah, screenshot error dan lokasi folder Anda! 📸
