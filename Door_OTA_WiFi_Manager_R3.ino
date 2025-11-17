#include <WiFi.h>
#include <WebServer.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <MFRC522.h>
#include <SPI.h>
#include <SD.h>
#include <RTClib.h>
#include <ArduinoOTA.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>  
#include <ESPmDNS.h>

// Pin Definitions
#define SS_PIN      5
#define RST_PIN     27
#define BUZZER_PIN  13
#define RELAY_PIN   16
#define RELAY_ON_STATE   HIGH
#define RELAY_OFF_STATE  LOW
#define SENSOR_PIN  32
#define SD_CS_PIN   4

// Watchdog Configuration
#define WDT_TIMEOUT 30

// WiFi Configuration
const char* ap_ssid = "ESP32_Door_Setup";
const char* ap_password = "12345678";

// Objects
MFRC522 mfrc522(SS_PIN, RST_PIN);
LiquidCrystal_I2C lcd(0x27, 20, 4);
WebServer server(80);
RTC_DS3231 rtc;
Preferences preferences;

// SDCard Paths
static const char* CSV_PATH = "/rfid_data.csv";
static const char* LOG_PATH = "/door_log.csv";

// State Variables
bool sdcard_ok = false;
bool rtc_ok = false;
bool doorOpen = false;
bool doorLocked = true;
bool rfidReady = false;
bool scanMode = false;
String scannedUID = "";
unsigned long scanStartTime = 0;
const unsigned long SCAN_TIMEOUT = 15000;
unsigned long lastLCDUpdate = 0;
unsigned long systemStartTime = 0;
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_READ_INTERVAL = 100;

// ==================== NEW: SENSOR ENABLE/DISABLE ====================
bool sensorEnabled = true;
// ====================================================================

// ==================== NEW: RFID WATCHDOG ====================
unsigned long lastRFIDCheck = 0;
const unsigned long RFID_CHECK_INTERVAL = 5000;
unsigned long rfidFailCount = 0;
const unsigned long RFID_MAX_FAILS = 3;
// ============================================================

// Auto-lock timer
unsigned long unlockStartTime = 0;
bool autoLockPending = false;
const unsigned long AUTO_LOCK_DURATION = 5000;

// Serial Monitor Buffer
#define SERIAL_BUFFER_SIZE 3000
String serialBuffer = "";
unsigned long lastSerialTimestamp = 0;

// SPI Setup
SPIClass hspi(HSPI);

// ==================== Custom Serial Print with Buffer ====================
void logSerial(String message) {
  Serial.println(message);
  
  if (rtc_ok) {
    DateTime now = rtc.now();
    char timestamp[20];
    sprintf(timestamp, "[%02d:%02d:%02d] ", now.hour(), now.minute(), now.second());
    message = String(timestamp) + message;
  }
  
  message += "\n";
  
  if (serialBuffer.length() + message.length() > SERIAL_BUFFER_SIZE) {
    int firstNewline = serialBuffer.indexOf('\n', 500);
    if (firstNewline > 0) {
      serialBuffer = serialBuffer.substring(firstNewline + 1);
    } else {
      serialBuffer = "";
    }
  }
  
  serialBuffer += message;
  lastSerialTimestamp = millis();
}

// ==================== Sensor Preferences Management ====================
bool loadSensorEnabled() {
  preferences.begin("sensor", true);
  sensorEnabled = preferences.getBool("enabled", true);
  preferences.end();
  logSerial("[Sensor] Status loaded: " + String(sensorEnabled ? "ENABLED" : "DISABLED"));
  return sensorEnabled;
}

void saveSensorEnabled(bool enabled) {
  preferences.begin("sensor", false);
  preferences.putBool("enabled", enabled);
  preferences.end();
  sensorEnabled = enabled;
  logSerial("[Sensor] Status saved: " + String(enabled ? "ENABLED" : "DISABLED"));
}

// ==================== WiFi Credentials Management ====================
bool loadWiFiCredentials(String &ssid, String &password) {
  preferences.begin("wifi", true);
  ssid = preferences.getString("ssid", "");
  password = preferences.getString("password", "");
  preferences.end();
  return (ssid.length() > 0);
}

void saveWiFiCredentials(String ssid, String password) {
  preferences.begin("wifi", false);
  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.end();
  logSerial("[WiFi] Credentials saved: " + ssid);
}

void clearWiFiCredentials() {
  preferences.begin("wifi", false);
  preferences.clear();
  preferences.end();
  logSerial("[WiFi] Credentials cleared");
}

// ==================== Door Lock Control ====================
void setRelay(bool unlocked) {
  digitalWrite(RELAY_PIN, unlocked ? RELAY_ON_STATE : RELAY_OFF_STATE);
  doorLocked = !unlocked;
  logSerial("[Door] " + String(unlocked ? "UNLOCKED" : "LOCKED"));
}

// ==================== RFID Reset Logic with Watchdog ====================
void resetRFID() {
  mfrc522.PCD_Init();
  rfidReady = true;
  rfidFailCount = 0;
  logSerial("[RFID] Reset and ready");
}

// ==================== RFID Health Check & Auto-Recovery ====================
void checkRFIDHealth() {
  if (millis() - lastRFIDCheck < RFID_CHECK_INTERVAL) return;
  lastRFIDCheck = millis();
  
  byte version = mfrc522.PCD_ReadRegister(mfrc522.VersionReg);
  
  if (version == 0x00 || version == 0xFF) {
    rfidFailCount++;
    logSerial("[RFID] ⚠️ Not responding (fail count: " + String(rfidFailCount) + ")");
    
    if (rfidFailCount >= RFID_MAX_FAILS) {
      logSerial("[RFID] ⚠️ Max fails reached - FORCING RESET");
      mfrc522.PCD_Reset();
      delay(50);
      resetRFID();
      beepFail();
    }
  } else {
    if (rfidFailCount > 0) {
      logSerial("[RFID] ✅ Health recovered (version: 0x" + String(version, HEX) + ")");
    }
    rfidFailCount = 0;
  }
}

// ==================== Door Sensor Reading with RFID Logic ====================
void readDoorSensor() {
  if (!sensorEnabled) {
    if (!rfidReady && !scanMode) {
      resetRFID();
    }
    return;
  }
  
  if (millis() - lastSensorRead < SENSOR_READ_INTERVAL) return;
  lastSensorRead = millis();
  
  int sensorState = digitalRead(SENSOR_PIN);
  bool newDoorOpen = (sensorState == HIGH);
  
  if (newDoorOpen != doorOpen) {
    doorOpen = newDoorOpen;
    logSerial("[Sensor] Door " + String(doorOpen ? "OPENED" : "CLOSED"));
    
    if (doorOpen) {
      rfidReady = false;
      logSerial("[RFID] Deactivated (door opened)");
    } else {
      resetRFID();
    }
    
    if (!scanMode) {
      updateLCDDoorStatus();
    }
  }
  
  if (!doorLocked && !doorOpen && !autoLockPending) {
    static unsigned long lastResetCheck = 0;
    if (millis() - lastResetCheck > 2000) {
      lastResetCheck = millis();
      logSerial("[RFID] Reset (lock open, door closed)");
      resetRFID();
    }
  }
}

