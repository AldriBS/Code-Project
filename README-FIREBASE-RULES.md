# Firebase Realtime Database Security Rules

## 📋 Cara Mengaplikasikan Rules

### 1. Via Firebase Console (Recommended)
1. Buka Firebase Console: https://console.firebase.google.com
2. Pilih project Anda
3. Klik **Realtime Database** di menu sebelah kiri
4. Klik tab **Rules**
5. Copy isi dari `firebase-rules.json`
6. Paste ke editor rules
7. Klik **Publish**

### 2. Via Firebase CLI
```bash
# Install Firebase CLI jika belum
npm install -g firebase-tools

# Login ke Firebase
firebase login

# Deploy rules
firebase deploy --only database
```

## 🔒 Fitur Keamanan

### ✅ Authentication Required
- Semua operasi read/write require authentication (`auth != null`)
- Tidak ada public access
- Default rule: `.read: false` dan `.write: false`

### ✅ Data Validation
**Area 1:**
- `waterLevel`: 0-10 (integer scale)
- `waterHeight`: 0-200 cm (max 200cm untuk Area 1)
- `current`: 0-100 A (ampere limit)
- `servoState`: only 'open', 'close', atau 'auto'
- `rssi`: -100 to 0 dBm (WiFi signal strength)

**Area 2:**
- `waterLevel`: 0-10 (integer scale)
- `waterHeight`: 0-50 cm (max 50cm untuk Area 2)
- Other fields sama dengan Area 1

### ✅ Config/AutoPump Rules
- Require complete structure: `enabled`, `activateLevel`, `deactivateLevel`
- Level range validation: 0-10
- Only authenticated users can modify

### ✅ Alarm System
- Indexed by: `timestamp`, `area`, `level`
- Better query performance
- Only authenticated users can read/write

### ✅ User Presence
- Users can only write to their own UID
- Tracking online/offline status

## ⚠️ Penting untuk ESP32/IoT Devices

ESP32 harus authenticate sebelum bisa read/write data. Ada 2 opsi:

### Option 1: Custom Token (Recommended for Production)
```cpp
// Di ESP32, gunakan custom token dari server
firebase.auth().signInWithCustomToken(customToken);
```

### Option 2: Anonymous Authentication (Development)
```cpp
// Di ESP32, gunakan anonymous auth
firebase.auth().signInAnonymously();
```

**Setup Anonymous Auth di Firebase Console:**
1. Firebase Console → Authentication
2. Sign-in method tab
3. Enable "Anonymous" provider

## 📊 Struktur Database yang Divalidasi

```json
{
  "area1": {
    "waterLevel": 5,           // 0-10
    "waterHeight": 100,        // 0-200 cm
    "pumpStatus": true,        // boolean
    "pumpCommand": false,      // boolean
    "current": 2.5,            // 0-100 A
    "online": true,            // boolean
    "timestamp": "2024-01-15T10:30:00Z",
    "servoPosition": 90,       // 0-180
    "servoState": "auto",      // 'open'|'close'|'auto'
    "firmwareVersion": "1.0.0",
    "dashboardOnline": true,
    "dashboardTimestamp": "2024-01-15T10:30:00Z",
    "deviceHealth": {
      "rssi": -65,             // -100 to 0
      "freeHeap": 50000,       // bytes
      "uptime": 3600           // seconds
    }
  },
  "config": {
    "autoPump": {
      "area1": {
        "enabled": true,
        "activateLevel": 6,    // 0-10
        "deactivateLevel": 3   // 0-10
      }
    }
  },
  "alarms": {
    "alarm_id_123": {
      "timestamp": "2024-01-15T10:30:00Z",
      "area": "area1",
      "level": 8,
      "message": "Critical water level"
    }
  }
}
```

## 🔄 Migration dari Rules Lama

Rules lama memiliki:
```json
".read": true,
".write": true
```

Ini **sangat tidak aman** karena siapa saja bisa read/write tanpa authentication.

Rules baru memerlukan:
```json
".read": "auth != null",
".write": "auth != null"
```

**Impact:**
- Web dashboard sudah aman (sudah ada Firebase Auth)
- ESP32/IoT devices **HARUS** ditambahkan authentication
- Jika ESP32 belum authenticate, akan gagal read/write

## 🧪 Testing Rules

### Test di Firebase Console:
1. Firebase Console → Realtime Database → Rules
2. Klik tab **Simulator**
3. Test read/write dengan authenticated/unauthenticated state

### Test Example:
```
Location: /area1/waterLevel
Authenticated: Yes (checked)
Type: Write
Data: 5
→ Should be ALLOWED

Authenticated: No (unchecked)
Type: Write
→ Should be DENIED
```

## 📝 Best Practices

1. **Jangan hardcode credentials** di ESP32 code
2. **Gunakan environment variables** untuk sensitive data
3. **Monitor authentication logs** di Firebase Console
4. **Review rules regularly** untuk security audit
5. **Test extensively** sebelum production

## ⚡ Troubleshooting

### Error: "Permission Denied"
- Pastikan user sudah login (authenticated)
- Check Firebase Auth status
- Verify rules sudah di-publish

### ESP32 tidak bisa write data
- Enable Anonymous Auth di Firebase Console
- Atau implement Custom Token authentication
- Check WiFi connection dan Firebase config

### Data validation failed
- Check data format (number, boolean, string)
- Verify value range (0-10, 0-200, etc)
- Ensure required fields present

## 📞 Support

Jika ada pertanyaan atau issue:
1. Check Firebase Console → Authentication untuk verify users
2. Check Firebase Console → Realtime Database → Usage untuk monitor activity
3. Review Firebase logs untuk error messages
