# ESP32 Door Lock with HomeKit Integration v4.0

## 🍎 HomeKit Integration

Sistem door lock ESP32 sekarang mendukung **Apple HomeKit**! Anda bisa mengontrol pintu dari iPhone, iPad, Apple Watch, atau dengan Siri.

---

## ✨ Fitur HomeKit

### 1. **Lock/Unlock dari Home App**
- Buka pintu langsung dari aplikasi Home di iPhone
- Status lock real-time
- Animasi lock/unlock

### 2. **Siri Voice Control**
```
"Hey Siri, buka pintu kamar Aldri"
"Hey Siri, kunci pintu kamar Aldri"
"Hey Siri, apakah pintu kamar Aldri terkunci?"
```

### 3. **Automation**
- Auto-lock setelah jam tertentu
- Unlock otomatis saat tiba di rumah (geofencing)
- Notifikasi saat pintu dibuka/dikunci
- Integrasi dengan scene dan automation lain

### 4. **Remote Access**
- Kontrol dari mana saja via iCloud (perlu Home Hub)
- Home Hub: Apple TV, HomePod, atau iPad

### 5. **Multi-User Support**
- Share access ke keluarga via Home app
- Track siapa yang unlock pintu

---

## 🔧 Hardware Requirements

- ESP32 Development Board
- MFRC522 RFID Reader
- LCD 20x4 I2C
- DS3231 RTC Module
- SD Card Module
- Door Sensor (Reed Switch)
- Electromagnetic Lock
- Buzzer
- iPhone/iPad dengan iOS 13.0 atau lebih baru

---

## 📦 Library Requirements

Install library berikut di Arduino IDE:

```bash
1. HomeSpan by Gregg Orr (versi terbaru)
2. WiFi (built-in ESP32)
3. WebServer (built-in ESP32)
4. Wire (built-in)
5. LiquidCrystal_I2C
6. MFRC522
7. SPI (built-in)
8. SD (built-in)
9. RTClib
10. ArduinoOTA
11. Preferences (built-in ESP32)
12. ArduinoJson
13. ESPmDNS (built-in ESP32)
```

### Install HomeSpan

**Via Arduino Library Manager**:
1. Tools → Manage Libraries
2. Search "HomeSpan"
3. Install "HomeSpan by Gregg Orr"

**Via Manual**:
```bash
cd ~/Documents/Arduino/libraries
git clone https://github.com/HomeSpan/HomeSpan.git
```

---

## 🚀 Setup HomeKit

### Step 1: Upload Code ke ESP32

1. Buka `esp32_door_system_homekit.ino` di Arduino IDE
2. Select Board: ESP32 Dev Module
3. Select Port: (COM port ESP32 Anda)
4. Upload

### Step 2: Connect ke WiFi

**Opsi A: Via Web Setup**
1. ESP32 akan membuat AP: `ESP32_Door_Setup`
2. Password: `12345678`
3. Connect ke AP tersebut
4. Buka browser: `http://192.168.4.1`
5. Masukkan WiFi credentials Anda

**Opsi B: Via Serial Monitor**
```
W <SSID> <PASSWORD>
```

### Step 3: Pair dengan Home App

**Setup Code**: `466-37-726`

1. **Buka Home App** di iPhone/iPad
2. Tap **+** (Add Accessory)
3. Tap **More Options...**
4. Pilih **"Door Lock Aldri"** dari daftar
5. Tap **Add Anyway** (accessory not certified)
6. Masukkan setup code: **466-37-726**
7. Tunggu pairing selesai (30-60 detik)
8. Pilih room untuk door lock
9. Tap **Done**

**QR Code Alternative**:
Jika HomeSpan generate QR code di serial monitor, bisa langsung scan QR code tersebut dari Home app.

### Step 4: Test Lock/Unlock

1. Di Home app, tap tile **Door Lock Aldri**
2. Tap **Unlock** → Door akan terbuka
3. Setelah 5 detik, door auto-lock
4. Test dengan Siri: *"Hey Siri, kunci pintu"*

---

## 🔐 HomeKit Setup Code

**Default Setup Code**: `466-37-726`

### Cara Mengganti Setup Code

Edit di line 32 file `esp32_door_system_homekit.ino`:
```cpp
const char* homekit_setup_code = "466-37-726";  // Ganti kode ini
```

**Format**: `XXX-XX-XXX` (8 digit dalam format HomeKit)

**Contoh valid**:
- `123-45-678`
- `111-22-333`
- `987-65-432`

---

## 📱 HomeKit Features