void updateLCDDoorStatus() {
  lcd.setCursor(0, 2);
  lcd.print("Door: ");
  if (doorOpen) {
    lcd.print("OPEN    ");
  } else {
    lcd.print("CLOSED  ");
  }
}

// ==================== Buzzer Functions ====================
void beepOK() {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(120);
  digitalWrite(BUZZER_PIN, LOW);
}

void beepFail() {
  for (int i = 0; i < 2; i++) {
    digitalWrite(BUZZER_PIN, HIGH); 
    delay(120);
    digitalWrite(BUZZER_PIN, LOW);  
    delay(120);
  }
}

void beepReady() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(80);
    digitalWrite(BUZZER_PIN, LOW);
    delay(80);
  }
}

// ==================== LCD Functions ====================
void lcdShowIdle() {
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Selamat Datang di");
  lcd.setCursor(0, 1); lcd.print("Kamar Aldri");
  updateLCDDoorStatus();
  resetRFID();
}

void updateLCDClock() {
  if (rfidReady && !scanMode && rtc_ok) {
    DateTime now = rtc.now();
    char timeStr[21];
    sprintf(timeStr, "Time: %02d:%02d:%02d", now.hour(), now.minute(), now.second());
    lcd.setCursor(0, 3);
    lcd.print(timeStr);
  }
}

// ==================== SD Card Functions ====================
bool beginSDCard() {
  if (sdcard_ok) return true;
  
  esp_task_wdt_reset();
  hspi.begin(14, 12, 15, SD_CS_PIN);
  sdcard_ok = SD.begin(SD_CS_PIN, hspi);
  
  if (!sdcard_ok) {
    logSerial("[ERROR] SD Card initialization failed");
    return false;
  }
  logSerial("[OK] SD Card initialized");
  return true;
}

void ensureCSVFile() {
  if (!beginSDCard()) return;
  esp_task_wdt_reset();
  
  if (!SD.exists(CSV_PATH)) {
    File f = SD.open(CSV_PATH, FILE_WRITE);
    if (f) {
      f.println("Name,UID");
      f.close();
      logSerial("[OK] CSV file created");
    }
  }
}

void ensureLogFile() {
  if (!beginSDCard()) return;
  esp_task_wdt_reset();
  
  if (!SD.exists(LOG_PATH)) {
    File f = SD.open(LOG_PATH, FILE_WRITE);
    if (f) {
      f.println("Name,UID,Date,Time,Timestamp,Status");
      f.close();
      logSerial("[OK] Log file created");
    }
  }
}

String trimLine(const String& in) {
  String s = in;
  s.trim();
  return s;
}

bool isHeaderLine(const String& line) {
  return line.startsWith("Name,UID") || line.startsWith("Name,") || line.indexOf("UID") >= 0;
}

String getUserNameByUID(const String& uid) {
  if (!beginSDCard()) return "";
  esp_task_wdt_reset();
  
  File f = SD.open(CSV_PATH, FILE_READ);
  if (!f) return "";
  
  while (f.available()) {
    String line = trimLine(f.readStringUntil('\n'));
    if (line.length() == 0 || isHeaderLine(line)) continue;
    
    int comma = line.indexOf(',');
    if (comma <= 0) continue;
    
    String name = trimLine(line.substring(0, comma));
    String savedUID = trimLine(line.substring(comma + 1));
    
    if (savedUID.equalsIgnoreCase(uid)) {
      f.close();
      return name;
    }
  }
  f.close();
  return "";
}

bool isUserRegistered(const String& userName) {
  if (!beginSDCard()) return false;
  esp_task_wdt_reset();
  
  File f = SD.open(CSV_PATH, FILE_READ);
  if (!f) return false;
  
  while (f.available()) {
    String line = trimLine(f.readStringUntil('\n'));
    if (line.length() == 0 || isHeaderLine(line)) continue;
    
    int comma = line.indexOf(',');
    if (comma <= 0) continue;
    
    String name = trimLine(line.substring(0, comma));
    
    if (name.equalsIgnoreCase(userName)) {
      f.close();
      return true;
    }
  }
  f.close();
  return false;
}

void writeLog(const String& name, const String& uid, bool success) {
  if (!beginSDCard()) return;
  esp_task_wdt_reset();
  ensureLogFile();

  File f = SD.open(LOG_PATH, FILE_APPEND);
  if (f) {
    String status = success ? "GRANTED" : "DENIED";
    String timestamp = "";
    char dateStr[11] = "00/00/0000";
    char timeStr[9] = "00:00:00";
    
    if (rtc_ok) {
      DateTime now = rtc.now();
      timestamp = String(now.unixtime());
      sprintf(dateStr, "%02d/%02d/%04d", now.day(), now.month(), now.year());
      sprintf(timeStr, "%02d:%02d:%02d", now.hour(), now.minute(), now.second());
    } else {
      timestamp = String(millis() / 1000);
    }
    
    String entry = name + "," + uid + "," + String(dateStr) + "," + 
                   String(timeStr) + "," + timestamp + "," + status;
    f.println(entry);
    f.close();
    logSerial("[LOG] " + entry);
  }
}

// ==================== WiFi Functions ====================
bool connectToWiFi(String ssid, String password, int maxAttempts) {
  logSerial("[WiFi] Connecting to: " + ssid);
  
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Connecting WiFi:");
  lcd.setCursor(0, 1); lcd.print(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
    delay(500);
    esp_task_wdt_reset();
    logSerial(".");
    lcd.setCursor(attempts % 20, 2);
    lcd.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    logSerial("[OK] WiFi Connected! IP: " + WiFi.localIP().toString());
    
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1); lcd.print("IP: " + WiFi.localIP().toString());
    delay(3000);
    
    return true;
  }
  
  logSerial("[FAIL] WiFi connection failed");
  return false;
}

void startAPMode() {
  logSerial("[WiFi] Starting AP Mode");
  esp_task_wdt_reset();
  
  WiFi.mode(WIFI_AP);
  WiFi.softAP(ap_ssid, ap_password);
  
  IPAddress IP = WiFi.softAPIP();
  logSerial("[OK] AP Mode - IP: " + IP.toString());
  
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("WiFi Setup Mode");
  lcd.setCursor(0, 1); lcd.print("SSID: " + String(ap_ssid));
  lcd.setCursor(0, 2); lcd.print("Pass: " + String(ap_password));
  lcd.setCursor(0, 3); lcd.print("IP: " + IP.toString());
}

