# ESP32 RFID Door System v3.3

## 🔧 Perbaikan Terbaru

### **RFID Hang Prevention & Sensor Management**

Versi 3.3 menambahkan fitur penting untuk mencegah RFID scanner hang dan meningkatkan manajemen door sensor.

---

## ✨ Fitur Baru

### 1. **Periodic RFID Reset (Sensor Disabled Mode)**
- **Masalah yang diperbaiki**: RFID scanner hang ketika door sensor dinonaktifkan
- **Solusi**: RFID akan di-reset otomatis setiap **5 detik** ketika door sensor disabled
- **Benefit**: Mencegah hang dan memastikan RFID tetap responsif

```cpp
// Kode implementasi di readDoorSensor()
if (!sensorEnabled) {
  if (millis() - lastRFIDPeriodicReset >= RFID_PERIODIC_RESET_INTERVAL) {
    lastRFIDPeriodicReset = millis();
    if (!scanMode) {
      logSerial("[RFID] Periodic reset (sensor disabled)");
      resetRFID();
    }
  }
  return;
}
```

**Interval waktu**: 5 detik (5000ms) - Sudah diuji optimal untuk:
- Tidak terlalu sering (menghemat resource)
- Tidak terlalu jarang (mencegah hang)
- Aman untuk operasi continuous

---

### 2. **LCD Status Display Enhancement**
- **Tampilan dinamis** berdasarkan status sensor:
  - **Sensor ENABLED**: Menampilkan `Door: OPEN` atau `Door: CLOSED`
  - **Sensor DISABLED**: Menampilkan `Door Sensor: DISABLED`

```cpp
void updateLCDDoorStatus() {
  lcd.setCursor(0, 2);

  if (!sensorEnabled) {
    lcd.print("Door Sensor: DISABLED");
  } else {
    lcd.print("Door: ");
    if (doorOpen) {
      lcd.print("OPEN          ");
    } else {
      lcd.print("CLOSED        ");
    }
  }
}
```

**Tampilan LCD Idle Mode**:
```
Selamat Datang di
Kamar Aldri
Door Sensor: DISABLED   ← Saat sensor disabled
Time: 14:23:45
```

```
Selamat Datang di
Kamar Aldri
Door: CLOSED            ← Saat sensor enabled
Time: 14:23:45
```

---

### 3. **Sensor Toggle Auto LCD Update**
- LCD akan **otomatis update** saat status sensor berubah via web interface
- Tidak perlu restart atau manual refresh
- Real-time feedback di LCD

```cpp
void handleSensorToggle() {
  // ... save sensor status ...

  // Update LCD otomatis
  if (!scanMode) {
    updateLCDDoorStatus();
  }

  // ... handle sensor state ...
}
```

---

## 🎯 Cara Kerja Sistem

### **Mode Sensor Enabled (Default)**
1. Door sensor membaca status pintu (OPEN/CLOSED)
2. RFID di-reset otomatis saat pintu tertutup
3. LCD menampilkan status pintu real-time

### **Mode Sensor Disabled**
1. Door sensor diabaikan (tidak membaca)
2. RFID di-reset **periodic setiap 5 detik** untuk prevent hang
3. LCD menampilkan "Door Sensor: DISABLED"
4. RFID tetap bisa scan kartu

---

## 📋 Perubahan Teknis

### Variabel Baru
```cpp
// Periodic RFID reset untuk sensor disabled mode
unsigned long lastRFIDPeriodicReset = 0;
const unsigned long RFID_PERIODIC_RESET_INTERVAL = 5000;  // 5 detik
```

### Fungsi yang Dimodifikasi

1. **`readDoorSensor()`**
   - Tambahan: Periodic RFID reset saat sensor disabled
   - Tetap: Normal door sensor reading saat enabled

2. **`updateLCDDoorStatus()`**
   - Tambahan: Cek sensor status sebelum tampilkan
   - Tampilkan "DISABLED" jika sensor off

3. **`handleSensorToggle()`**
   - Tambahan: Auto update LCD saat toggle
   - Tambahan: Reset RFID state sesuai mode

---

## 🔍 Testing & Verifikasi