### Lock Mechanism States

| State | HomeKit Value | Description |
|-------|---------------|-------------|
| Unlocked | 0 | Pintu terbuka |
| Locked | 1 | Pintu terkunci |
| Jammed | 2 | Error/stuck |
| Unknown | 3 | Status tidak diketahui |

### Control Methods

1. **RFID Card** → Unlock via HomeKit
2. **Web Interface** → Update HomeKit state
3. **HomeKit App** → Control lock directly
4. **Siri Voice** → Voice commands
5. **Automation** → Scheduled/triggered actions

---

## 🔧 Web API Endpoints (New)

### Get HomeKit Status
```http
GET /homekit/status
```

**Response**:
```json
{
  "paired": true,
  "setupCode": "466-37-726",
  "name": "Door Lock Aldri",
  "connections": 1
}
```

### Reset HomeKit Pairings
```http
POST /homekit/reset
```

**Response**:
```json
{
  "success": true,
  "message": "HomeKit pairings cleared"
}
```

**Catatan**: Setelah reset, perlu pair ulang dengan Home app.

---

## 🎯 HomeKit Automation Examples

### 1. Auto-Lock Saat Tidur

**Trigger**: Waktu (22:00)
**Condition**: Pintu unlocked
**Action**: Lock door

```
Time: 10:00 PM
When: Door is unlocked
Action: Lock "Door Lock Aldri"
```

### 2. Unlock Saat Pulang

**Trigger**: People arrive
**Condition**: Location (Home)
**Action**: Unlock door

```
When: I arrive home
Action: Unlock "Door Lock Aldri"
```

### 3. Notifikasi Pintu Terbuka

**Trigger**: Door unlocked
**Action**: Send notification

```
When: "Door Lock Aldri" is unlocked
Action: Send notification to my iPhone
```

### 4. Good Night Scene

**Scene**: Good Night
**Actions**:
- Lock door
- Turn off lights
- Set thermostat

```
Scene: "Good Night"
- Lock "Door Lock Aldri"
- Turn off "Living Room Lights"
- Set "Thermostat" to 20°C
```

---

## 🐛 Troubleshooting

### HomeKit Tidak Muncul di Home App

**Solusi**:
1. Pastikan ESP32 dan iPhone di WiFi yang sama
2. Check serial monitor: pastikan `[OK] HomeKit initialized`
3. Restart Home app
4. Reset ESP32 dan coba lagi

### Pairing Gagal

**Solusi**:
1. Verify setup code: `466-37-726`
2. Check WiFi connection ESP32
3. Reset HomeKit pairings:
   ```
   POST /homekit/reset
   ```
4. Restart ESP32
5. Coba pair ulang

### Status Lock Tidak Update

**Solusi**:
1. Check koneksi WiFi
2. Verify Home Hub online (Apple TV/HomePod)
3. Restart Home app
4. Check serial log untuk errors

### HomeKit Disconnected

**Solusi**:
1. Check WiFi signal strength
2. Restart ESP32
3. Check router: pastikan mDNS enabled
4. Verify Home Hub status

### Re-Pairing Setelah Reset

**Steps**:
1. Remove accessory dari Home app
2. Call endpoint: `POST /homekit/reset`
3. Restart ESP32
4. Wait 30 seconds
5. Pair ulang dengan setup code

---

## 📊 HomeKit vs Web vs RFID

| Feature | RFID | Web | HomeKit | Siri |
|---------|------|-----|---------|------|
| Unlock Speed | ⚡ Instant | 🔥 Fast | 🚀 Very Fast | 🎙️ Voice |
| Remote Access | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| Automation | ❌ No | ⚠️ Limited | ✅ Full | ✅ Full |
| Voice Control | ❌ No | ❌ No | ✅ Yes | ✅ Yes |
| Offline Mode | ✅ Yes | ❌ No | ⚠️ Local* | ❌ No |
| User Log | ✅ Yes | ✅ Yes | ⚠️ Limited | ⚠️ Limited |

*HomeKit local control works when iPhone & ESP32 on same network

---

## 🔒 Security Features

### 1. **HAP Security**
- HomeKit menggunakan SRP (Secure Remote Password)
- All communication encrypted end-to-end
- Pairing uses Ed25519 key exchange

### 2. **Multiple Authentication**
- RFID: Physical card required
- Web: Username/password (jika ada)
- HomeKit: Paired device + iCloud authentication

### 3. **Audit Log**
- Semua unlock event di-log
- Source tracking (RFID/Web/HomeKit)
- Timestamp dengan RTC
- Export ke CSV