// ==================== Web Server Handlers - Static Files ====================
void handleRoot() {
  logSerial("[Web] GET /");
  if (!beginSDCard()) {
    server.send(500, "text/plain", "SD Card Error");
    return;
  }
  
  File file = SD.open("/web/index.html");
  if (file) {
    server.streamFile(file, "text/html");
    file.close();
  } else {
    server.send(404, "text/plain", "index.html not found");
  }
}

void handleUsers() {
  logSerial("[Web] GET /users");
  if (!beginSDCard()) {
    server.send(500, "text/plain", "SD Card Error");
    return;
  }
  
  File file = SD.open("/web/users.html");
  if (file) {
    server.streamFile(file, "text/html");
    file.close();
  } else {
    server.send(404, "text/plain", "users.html not found");
  }
}

void handleFileManager() {
  logSerial("[Web] GET /files");
  if (!beginSDCard()) {
    server.send(500, "text/plain", "SD Card Error");
    return;
  }
  
  File file = SD.open("/web/files.html");
  if (file) {
    server.streamFile(file, "text/html");
    file.close();
  } else {
    server.send(404, "text/plain", "files.html not found");
  }
}

void handleStyleCSS() {
  if (!beginSDCard()) {
    server.send(500, "text/plain", "SD Card Error");
    return;
  }
  
  File file = SD.open("/web/style.css");
  if (file) {
    server.streamFile(file, "text/css");
    file.close();
  } else {
    server.send(404, "text/plain", "Not found");
  }
}

void handleUsersCSS() {
  if (!beginSDCard()) {
    server.send(500, "text/plain", "SD Card Error");
    return;
  }
  
  File file = SD.open("/web/users.css");
  if (file) {
    server.streamFile(file, "text/css");
    file.close();
  } else {
    server.send(404, "text/plain", "Not found");
  }
}

void handleFilesCSS() {
  if (!beginSDCard()) {
    server.send(500, "text/plain", "SD Card Error");
    return;
  }
  
  File file = SD.open("/web/files.css");
  if (file) {
    server.streamFile(file, "text/css");
    file.close();
  } else {
    server.send(404, "text/plain", "Not found");
  }
}

void handleScriptJS() {
  if (!beginSDCard()) {
    server.send(500, "text/plain", "SD Card Error");
    return;
  }
  
  File file = SD.open("/web/script.js");
  if (file) {
    server.streamFile(file, "application/javascript");
    file.close();
  } else {
    server.send(404, "text/plain", "Not found");
  }
}

// ==================== Serial Monitor Handler ====================
void handleSerial() {
  logSerial("[Web] GET /serial");
  
  if (serialBuffer.length() == 0) {
    String msg = "=== ESP32 Serial Monitor ===\n[INFO] No logs yet\n[INFO] System running\n";
    server.send(200, "text/plain", msg);
  } else {
    server.send(200, "text/plain", serialBuffer);
  }
}

void handleSerialClear() {
  logSerial("[Web] POST /serial/clear");
  serialBuffer = "=== Serial Monitor Cleared ===\n";
  lastSerialTimestamp = millis();
  server.send(200, "application/json", "{\"success\":true}");
}

// ==================== Data API Handlers ====================
void handleUsersJSON() {
  logSerial("[Web] GET /users.json");
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"error\":\"SD Error\"}");
    return;
  }
  
  String json = "[";
  File f = SD.open(CSV_PATH, FILE_READ);
  
  if (f) {
    bool first = true;
    while (f.available()) {
      String line = trimLine(f.readStringUntil('\n'));
      if (line.length() == 0 || isHeaderLine(line)) continue;
      
      int comma = line.indexOf(',');
      if (comma <= 0) continue;
      
      String name = trimLine(line.substring(0, comma));
      String uid = trimLine(line.substring(comma + 1));
      
      if (!first) json += ",";
      json += "{\"name\":\"" + name + "\",\"uid\":\"" + uid + "\"}";
      first = false;
    }
    f.close();
  }
  
  json += "]";
  server.send(200, "application/json", json);
}

void handleAccessLogJSON() {
  logSerial("[Web] GET /access_log.json");
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"error\":\"SD Error\"}");
    return;
  }
  
  ensureLogFile();
  String json = "[";
  File f = SD.open(LOG_PATH, FILE_READ);
  
  if (f) {
    bool first = true;
    while (f.available()) {
      String line = trimLine(f.readStringUntil('\n'));
      if (line.length() == 0 || line.startsWith("Name,")) continue;
      
      int idx1 = line.indexOf(',');
      int idx2 = line.indexOf(',', idx1 + 1);
      int idx3 = line.indexOf(',', idx2 + 1);
      int idx4 = line.indexOf(',', idx3 + 1);
      int idx5 = line.indexOf(',', idx4 + 1);
      
      if (idx1 > 0 && idx2 > 0 && idx3 > 0 && idx4 > 0 && idx5 > 0) {
        String name = trimLine(line.substring(0, idx1));
        String uid = trimLine(line.substring(idx1 + 1, idx2));
        String timestamp = trimLine(line.substring(idx4 + 1, idx5));
        String status = trimLine(line.substring(idx5 + 1));
        
        if (!first) json += ",";
        json += "{\"name\":\"" + name + "\",\"uid\":\"" + uid + 
                "\",\"timestamp\":" + timestamp + ",\"status\":\"" + status + "\"}";
        first = false;
      }
    }
    f.close();
  }
  
  json += "]";
  server.send(200, "application/json", json);
}

// ==================== Export Log CSV ====================
void handleExportLog() {
  logSerial("[Web] GET /export_log");
  
  if (!beginSDCard()) {
    server.send(500, "text/plain", "SD Card Error");
    return;
  }
  
  File f = SD.open(LOG_PATH, FILE_READ);
  if (!f) {
    server.send(404, "text/plain", "Log file not found");
    return;
  }
  
  server.sendHeader("Content-Disposition", "attachment; filename=door_log.csv");
  server.streamFile(f, "text/csv");
  f.close();
  
  logSerial("[OK] Log file exported");
}

// ==================== FILE MANAGER HANDLERS ====================
void handleFilesList() {
  logSerial("[Web] GET /api/files/list");
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"error\":\"SD Card Error\"}");
    return;
  }
  
  String path = server.hasArg("path") ? server.arg("path") : "/";
  logSerial("[Files] Listing: " + path);
  
  File dir = SD.open(path);
  if (!dir || !dir.isDirectory()) {
    server.send(404, "application/json", "{\"error\":\"Directory not found\"}");
    return;
  }
  
  String json = "{\"path\":\"" + path + "\",\"files\":[";
  bool first = true;
  
  File file = dir.openNextFile();
  while (file) {
    if (!first) json += ",";
    
    String name = String(file.name());
    int lastSlash = name.lastIndexOf('/');
    if (lastSlash >= 0) {
      name = name.substring(lastSlash + 1);
    }
    
    json += "{";
    json += "\"name\":\"" + name + "\",";
    json += "\"size\":" + String(file.size()) + ",";
    json += "\"isDirectory\":" + String(file.isDirectory() ? "true" : "false");
    json += "}";
    
    first = false;
    file = dir.openNextFile();
  }
  
  json += "]}";
  server.send(200, "application/json", json);
}

