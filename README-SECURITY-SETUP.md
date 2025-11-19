# 🔒 Security Setup Guide - Role-Based Access Control (RBAC)

## 📋 Overview

Sistem security dengan 3 level akses:

1. **👑 ADMIN** - Pemilik project Firebase (Full Access)
2. **👤 USER** - User terdaftar (Read & Control Pump, No Config Modify)
3. **🚫 UNREGISTERED** - Tidak bisa akses sama sekali
4. **🤖 ESP32** - IoT device dengan role khusus

---

## 🚀 Setup Instructions

### Step 1: Deploy Firebase Rules

1. Buka Firebase Console: https://console.firebase.google.com
2. Pilih project Anda
3. Klik **Realtime Database** → **Rules**
4. Copy isi dari `firebase-rules-rbac.json`
5. Paste dan klik **Publish**

### Step 2: Setup Firebase Functions (untuk Custom Claims)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize Functions
firebase init functions
# Pilih: JavaScript
# Pilih: Install dependencies

# Copy setup-admin-claims.js ke functions/index.js
cp setup-admin-claims.js functions/index.js

# Install dependencies
cd functions
npm install firebase-admin firebase-functions

# Deploy functions
firebase deploy --only functions
```

### Step 3: Set First Admin (Via Firebase Console)

Karena belum ada admin, gunakan Firebase Console untuk set admin pertama:

**Option A - Via Firebase Console (Recommended):**

1. Firebase Console → Authentication
2. Pilih user yang akan dijadikan admin
3. Klik tab **Custom claims**
4. Set custom claims:
```json
{
  "admin": true,
  "role": "admin"
}
```

**Option B - Via Node.js Script:**

Create file `set-first-admin.js`:
```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://YOUR-PROJECT.firebaseio.com"
});