### 4. **Access Control**
- HomeKit: Share via Home app
- RFID: Registered cards only
- Web: Admin control required

---

## 💡 Tips & Best Practices

### 1. **Setup Home Hub**
Untuk remote access dan automation:
- Apple TV 4th gen atau lebih baru
- HomePod atau HomePod mini
- iPad (always at home)

### 2. **WiFi Stability**
- Gunakan WiFi 2.4GHz (bukan 5GHz)
- Signal strength minimal -70dBm
- Static IP untuk ESP32 (recommended)

### 3. **Power Supply**
- Gunakan adaptor 5V 2A minimum
- UPS/battery backup recommended
- Stable voltage untuk EM lock

### 4. **Backup**
- Save setup code di password manager
- Export RFID database regular
- Backup WiFi credentials

### 5. **Testing**
- Test automation sebelum deploy
- Verify auto-lock timer
- Check battery status (if using)

---

## 🆚 Perbandingan dengan Sistem Lain

### ESP32 + HomeKit vs Commercial Smart Lock

| Aspect | ESP32 System | Commercial |
|--------|--------------|------------|
| Cost | 💰 ~$30-50 | 💰💰 $200-400 |
| Customizable | ✅ Full | ❌ Limited |
| RFID Support | ✅ Yes | ⚠️ Some models |
| Web Interface | ✅ Yes | ⚠️ App only |
| Open Source | ✅ Yes | ❌ No |
| HomeKit | ✅ Native | ✅ Native |
| Cloud Dependency | ❌ No | ✅ Yes (mostly) |
| DIY Friendly | ✅ Very | ❌ Not at all |

---

## 📈 Future Enhancements

### Planned Features (v4.1+)

- [ ] HomeKit camera integration
- [ ] Face recognition via ESP32-CAM
- [ ] Fingerprint sensor support
- [ ] NFC tag support
- [ ] BLE unlock (iPhone nearby)
- [ ] Multiple door support
- [ ] HomeKit Secure Video
- [ ] Matter protocol support
- [ ] Battery level monitoring
- [ ] Tamper detection

---

## 🔗 Useful Links

- **HomeSpan Documentation**: https://github.com/HomeSpan/HomeSpan
- **HomeKit Accessory Protocol**: https://developer.apple.com/homekit/
- **ESP32 Arduino Core**: https://github.com/espressif/arduino-esp32
- **HomeKit Setup Codes**: https://developer.apple.com/design/human-interface-guidelines/homekit

---

## 📝 Change Log

### v4.0 (Current)
- ✅ HomeKit integration with Lock Mechanism
- ✅ Siri voice control
- ✅ HomeKit automation support
- ✅ Multi-user access via Home app
- ✅ Web API for HomeKit status
- ✅ HomeKit pairing reset endpoint

### v3.3
- RFID hang prevention
- Sensor enable/disable
- Periodic RFID reset
- LCD dynamic display

### v3.2
- RFID health monitoring
- Web-based management
- Access log export

---

## 🙋 FAQ

### Q: Apakah perlu Apple device untuk HomeKit?
**A**: Ya, minimal iPhone/iPad dengan iOS 13+ untuk setup. Setelah setup, bisa kontrol dari Apple Watch atau Mac juga.

### Q: Bisakah Android user mengakses HomeKit?
**A**: Tidak langsung. Tapi bisa pakai web interface yang tetap tersedia.

### Q: Apakah HomeKit bekerja tanpa internet?
**A**: Ya, selama iPhone dan ESP32 di WiFi yang sama. Untuk remote access perlu internet + Home Hub.

### Q: Berapa banyak user bisa pairing?
**A**: HomeKit support sampai 16 paired controllers. Bisa share via Home app ke keluarga.

### Q: Apakah compatible dengan Google Home/Alexa?
**A**: Tidak secara native. Perlu bridge seperti Homebridge untuk integrasi cross-platform.

### Q: Bagaimana cara unpair?
**A**: Di Home app: Tekan dan tahan tile → Settings → Remove Accessory. Atau via API: `POST /homekit/reset`

### Q: Setup code bisa diganti?
**A**: Ya, edit variable `homekit_setup_code` di code, upload ulang, dan reset pairings.

---

## 🎉 Happy HomeKit-ing!

Sekarang pintu Anda sudah connected ke Apple ecosystem. Enjoy the magic of *"Hey Siri, buka pintu!"* 🍎🚪✨

**Version**: 4.0.0
**Author**: Aldri
**License**: MIT
**Last Updated**: November 2024