void handleFilesDownload() {
  logSerial("[Web] GET /api/files/download");
  
  if (!beginSDCard()) {
    server.send(500, "text/plain", "SD Card Error");
    return;
  }
  
  if (!server.hasArg("path")) {
    server.send(400, "text/plain", "Missing path parameter");
    return;
  }
  
  String path = server.arg("path");
  logSerial("[Files] Download: " + path);
  
  File file = SD.open(path, FILE_READ);
  if (!file || file.isDirectory()) {
    server.send(404, "text/plain", "File not found");
    return;
  }
  
  String filename = path;
  int lastSlash = filename.lastIndexOf('/');
  if (lastSlash >= 0) {
    filename = filename.substring(lastSlash + 1);
  }
  
  server.sendHeader("Content-Disposition", "attachment; filename=" + filename);
  server.streamFile(file, "application/octet-stream");
  file.close();
  
  logSerial("[OK] File downloaded: " + path);
}

void handleFilesUpload() {
  logSerial("[Web] POST /api/files/upload");
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"SD Card Error\"}");
    return;
  }
  
  HTTPUpload& upload = server.upload();
  static File uploadFile;
  
  if (upload.status == UPLOAD_FILE_START) {
    String path = server.hasArg("path") ? server.arg("path") : "/";
    if (!path.endsWith("/")) path += "/";
    String filename = path + String(upload.filename);
    
    logSerial("[Files] Upload start: " + filename);
    
    uploadFile = SD.open(filename, FILE_WRITE);
    if (!uploadFile) {
      logSerial("[ERROR] Failed to create file");
    }
  } 
  else if (upload.status == UPLOAD_FILE_WRITE) {
    if (uploadFile) {
      uploadFile.write(upload.buf, upload.currentSize);
    }
  } 
  else if (upload.status == UPLOAD_FILE_END) {
    if (uploadFile) {
      uploadFile.close();
      logSerial("[OK] Upload complete: " + String(upload.totalSize) + " bytes");
      server.send(200, "application/json", "{\"success\":true,\"message\":\"File uploaded successfully\"}");
    } else {
      server.send(500, "application/json", "{\"success\":false,\"message\":\"Upload failed\"}");
    }
  }
}

void handleFilesDelete() {
  logSerial("[Web] POST /api/files/delete");
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"SD Card Error\"}");
    return;
  }
  
  if (!server.hasArg("path")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Missing path parameter\"}");
    return;
  }
  
  String path = server.arg("path");
  
  // Protect system files
  if (path == CSV_PATH || path == LOG_PATH || path.startsWith("/web/")) {
    server.send(403, "application/json", "{\"success\":false,\"message\":\"Cannot delete system files\"}");
    return;
  }
  
  logSerial("[Files] Delete: " + path);
  
  if (SD.remove(path)) {
    server.send(200, "application/json", "{\"success\":true,\"message\":\"File deleted successfully\"}");
    logSerial("[OK] File deleted");
  } else {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Failed to delete file\"}");
  }
}

void handleFilesRead() {
  logSerial("[Web] GET /api/files/read");
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"SD Card Error\"}");
    return;
  }
  
  if (!server.hasArg("path")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Missing path parameter\"}");
    return;
  }
  
  String path = server.arg("path");
  logSerial("[Files] Read: " + path);
  
  File file = SD.open(path, FILE_READ);
  if (!file || file.isDirectory()) {
    server.send(404, "application/json", "{\"success\":false,\"message\":\"File not found\"}");
    return;
  }
  
  String content = "";
  while (file.available()) {
    content += (char)file.read();
  }
  file.close();
  
  // Escape JSON special characters
  content.replace("\\", "\\\\");
  content.replace("\"", "\\\"");
  content.replace("\n", "\\n");
  content.replace("\r", "\\r");
  content.replace("\t", "\\t");
  
  String json = "{\"success\":true,\"content\":\"" + content + "\"}";
  server.send(200, "application/json", json);
}

void handleFilesWrite() {
  logSerial("[Web] POST /api/files/write");
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"SD Card Error\"}");
    return;
  }
  
  if (!server.hasArg("path") || !server.hasArg("content")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Missing parameters\"}");
    return;
  }
  
  String path = server.arg("path");
  String content = server.arg("content");
  
  logSerial("[Files] Write: " + path);
  
  File file = SD.open(path, FILE_WRITE);
  if (!file) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Failed to open file\"}");
    return;
  }
  
  file.print(content);
  file.close();
  
  server.send(200, "application/json", "{\"success\":true,\"message\":\"File saved successfully\"}");
  logSerial("[OK] File written");
}

void handleFilesMkdir() {
  logSerial("[Web] POST /api/files/mkdir");
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"SD Card Error\"}");
    return;
  }
  
  if (!server.hasArg("path")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Missing path parameter\"}");
    return;
  }
  
  String path = server.arg("path");
  logSerial("[Files] Mkdir: " + path);
  
  if (SD.mkdir(path)) {
    server.send(200, "application/json", "{\"success\":true,\"message\":\"Directory created successfully\"}");
    logSerial("[OK] Directory created");
  } else {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Failed to create directory\"}");
  }
}