async function setFirstAdmin() {
  const email = 'your-admin@email.com'; // Ganti dengan email Anda

  try {
    const user = await admin.auth().getUserByEmail(email);

    await admin.auth().setCustomUserClaims(user.uid, {
      admin: true,
      role: 'admin'
    });

    console.log('✅ Success! Admin set for:', email);
  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit();
}

setFirstAdmin();
```

Run:
```bash
node set-first-admin.js
```

### Step 4: Update Web Files

Add `admin-check.js` to all HTML pages:

**area1.html, area2.html, index.html:**
```html
<!-- Add after alarm-system.js -->
<script src="admin-check.js"></script>
```

### Step 5: Setup ESP32 Authentication

ESP32 needs custom claims with role 'esp32':

1. Create anonymous user for ESP32 di Firebase Console
2. Call `setESP32Claim` function dengan UID ESP32
3. Or use Service Account for ESP32

---

## 🔐 Security Rules Explained

### Admin Access (Full Control)
```javascript
auth.token.admin == true
```
- ✅ Read semua data
- ✅ Write semua data
- ✅ Modify config/autoPump
- ✅ Control pumps
- ✅ Manage users

### User Access (Read + Control Only)
```javascript
auth != null && auth.token.admin != true
```
- ✅ Read semua data
- ✅ Control pumps (ON/OFF)
- ❌ Tidak bisa modify config/autoPump
- ❌ Tidak bisa modify alarms
- ❌ Tidak bisa manage users

### ESP32 Access (Sensor Data Only)
```javascript
auth.token.role == 'esp32'
```
- ✅ Write sensor data (waterLevel, pumpStatus, etc)
- ✅ Read commands (pumpCommand)
- ❌ Tidak bisa modify config
- ❌ Tidak bisa control pumps directly

### Unregistered (No Access)
```javascript
auth == null
```
- ❌ Tidak bisa read
- ❌ Tidak bisa write
- ❌ Akan redirect ke login page

---

## 👥 User Management

### Add New Admin (Existing Admin Only)

Via web console atau call Cloud Function:

```javascript
const functions = firebase.functions();
const setAdmin = functions.httpsCallable('setAdminClaim');

setAdmin({ email: 'newadmin@example.com' })
  .then(result => {
    console.log(result.data.message);
  });
```

### Add New Regular User

1. Firebase Console → Authentication → Add User
2. User automatically set as 'user' role (via Cloud Function trigger)
3. Or manually call:

```javascript
const setUser = functions.httpsCallable('setUserClaim');

setUser({ email: 'user@example.com' })
  .then(result => {
    console.log(result.data.message);
  });
```

### Add ESP32 Device

```javascript
const setESP32 = functions.httpsCallable('setESP32Claim');

setESP32({ uid: 'esp32-uid-from-firebase' })
  .then(result => {
    console.log(result.data.message);
  });
```

---

## 🎯 Permission Matrix

| Action | Admin | User | ESP32 | Unregistered |
|--------|-------|------|-------|--------------|
| View Dashboard | ✅ | ✅ | ❌ | ❌ |
| Control Pump ON/OFF | ✅ | ✅ | ❌ | ❌ |
| Modify Auto-Pump Config | ✅ | ❌ | ❌ | ❌ |
| View Water Level | ✅ | ✅ | ❌ | ❌ |
| Write Sensor Data | ✅ | ❌ | ✅ | ❌ |
| View Alarms | ✅ | ✅ | ❌ | ❌ |
| Write Alarms | ✅ | ❌ | ✅ | ❌ |
| Manage Users | ✅ | ❌ | ❌ | ❌ |

---

## 🧪 Testing

### Test Admin Access
1. Login as admin
2. Harus melihat badge **👑 Admin**
3. Auto-pump toggle harus enabled
4. Bisa modify semua settings

### Test User Access
1. Login as regular user
2. Harus melihat badge **👤 User**
3. Auto-pump toggle harus disabled
4. Melihat **🔒 Admin Only** badge
5. Bisa control pump ON/OFF
6. Tidak bisa modify auto-pump settings

### Test Unregistered
1. Logout atau buka incognito
2. Harus redirect ke login page
3. Tidak bisa akses dashboard

### Test ESP32
1. ESP32 authenticate dengan custom token
2. Bisa write sensor data
3. Bisa read pump commands
4. Tidak bisa modify config

---

## 🔧 Troubleshooting

### Error: "Permission Denied" for Admin
**Problem:** Admin tidak bisa modify config
**Solution:**
1. Check custom claims: Firebase Console → Authentication → User → Custom claims
2. Pastikan ada: `{ "admin": true, "role": "admin" }`
3. User harus logout dan login ulang setelah claims diset

### User bisa modify config (seharusnya tidak bisa)
**Problem:** Rules tidak terApply
**Solution:**
1. Check Firebase Rules sudah di-publish
2. Clear browser cache
3. Logout dan login ulang

### ESP32 tidak bisa write data
**Problem:** ESP32 belum punya custom claim
**Solution:**
1. Set custom claim untuk ESP32 UID
2. Atau gunakan service account

### "Only admins can set other admins" error
**Problem:** Tidak ada admin di sistem
**Solution:**
1. Set admin pertama via Firebase Console
2. Atau gunakan Node.js script `set-first-admin.js`

---

## 📝 Best Practices

1. **Minimal Admin** - Hanya set admin untuk user yang benar-benar diperlukan
2. **Regular Review** - Review user roles secara berkala
3. **Audit Logs** - Monitor Firebase logs untuk suspicious activity
4. **Strong Passwords** - Enforce strong password policy
5. **2FA Enabled** - Enable two-factor authentication untuk admin
6. **Service Account** - Gunakan service account untuk ESP32, bukan anonymous auth
7. **Environment Variables** - Jangan hardcode credentials
8. **HTTPS Only** - Pastikan web hanya accessible via HTTPS

---

## 🆘 Support

Jika ada masalah:
1. Check Firebase Console → Authentication → Users
2. Check Firebase Console → Database → Rules
3. Check browser console untuk error messages
4. Review Firebase logs untuk access attempts

---

## 📚 Additional Resources

- [Firebase Custom Claims](https://firebase.google.com/docs/auth/admin/custom-claims)
- [Firebase Security Rules](https://firebase.google.com/docs/database/security)
- [Firebase Cloud Functions](https://firebase.google.com/docs/functions)