### Test Case 1: Sensor Disabled - RFID Periodic Reset
```
[Sensor] Status changed to: DISABLED
[RFID] Periodic reset (sensor disabled)    ← Log setiap 5 detik
[RFID] Reset and ready
```

### Test Case 2: Sensor Enabled - Normal Operation
```
[Sensor] Status changed to: ENABLED
[Sensor] Door state: CLOSED
[RFID] Reset and ready
[Sensor] Door OPENED
[RFID] Deactivated (door opened)
```

### Test Case 3: LCD Display Update
```
Web: POST /sensor/toggle (enabled=false)
LCD Line 3: "Door Sensor: DISABLED"

Web: POST /sensor/toggle (enabled=true)
LCD Line 3: "Door: CLOSED"
```

---

## 🚨 Troubleshooting

### RFID masih hang setelah update?
1. **Cek log serial**: Harus ada `[RFID] Periodic reset (sensor disabled)` setiap 5 detik
2. **Cek sensor status**: Pastikan benar-benar disabled via web `/sensor/status`
3. **Restart ESP32**: Hard reset jika masih bermasalah

### LCD tidak update saat toggle sensor?
1. **Cek scanMode**: LCD tidak update saat dalam scan mode
2. **Wait 2 detik**: Setelah toggle, tunggu sebentar untuk LCD refresh
3. **Cek web response**: Pastikan API return `success: true`

### Waktu 5 detik terlalu cepat/lambat?
Ubah konstanta di line 57:
```cpp
const unsigned long RFID_PERIODIC_RESET_INTERVAL = 5000;  // Ubah nilai ini (ms)
```

**Rekomendasi interval**:
- **Minimum**: 3000ms (3 detik) - Untuk high reliability
- **Optimal**: 5000ms (5 detik) - Balance performance & reliability
- **Maximum**: 10000ms (10 detik) - Untuk save resource

---

## 📡 API Endpoints (Sensor Control)

### Get Sensor Status
```http
GET /sensor/status
```
**Response**:
```json
{
  "enabled": true
}
```

### Toggle Sensor
```http
POST /sensor/toggle
Content-Type: application/x-www-form-urlencoded

enabled=false
```
**Response**:
```json
{
  "success": true,
  "enabled": false,
  "message": "Sensor disabled successfully"
}
```

---

## 🔧 Hardware Requirements
- ESP32 Development Board
- MFRC522 RFID Reader
- LCD 20x4 I2C (Address: 0x27)
- DS3231 RTC Module
- SD Card Module
- Door Sensor (Magnetic/Reed Switch)
- Electromagnetic Lock
- Buzzer

---

## 📝 Version History

### v3.3 (Current)
- ✅ Periodic RFID reset saat sensor disabled (5 detik)
- ✅ LCD dynamic display untuk sensor status
- ✅ Auto LCD update saat toggle sensor
- ✅ Improved RFID stability

### v3.2
- RFID watchdog & auto-recovery
- Sensor enable/disable via web
- Door sensor monitoring

### v3.1
- Web-based user management
- Access log export
- File manager

### v3.0
- Initial release with WiFi setup
- RFID access control
- RTC integration

---

## 👨‍💻 Developer Notes

### Kenapa 5 detik?
- **Terlalu cepat** (< 3s): Boros resource, RFID tidak stabil
- **Terlalu lambat** (> 10s): Resiko hang tinggi
- **5 detik**: Sweet spot antara stability & efficiency

### Mengapa tidak continuous reset?
Reset RFID terlalu sering bisa:
- Ganggu pembacaan kartu yang sedang berlangsung
- Membebani SPI bus
- Trigger watchdog timer

### Future Improvements
- [ ] Adaptive reset interval berdasarkan fail count
- [ ] RFID health score monitoring
- [ ] Auto-adjust interval berdasarkan temperature
- [ ] Deep sleep mode untuk power saving

---

## 📞 Support
Jika menemukan bug atau punya saran:
1. Check serial monitor untuk log detail
2. Test dengan interval berbeda
3. Pastikan wiring RFID sudah benar

---

**Version**: 3.3
**Last Updated**: November 2024
**Author**: Aldri
**License**: MIT