// ==================== RFID Handlers ====================
void handleScan() {
  logSerial("[Web] POST /scan - RFID scan requested");
  scanMode = true;
  scanStartTime = millis();
  scannedUID = "";
  
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Scan Mode Active");
  lcd.setCursor(0, 1); lcd.print("Place card now");
  lcd.setCursor(0, 2); lcd.print("Time: 15s");
  
  unsigned long start = millis();
  int countdown = 15;
  
  while (millis() - start < SCAN_TIMEOUT) {
    esp_task_wdt_reset();
    
    if ((millis() - start) / 1000 != countdown) {
      countdown = 15 - ((millis() - start) / 1000);
      lcd.setCursor(6, 2);
      lcd.print(String(countdown) + "s ");
    }
    
    if (!mfrc522.PICC_IsNewCardPresent()) {
      delay(50);
      continue;
    }
    
    if (!mfrc522.PICC_ReadCardSerial()) {
      delay(50);
      continue;
    }
    
    String uid = "";
    for (byte i = 0; i < mfrc522.uid.size; i++) {
      if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
      uid += String(mfrc522.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    
    scannedUID = uid;
    scanMode = false;
    
    logSerial("[RFID] Card scanned: " + uid);
    beepOK();
    
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Card Scanned!");
    lcd.setCursor(0, 1); lcd.print("UID: " + uid);
    
    mfrc522.PICC_HaltA();
    mfrc522.PCD_StopCrypto1();
    
    server.send(200, "application/json", "{\"uid\":\"" + uid + "\"}");
    delay(2000);
    lcdShowIdle();
    return;
  }
  
  scanMode = false;
  logSerial("[RFID] Scan timeout");
  beepFail();
  server.send(200, "application/json", "{\"uid\":\"\"}");
  lcdShowIdle();
}

void handleSave() {
  logSerial("[Web] POST /save");
  if (!server.hasArg("name") || !server.hasArg("uid")) {
    server.send(400, "application/json", "{\"status\":\"Missing parameters\"}");
    return;
  }
  
  String name = server.arg("name");
  String uid = server.arg("uid");
  
  logSerial("[Web] Saving user: " + name + " | UID: " + uid);
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"status\":\"SD Card Error\"}");
    return;
  }
  
  ensureCSVFile();
  
  String existingName = getUserNameByUID(uid);
  if (existingName.length() > 0) {
    server.send(400, "application/json", "{\"status\":\"UID already exists\"}");
    return;
  }
  
  File f = SD.open(CSV_PATH, FILE_APPEND);
  if (f) {
    f.println(name + "," + uid);
    f.close();
    
    logSerial("[OK] User saved: " + name);
    server.send(200, "application/json", "{\"status\":\"Data saved successfully\"}");
    
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("User Registered!");
    lcd.setCursor(0, 1); lcd.print(name);
    delay(2000);
    lcdShowIdle();
  } else {
    server.send(500, "application/json", "{\"status\":\"Failed to write\"}");
  }
}

void handleDelete() {
  logSerial("[Web] GET /delete");
  if (!server.hasArg("uid")) {
    server.send(400, "application/json", "{\"status\":\"Missing UID\"}");
    return;
  }
  
  String uid = server.arg("uid");
  logSerial("[Web] Deleting UID: " + uid);
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"status\":\"SD Error\"}");
    return;
  }
  
  esp_task_wdt_reset();
  
  File fRead = SD.open(CSV_PATH, FILE_READ);
  if (!fRead) {
    server.send(500, "application/json", "{\"status\":\"Cannot open file\"}");
    return;
  }
  
  String tempData = "";
  bool found = false;
  
  while (fRead.available()) {
    String line = fRead.readStringUntil('\n');
    line.trim();
    
    if (line.length() == 0) continue;
    
    if (isHeaderLine(line)) {
      tempData += line + "\n";
      continue;
    }
    
    int comma = line.indexOf(',');
    if (comma > 0) {
      String lineUID = trimLine(line.substring(comma + 1));
      if (!lineUID.equalsIgnoreCase(uid)) {
        tempData += line + "\n";
      } else {
        found = true;
      }
    }
  }
  fRead.close();
  
  if (!found) {
    server.send(404, "application/json", "{\"status\":\"UID not found\"}");
    return;
  }
  
  SD.remove(CSV_PATH);
  File fWrite = SD.open(CSV_PATH, FILE_WRITE);
  if (fWrite) {
    fWrite.print(tempData);
    fWrite.close();
    logSerial("[OK] User deleted");
    server.send(200, "application/json", "{\"status\":\"User deleted successfully\"}");
  } else {
    server.send(500, "application/json", "{\"status\":\"Write failed\"}");
  }
}

void handleEdit() {
  logSerial("[Web] POST /user/edit");
  if ((!server.hasArg("oldUID") && !server.hasArg("oldUid")) || !server.hasArg("name") || (!server.hasArg("newUID") && !server.hasArg("uid"))) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Missing parameters\"}");
    return;
  }
  
  String oldUid = server.hasArg("oldUID") ? server.arg("oldUID") : server.arg("oldUid");
  String newName = server.arg("name");
  String newUid = server.hasArg("newUID") ? server.arg("newUID") : server.arg("uid");
  
  logSerial("[Web] Editing UID: " + oldUid + " -> Name: " + newName + ", UID: " + newUid);
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"SD Card Error\"}");
    return;
  }
  
  esp_task_wdt_reset();
  
  File fRead = SD.open(CSV_PATH, FILE_READ);
  if (!fRead) {
    server.send(500, "application/json", "{\"status\":\"Cannot open file\"}");
    return;
  }
  
  String tempData = "";
  bool found = false;
  
  while (fRead.available()) {
    String line = fRead.readStringUntil('\n');
    line.trim();
    
    if (line.length() == 0) continue;
    
    if (isHeaderLine(line)) {
      tempData += line + "\n";
      continue;
    }
    
    int comma = line.indexOf(',');
    if (comma > 0) {
      String lineUID = trimLine(line.substring(comma + 1));
      if (lineUID.equalsIgnoreCase(oldUid)) {
        tempData += newName + "," + newUid + "\n";
        found = true;
      } else {
        tempData += line + "\n";
      }
    }
  }
  fRead.close();
  
  if (!found) {
    server.send(404, "application/json", "{\"success\":false,\"message\":\"User not found\"}");
    return;
  }
  
  SD.remove(CSV_PATH);
  File fWrite = SD.open(CSV_PATH, FILE_WRITE);
  if (fWrite) {
    fWrite.print(tempData);
    fWrite.close();
    logSerial("[OK] User updated");
    server.send(200, "application/json", "{\"success\":true,\"message\":\"User updated successfully\"}");
  } else {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Write failed\"}");
  }
}

void handleReorder() {
  logSerial("[Web] POST /user/reorder");
  if (!server.hasArg("order")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Missing order parameter\"}");
    return;
  }
  
  String orderString = server.arg("order");
  logSerial("[Web] New order: " + orderString);
  
  if (!beginSDCard()) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"SD Card Error\"}");
    return;
  }
  
  esp_task_wdt_reset();
  
  File fRead = SD.open(CSV_PATH, FILE_READ);
  if (!fRead) {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Cannot open file\"}");
    return;
  }
  
  String userData[100];
  int userCount = 0;
  
  while (fRead.available() && userCount < 100) {
    String line = trimLine(fRead.readStringUntil('\n'));
    if (line.length() == 0 || isHeaderLine(line)) continue;
    
    userData[userCount] = line;
    userCount++;
  }
  fRead.close();
  
  String orderedData = "";
  int start = 0;
  int end = orderString.indexOf(',');
  
  while (start < orderString.length()) {
    String uid;
    if (end == -1) {
      uid = trimLine(orderString.substring(start));
    } else {
      uid = trimLine(orderString.substring(start, end));
    }
    
    for (int i = 0; i < userCount; i++) {
      int comma = userData[i].indexOf(',');
      if (comma > 0) {
        String dataUID = trimLine(userData[i].substring(comma + 1));
        if (dataUID.equalsIgnoreCase(uid)) {
          orderedData += userData[i] + "\n";
          break;
        }
      }
    }
    
    if (end == -1) break;
    start = end + 1;
    end = orderString.indexOf(',', start);
  }
  
  SD.remove(CSV_PATH);
  File fWrite = SD.open(CSV_PATH, FILE_WRITE);
  if (fWrite) {
    fWrite.println("Name,UID");
    fWrite.print(orderedData);
    fWrite.close();
    logSerial("[OK] Users reordered");
    server.send(200, "application/json", "{\"success\":true,\"message\":\"Users reordered successfully\"}");
  } else {
    server.send(500, "application/json", "{\"success\":false,\"message\":\"Write failed\"}");
  }
}

// ==================== WiFi Management ====================
void handleWiFiStatus() {
  logSerial("[Web] GET /wifi/status");
  
  bool connected = (WiFi.status() == WL_CONNECTED);
  String json = "{";
  json += "\"connected\":" + String(connected ? "true" : "false") + ",";
  json += "\"ssid\":\"" + String(connected ? WiFi.SSID() : "") + "\",";
  json += "\"ip\":\"" + (connected ? WiFi.localIP().toString() : "0.0.0.0") + "\",";
  json += "\"rssi\":" + String(connected ? WiFi.RSSI() : 0);
  json += "}";
  server.send(200, "application/json", json);
}

void handleWiFiScan() {
  logSerial("[Web] GET /wifi/scan");
  esp_task_wdt_reset();
  
  WiFi.scanDelete();
  
  int n = WiFi.scanNetworks(false, true);
  logSerial("[WiFi] Found " + String(n) + " networks");
  
  String json = "{\"networks\":[";
  for (int i = 0; i < n; i++) {
    if (i > 0) json += ",";
    json += "{";
    json += "\"ssid\":\"" + WiFi.SSID(i) + "\",";
    json += "\"rssi\":" + String(WiFi.RSSI(i)) + ",";
    json += "\"encryption\":\"" + String(WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "Open" : "Secured") + "\"";
    json += "}";
  }
  json += "]}";
  
  server.send(200, "application/json", json);
  WiFi.scanDelete();
}

void handleWiFiSave() {
  logSerial("[Web] POST /wifi/save");
  if (!server.hasArg("ssid")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"SSID required\"}");
    return;
  }
  
  String ssid = server.arg("ssid");
  String password = server.hasArg("password") ? server.arg("password") : "";
  
  logSerial("[WiFi] Saving credentials for: " + ssid);
  saveWiFiCredentials(ssid, password);
  
  WiFi.disconnect();
  delay(100);
  
  logSerial("[WiFi] Attempting connection...");
  
  if (connectToWiFi(ssid, password, 20)) {
    String json = "{";
    json += "\"success\":true,";
    json += "\"connected\":true,";
    json += "\"message\":\"Connected successfully\",";
    json += "\"ssid\":\"" + ssid + "\",";
    json += "\"ip\":\"" + WiFi.localIP().toString() + "\"";
    json += "}";
    server.send(200, "application/json", json);
    logSerial("[OK] WiFi connected - IP: " + WiFi.localIP().toString());
  } else {
    String json = "{";
    json += "\"success\":false,";
    json += "\"connected\":false,";
    json += "\"message\":\"Connection failed - check password or signal strength\"";
    json += "}";
    server.send(200, "application/json", json);
    logSerial("[FAIL] WiFi connection failed");
    startAPMode();
  }
}

void handleWiFiTest() {
  logSerial("[Web] POST /wifi/test");
  if (!server.hasArg("ssid")) {
    server.send(400, "application/json", "{\"success\":false}");
    return;
  }
  
  String ssid = server.arg("ssid");
  String password = server.hasArg("password") ? server.arg("password") : "";
  
  WiFi.disconnect();
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(500);
    esp_task_wdt_reset();
    attempts++;
  }
  
  bool success = (WiFi.status() == WL_CONNECTED);
  server.send(200, "application/json", "{\"success\":" + String(success ? "true" : "false") + "}");
  
  WiFi.disconnect();
  
  String saved_ssid, saved_password;
  if (loadWiFiCredentials(saved_ssid, saved_password)) {
    connectToWiFi(saved_ssid, saved_password, 10);
  } else {
    startAPMode();
  }
}

void handleWiFiClear() {
  logSerial("[Web] GET /wifi/clear");
  clearWiFiCredentials();
  server.send(200, "application/json", "{\"success\":true}");
  delay(1000);
  ESP.restart();
}

// ==================== RTC Handlers ====================
void handleRTCStatus() {
  logSerial("[Web] GET /rtc/status");
  
  if (!rtc_ok) {
    server.send(503, "application/json", "{\"error\":\"RTC not available\"}");
    return;
  }
  
  DateTime now = rtc.now();
  String json = "{";
  json += "\"year\":" + String(now.year()) + ",";
  json += "\"month\":" + String(now.month()) + ",";
  json += "\"day\":" + String(now.day()) + ",";
  json += "\"hour\":" + String(now.hour()) + ",";
  json += "\"minute\":" + String(now.minute()) + ",";
  json += "\"second\":" + String(now.second()) + ",";
  json += "\"timestamp\":" + String(now.unixtime());
  json += "}";
  server.send(200, "application/json", json);
}

void handleRTCSet() {
  logSerial("[Web] POST /rtc/set");
  
  if (!rtc_ok) {
    server.send(503, "application/json", "{\"success\":false}");
    return;
  }
  
  if (!server.hasArg("year") || !server.hasArg("month") || !server.hasArg("day") ||
      !server.hasArg("hour") || !server.hasArg("minute") || !server.hasArg("second")) {
    server.send(400, "application/json", "{\"success\":false}");
    return;
  }
  
  int year = server.arg("year").toInt();
  int month = server.arg("month").toInt();
  int day = server.arg("day").toInt();
  int hour = server.arg("hour").toInt();
  int minute = server.arg("minute").toInt();
  int second = server.arg("second").toInt();
  
  rtc.adjust(DateTime(year, month, day, hour, minute, second));
  logSerial("[OK] RTC time updated");
  
  server.send(200, "application/json", "{\"success\":true}");
}

void handleRTCSync() {
  logSerial("[Web] POST /rtc/sync");
  
  if (!rtc_ok) {
    server.send(503, "application/json", "{\"success\":false,\"message\":\"RTC not available\"}");
    return;
  }
  
  if (!server.hasArg("timestamp")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Missing timestamp parameter\"}");
    return;
  }
  
  uint32_t timestamp = server.arg("timestamp").toInt();
  
  if (timestamp < 1609459200) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Invalid timestamp\"}");
    logSerial("[ERROR] Invalid timestamp: " + String(timestamp));
    return;
  }
  
  int timezoneOffsetMinutes = 0;
  if (server.hasArg("timezoneOffset")) {
    timezoneOffsetMinutes = server.arg("timezoneOffset").toInt();
  }
  
  int32_t timezoneOffsetSeconds = timezoneOffsetMinutes * 60;
  uint32_t localTimestamp = timestamp + timezoneOffsetSeconds;
  
  rtc.adjust(DateTime(localTimestamp));
  
  DateTime now = rtc.now();
  uint32_t rtcTimestamp = now.unixtime();
  
  logSerial("[OK] RTC synced with timezone offset: " + String(timezoneOffsetMinutes) + " minutes (" + 
            String(timezoneOffsetMinutes / 60) + " hours)");
  logSerial("[OK] UTC timestamp: " + String(timestamp));
  logSerial("[OK] Local timestamp: " + String(localTimestamp));
  logSerial("[OK] RTC now: " + String(now.year()) + "-" + String(now.month()) + "-" + String(now.day()) + 
            " " + String(now.hour()) + ":" + String(now.minute()) + ":" + String(now.second()));
  
  String json = "{\"success\":true,\"message\":\"RTC synchronized successfully\",\"rtcTimestamp\":" + String(rtcTimestamp) + "}";
  server.send(200, "application/json", json);
}

// ==================== Door Control & Status ====================
void handleDoorStatus() {
  logSerial("[Web] GET /door/status");
  
  String json = "{";
  json += "\"locked\":" + String(doorLocked ? "true" : "false") + ",";
  json += "\"doorOpen\":" + String(doorOpen ? "true" : "false");
  json += "}";
  
  server.send(200, "application/json", json);
}

void handleDoorControl() {
  logSerial("[Web] POST /door/control");
  
  if (!server.hasArg("action")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Action required\"}");
    return;
  }
  
  String action = server.arg("action");
  
  if (action == "unlock") {
    String userName = "Web Admin";
    
    if (server.hasArg("name")) {
      userName = server.arg("name");
      userName.trim();
      
      if (!isUserRegistered(userName)) {
        logSerial("[Access] DENIED - User not registered: " + userName);
        server.send(403, "application/json", "{\"success\":false,\"message\":\"User not registered in database\"}");
        beepFail();
        return;
      }
      
      logSerial("[Access] GRANTED - User validated: " + userName);
    }
    
    server.send(200, "application/json", "{\"success\":true,\"status\":\"unlocked\",\"duration\":5}");
    
    lcd.clear();
    lcd.setCursor(0, 0); lcd.print("Manual Unlock");
    lcd.setCursor(0, 1); lcd.print("User: " + userName);
    
    rfidReady = false;
    setRelay(true);
    writeLog(userName, "WEB-UNLOCK", true);
    beepOK();
    
    unlockStartTime = millis();
    autoLockPending = true;
    
  } 
  else if (action == "lock") {
    autoLockPending = false;
    setRelay(false);
    server.send(200, "application/json", "{\"success\":true,\"status\":\"locked\"}");
    lcdShowIdle();
  } 
  else {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Invalid action\"}");
  }
}

// ==================== SENSOR CONTROL HANDLERS ====================
void handleSensorStatus() {
  logSerial("[Web] GET /sensor/status");
  
  String json = "{";
  json += "\"enabled\":" + String(sensorEnabled ? "true" : "false");
  json += "}";
  
  server.send(200, "application/json", json);
}

void handleSensorToggle() {
  logSerial("[Web] POST /sensor/toggle");
  
  if (!server.hasArg("enabled")) {
    server.send(400, "application/json", "{\"success\":false,\"message\":\"Parameter 'enabled' required\"}");
    return;
  }
  
  String enabledStr = server.arg("enabled");
  bool newStatus = (enabledStr == "true" || enabledStr == "1");
  
  saveSensorEnabled(newStatus);
  
  logSerial("[Sensor] Status changed to: " + String(newStatus ? "ENABLED" : "DISABLED"));
  
  if (newStatus && !rfidReady) {
    resetRFID();
  }
  
  String json = "{";
  json += "\"success\":true,";
  json += "\"enabled\":" + String(newStatus ? "true" : "false") + ",";
  json += "\"message\":\"Sensor " + String(newStatus ? "enabled" : "disabled") + " successfully\"";
  json += "}";
  
  server.send(200, "application/json", json);
}

// ==================== System Management ====================
void handleRestart() {
  logSerial("[Web] GET /system/restart");
  server.send(200, "application/json", "{\"success\":true}");
  delay(1000);
  ESP.restart();
}

void handleFactoryReset() {
  logSerial("[Web] POST /system/factory-reset");
  server.send(200, "application/json", "{\"success\":true}");
  
  clearWiFiCredentials();
  
  if (beginSDCard()) {
    SD.remove(CSV_PATH);
    SD.remove(LOG_PATH);
    ensureCSVFile();
    ensureLogFile();
  }
  
  delay(2000);
  ESP.restart();
}

// ==================== RFID Main Handler ====================
void handleRFID() {
  if (!rfidReady || scanMode) return;
  
  if (!mfrc522.PICC_IsNewCardPresent()) return;
  if (!mfrc522.PICC_ReadCardSerial()) return;
  
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  
  logSerial("[RFID] Card: " + uid);
  
  String name = getUserNameByUID(uid);
  
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Card Detected");
  lcd.setCursor(0, 1); lcd.print("UID: " + uid);
  
  if (name.length() > 0) {
    lcd.setCursor(0, 2); lcd.print("Welcome, " + name);
    lcd.setCursor(0, 3); lcd.print("Access GRANTED");
    
    logSerial("[Access] GRANTED - " + name);
    beepOK();
    
    rfidReady = false;
    setRelay(true);
    writeLog(name, uid, true);
    
    unlockStartTime = millis();
    autoLockPending = true;
    
  } else {
    lcd.setCursor(0, 2); lcd.print("Unknown Card");
    lcd.setCursor(0, 3); lcd.print("Access DENIED");
    
    logSerial("[Access] DENIED - Unknown");
    beepFail();
    writeLog("Unknown", uid, false);
    delay(2000);
    lcdShowIdle();
  }
  
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}

// ==================== Auto-Lock Handler ====================
void handleAutoLock() {
  if (!autoLockPending) return;
  
  if (millis() - unlockStartTime >= AUTO_LOCK_DURATION) {
    setRelay(false);
    autoLockPending = false;
    
    resetRFID();
    lcdShowIdle();
    
    logSerial("[Door] Auto-locked after 5 seconds");
  }
}

// ==================== Web Server Setup ====================
void setupWebServer() {
  // Static pages
  server.on("/", handleRoot);
  server.on("/users", handleUsers);
  server.on("/files", handleFileManager);
  server.on("/style.css", handleStyleCSS);
  server.on("/users.css", handleUsersCSS);
  server.on("/files.css", handleFilesCSS);
  server.on("/script.js", handleScriptJS);
  
  // Data APIs
  server.on("/users.json", handleUsersJSON);
  server.on("/access_log.json", handleAccessLogJSON);
  server.on("/export_log", handleExportLog);
  server.on("/scan", handleScan);
  server.on("/save", HTTP_POST, handleSave);
  server.on("/delete", handleDelete);
  server.on("/user/edit", HTTP_POST, handleEdit);
  server.on("/user/reorder", HTTP_POST, handleReorder);
  server.on("/serial", handleSerial);
  server.on("/serial/clear", HTTP_POST, handleSerialClear);
  
  // WiFi management
  server.on("/wifi/status", handleWiFiStatus);
  server.on("/wifi/scan", handleWiFiScan);
  server.on("/wifi/save", HTTP_POST, handleWiFiSave);
  server.on("/wifi/test", HTTP_POST, handleWiFiTest);
  server.on("/wifi/clear", handleWiFiClear);
  
  // RTC management
  server.on("/rtc/status", handleRTCStatus);
  server.on("/rtc/set", HTTP_POST, handleRTCSet);
  server.on("/rtc/sync", HTTP_POST, handleRTCSync);
  
  // Door control
  server.on("/door/status", handleDoorStatus);
  server.on("/door/control", HTTP_POST, handleDoorControl);
  
  // Sensor control
  server.on("/sensor/status", handleSensorStatus);
  server.on("/sensor/toggle", HTTP_POST, handleSensorToggle);
  
  // File manager APIs
  server.on("/api/files/list", handleFilesList);
  server.on("/api/files/download", handleFilesDownload);
  server.on("/api/files/upload", HTTP_POST, []() {
    server.send(200);
  }, handleFilesUpload);
  server.on("/api/files/delete", HTTP_POST, handleFilesDelete);
  server.on("/api/files/read", handleFilesRead);
  server.on("/api/files/write", HTTP_POST, handleFilesWrite);
  server.on("/api/files/mkdir", HTTP_POST, handleFilesMkdir);
  
  // System management
  server.on("/system/restart", handleRestart);
  server.on("/system/factory-reset", HTTP_POST, handleFactoryReset);
  
  server.onNotFound([]() {
    logSerial("[Web] 404: " + server.uri());
    server.send(404, "text/plain", "Not found");
  });
  
  server.begin();
  logSerial("[OK] Web server started");
}

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(500);
  
  Serial.println("\n\n=== ESP32 Door System v3.2 ===");
  serialBuffer = "=== ESP32 Door System Started ===\n";
  
  esp_task_wdt_deinit();
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = WDT_TIMEOUT * 1000,
    .idle_core_mask = 0,
    .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);
  logSerial("[OK] Watchdog initialized");
  
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RELAY_PIN, OUTPUT);
  pinMode(SENSOR_PIN, INPUT_PULLUP);
  digitalWrite(RELAY_PIN, RELAY_OFF_STATE);
  digitalWrite(BUZZER_PIN, LOW);
  logSerial("[OK] GPIO initialized");
  
  esp_task_wdt_reset();
  
  Wire.begin();
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("System Starting...");
  logSerial("[OK] LCD initialized");
  
  esp_task_wdt_reset();
  
  SPI.begin();
  mfrc522.PCD_Init();
  logSerial("[OK] RFID initialized");
  
  esp_task_wdt_reset();
  
  lcd.setCursor(0, 1); lcd.print("Init RTC...");
  if (!rtc.begin()) {
    logSerial("[WARN] RTC not found");
    rtc_ok = false;
  } else {
    rtc_ok = true;
    logSerial("[OK] RTC initialized");
  }
  
  esp_task_wdt_reset();
  
  lcd.setCursor(0, 2); lcd.print("Init SD Card...");
  if (!beginSDCard()) {
    logSerial("[ERROR] SD Card failed");
  } else {
    ensureCSVFile();
    ensureLogFile();
    logSerial("[OK] SD Card ready");
  }
  
  esp_task_wdt_reset();
  
  loadSensorEnabled();
  logSerial("[Sensor] Initial status: " + String(sensorEnabled ? "ENABLED" : "DISABLED"));
  
  lcd.setCursor(0, 3); lcd.print("Init WiFi...");
  String saved_ssid, saved_password;
  bool hasCredentials = loadWiFiCredentials(saved_ssid, saved_password);
  
  if (hasCredentials) {
    logSerial("[WiFi] Trying saved network: " + saved_ssid);
    if (connectToWiFi(saved_ssid, saved_password, 20)) {
      logSerial("[OK] WiFi connected");
    } else {
      logSerial("[FAIL] Connection failed - Starting AP");
      startAPMode();
    }
  } else {
    logSerial("[WiFi] No credentials - Starting AP");
    startAPMode();
  }
  
  esp_task_wdt_reset();
  
  if (WiFi.status() == WL_CONNECTED) {
    ArduinoOTA.setHostname("ESP32-Door");
    ArduinoOTA.setPassword("admin123");
    ArduinoOTA.begin();
    logSerial("[OK] OTA enabled");
    
    if (MDNS.begin("esp32-door")) {
      MDNS.addService("http", "tcp", 80);
      logSerial("[OK] mDNS started: esp32-door.local");
    }
  }
  
  esp_task_wdt_reset();
  
  setupWebServer();
  
  doorOpen = (digitalRead(SENSOR_PIN) == HIGH);
  logSerial("[Sensor] Initial door state: " + String(doorOpen ? "OPEN" : "CLOSED"));
  
  if (WiFi.getMode() == WIFI_AP) {
    logSerial("=== AP MODE ===");
    logSerial("SSID: " + String(ap_ssid));
    logSerial("IP: " + WiFi.softAPIP().toString());
  } else {
    logSerial("=== STATION MODE ===");
    logSerial("SSID: " + WiFi.SSID());
    logSerial("IP: " + WiFi.localIP().toString());
  }
  
  delay(1000);
  lcdShowIdle();
  beepReady();
  
  logSerial("=== SYSTEM READY ===");
  esp_task_wdt_reset();
}

// ==================== LOOP ====================
void loop() {
  esp_task_wdt_reset();
  
  if (WiFi.status() == WL_CONNECTED) {
    ArduinoOTA.handle();
  }
  
  server.handleClient();
  
  checkRFIDHealth();
  
  readDoorSensor();
  
  handleAutoLock();
  
  if (scanMode && millis() - scanStartTime > SCAN_TIMEOUT) {
    scanMode = false;
    lcdShowIdle();
  }
  
  handleRFID();
  
  if (millis() - lastLCDUpdate >= 1000) {
    lastLCDUpdate = millis();
    updateLCDClock();
  }
  
  delay(10);
}
