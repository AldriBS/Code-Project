/*
 * =====================================================================
 * KOMATSU HYDRAULIC PLANT - FLOOD PREVENTION CONTROL SYSTEM
 * Area 2: Trafo Room Water Pit - Version 2.1 (State Reset + Continuous Relay)
 * =====================================================================
 */

#include <WiFi.h>
#include <WiFiManager.h>
#include <Firebase_ESP_Client.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <ESPmDNS.h>
#include <time.h>

#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// ==================== PIN DEFINITIONS ====================
#define TRIG_PIN        5
#define ECHO_PIN        18
#define CURRENT_PIN     34
#define RELAY_PIN       21

#define RELAY_ON_STATE   LOW   // LOW  = coil ON
#define RELAY_OFF_STATE  HIGH  // HIGH = coil OFF (open drain hi-Z)

// ==================== WATER LEVEL CONSTANTS ====================
#define MAX_DISTANCE    100.0
#define MIN_DISTANCE    10.0
#define PIT_DEPTH       90.0

// ==================== CURRENT SENSOR CONSTANTS ====================
#define VREF                  3.3
#define ADC_RESOLUTION        4096
#define CURRENT_SAMPLES       100
#define PUMP_THRESHOLD        0.5
#define CURRENT_NOISE_THRESHOLD 10.0

// Timing Constants
#define SENSOR_INTERVAL          1000   // Read sensors every 1 second
#define FIREBASE_INTERVAL        2000   // Push data to Firebase every 2 seconds
#define HEALTH_REPORT_INTERVAL   60000  // Health report every 60 seconds
#define ERROR_DEBOUNCE_TIME      10000  // Don't repeat same error within 10 seconds
#define WIFI_TIMEOUT             180    // WiFi connection timeout (seconds)

// Interval khusus polling perintah pompa dari Firebase
#define COMMAND_POLL_INTERVAL    1000   // Cek pumpCommand tiap 1 detik


#define ULTRASONIC_TIMEOUT       30000
#define ULTRASONIC_RETRIES       3

// ==================== FIREBASE CONFIG ====================
#define FIREBASE_HOST "hyd-flood-control-system-default-rtdb.asia-southeast1.firebasedatabase.app"
#define API_KEY       "AIzaSyBdBaRFxbZBSXfi44SJdlK1mUwaL-AM6LI"
#define USER_EMAIL    "aldri.siadari@gmail.com"
#define USER_PASSWORD "ACMTFPNJdri@1103"

// ==================== DEVICE STATUS ENUM ====================
enum DeviceStatus {
  DEV_UNKNOWN,
  DEV_CHECKING,
  DEV_CONNECTED,
  DEV_WORKING,
  DEV_ERROR,
  DEV_DISCONNECTED
};

struct DeviceHealth {
  DeviceStatus status;
  String statusText;
  unsigned long lastStateChange;
  unsigned long lastErrorReport;
  int consecutiveErrors;
  int consecutiveSuccess;
  bool hasEverWorked;
};

// ==================== GLOBAL OBJECTS ====================
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
WiFiManager wifiManager;

// ==================== DEVICE HEALTH INSTANCES ====================
DeviceHealth ultrasonicHealth    = {DEV_UNKNOWN, "Unknown", 0, 0, 0, 0, false};
DeviceHealth currentSensorHealth = {DEV_UNKNOWN, "Unknown", 0, 0, 0, 0, false};
DeviceHealth relayHealth         = {DEV_UNKNOWN, "Unknown", 0, 0, 0, 0, false};
DeviceHealth firebaseHealth      = {DEV_UNKNOWN, "Unknown", 0, 0, 0, 0, false};
DeviceHealth wifiHealth          = {DEV_UNKNOWN, "Unknown", 0, 0, 0, 0, false};

// ==================== GLOBAL VARIABLES ====================
float waterLevel      = 0.0;
float waterHeight     = 0.0;
float currentRMS      = 0.0;

bool  pumpStatus      = false;   // status yang dikirim ke Firebase
bool  lastPumpCommand = false;   // mirror /area2/pumpCommand

// Timing variables
unsigned long lastSensorRead      = 0;
unsigned long lastFirebaseUpdate  = 0;
unsigned long lastHealthReport    = 0;
unsigned long lastCommandPoll     = 0;

bool firebaseReady = false;

// ==================== FORWARD DECLARATIONS ====================
void setupWiFi();
void setupFirebase();
void setupOTA();
void initializeDevices();
void readWaterLevel();
void readCurrent();
void updateFirebase();
void checkFirebaseCommand();
void controlRelay(bool on);
void updateDeviceStatus(DeviceHealth &device, DeviceStatus newStatus, String statusText);
void printStartupHealthCheck();
void printPeriodicHealthReport();
void printDeviceStatusChange(String deviceName, DeviceHealth &device);
String getFormattedTime();
String getDeviceStatusIcon(DeviceStatus status);
String getDeviceStatusText(DeviceStatus status);

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("=============================================");
  Serial.println(" KOMATSU FLOOD CONTROL - AREA 2 v2.1");
  Serial.println(" Trafo Room Water Pit");
  Serial.println("=============================================\n");

  pinMode(TRIG_PIN,   OUTPUT);
  pinMode(ECHO_PIN,   INPUT);
  pinMode(CURRENT_PIN, INPUT);

  // Relay open-drain: HIGH = OFF, LOW = ON
  pinMode(RELAY_PIN, OUTPUT_OPEN_DRAIN);
  digitalWrite(RELAY_PIN, RELAY_OFF_STATE);  // pastikan OFF saat boot

  Serial.println("✓ GPIO pins initialized\n");

  setupWiFi();
  setupFirebase();   // di sini sekaligus reset state pompa di Firebase
  setupOTA();

  configTime(7 * 3600, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("✓ NTP time configured (GMT+7)\n");

  initializeDevices();
  printStartupHealthCheck();

  Serial.println("=============================================");
  Serial.println(" System Ready - Monitoring Active");
  Serial.println("=============================================\n");
}

// ==================== LOOP ====================
void loop() {
  ArduinoOTA.handle();

  unsigned long now = millis();

  // 1) Baca sensor lebih sering
  if (now - lastSensorRead >= SENSOR_INTERVAL) {
    readWaterLevel();
    readCurrent();
    lastSensorRead = now;
  }

  // 2) Polling perintah pompa tiap 1 detik (lebih cepat dari update data)
  if (firebaseReady && (now - lastCommandPoll >= COMMAND_POLL_INTERVAL)) {
    checkFirebaseCommand();
    lastCommandPoll = now;
  }

  // 3) Kirim data ke Firebase tiap 2 detik
  if (firebaseReady && (now - lastFirebaseUpdate >= FIREBASE_INTERVAL)) {
    updateFirebase();
    lastFirebaseUpdate = now;
  }

  // 4) Laporan health tiap 60 detik (tetap sama)
  if (now - lastHealthReport >= HEALTH_REPORT_INTERVAL) {
    printPeriodicHealthReport();
    lastHealthReport = now;
  }

  delay(10);
}

// ==================== WIFI ====================
void setupWiFi() {
  Serial.println("⚙ Initializing WiFi Manager...");

  updateDeviceStatus(wifiHealth, DEV_CHECKING, "Connecting to WiFi");

  wifiManager.setConfigPortalTimeout(WIFI_TIMEOUT);
  wifiManager.setAPCallback([](WiFiManager *myWiFiManager) {
    Serial.println("\n📡 WiFi Configuration Mode");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("AP Name: Komatsu_Area2_Setup");
    Serial.println("AP Password: komatsu2024");
    Serial.println("IP Address: 192.168.4.1");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
  });

  if (!wifiManager.autoConnect("Komatsu_Area2_Setup", "komatsu2024")) {
    updateDeviceStatus(wifiHealth, DEV_ERROR, "Failed to connect");
    Serial.println("⚠ Restarting ESP32...");
    delay(3000);
    ESP.restart();
  }

  updateDeviceStatus(wifiHealth, DEV_WORKING, "Connected - " + WiFi.localIP().toString());

  Serial.println("✓ WiFi connected successfully");
  Serial.print("📶 SSID: ");
  Serial.println(WiFi.SSID());
  Serial.print("🌐 IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("📊 Signal: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm\n");
}

// ==================== FIREBASE ====================
void setupFirebase() {
  Serial.println("⚙ Initializing Firebase...");

  updateDeviceStatus(firebaseHealth, DEV_CHECKING, "Authenticating");

  config.api_key      = API_KEY;
  config.database_url = FIREBASE_HOST;
  auth.user.email     = USER_EMAIL;
  auth.user.password  = USER_PASSWORD;
  config.token_status_callback = tokenStatusCallback;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  fbdo.setResponseSize(2048);

  Serial.print("🔐 Authenticating");
  int attempts = 0;
  while (!Firebase.ready() && attempts < 30) {
    Serial.print(".");
    delay(1000);
    attempts++;
  }
  Serial.println();

  if (Firebase.ready()) {
    firebaseReady = true;
    updateDeviceStatus(firebaseHealth, DEV_WORKING, "Connected & Authenticated");
    Serial.println("✓ Firebase connected successfully");
    Serial.println("✓ Authentication complete\n");

    // ================== RESET STATE POMPA DI FIREBASE ==================
    Serial.println("🔁 Reset initial pump state di Firebase (/area2)");
    lastPumpCommand = false;
    pumpStatus      = false;
    controlRelay(false);   // pastikan relay OFF secara fisik

    // push nilai awal supaya dashboard & DB konsisten
    Firebase.RTDB.setBool(&fbdo, "/area2/pumpCommand", false);
    Firebase.RTDB.setBool(&fbdo, "/area2/pumpStatus",  false);
    // ===================================================================

  } else {
    updateDeviceStatus(firebaseHealth, DEV_ERROR, "Connection failed");
    Serial.println("⚠ Firebase connection failed");
    Serial.println("⚠ Running in offline mode\n");
  }
}

// ==================== OTA ====================
void setupOTA() {
  Serial.println("⚙ Setting up Arduino OTA...");

  ArduinoOTA.setHostname("Komatsu-Area2");
  ArduinoOTA.setPassword("komatsu2024");
  ArduinoOTA.setPort(3232);

  ArduinoOTA.onStart([]() {
    firebaseReady = false;
    Serial.println("\n📥 OTA Update Starting...");
  });

  ArduinoOTA.onEnd([]() {
    Serial.println("\n✓ OTA Update Complete!");
  });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    static unsigned int lastPercent = 0;
    unsigned int percent = (progress / (total / 100));
    if (percent != lastPercent && percent % 10 == 0) {
      Serial.printf("📊 OTA Progress: %u%%\n", percent);
      lastPercent = percent;
    }
  });

  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("❌ OTA Error[%u]: ", error);
    if (error == OTA_AUTH_ERROR)        Serial.println("Auth Failed");
    else if (error == OTA_BEGIN_ERROR)  Serial.println("Begin Failed");
    else if (error == OTA_CONNECT_ERROR)Serial.println("Connect Failed");
    else if (error == OTA_RECEIVE_ERROR)Serial.println("Receive Failed");
    else if (error == OTA_END_ERROR)    Serial.println("End Failed");
    firebaseReady = true;
  });

  ArduinoOTA.begin();

  Serial.println("✓ Arduino OTA initialized");
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Serial.println("📡 OTA: Komatsu-Area2");
  Serial.println("🔑 Password: komatsu2024");
  Serial.print("🌐 IP: ");
  Serial.println(WiFi.localIP());
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ==================== INITIALIZE DEVICES ====================
void initializeDevices() {
  Serial.println("🔍 Checking connected devices...\n");

  // Relay self-test kecil biar ketahuan hidup
  updateDeviceStatus(relayHealth, DEV_CHECKING, "Testing relay");
  digitalWrite(RELAY_PIN, RELAY_ON_STATE);
  delay(100);
  digitalWrite(RELAY_PIN, RELAY_OFF_STATE);
  updateDeviceStatus(relayHealth, DEV_WORKING, "Ready");

  updateDeviceStatus(ultrasonicHealth,    DEV_CHECKING, "Testing HC-SR04");
  updateDeviceStatus(currentSensorHealth,  DEV_CHECKING, "Calibrating");
}

// ==================== WATER LEVEL READING ====================
void readWaterLevel() {
  bool  readingValid = false;
  float distance     = 0;

  for (int attempt = 0; attempt < ULTRASONIC_RETRIES && !readingValid; attempt++) {
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);

    long duration = pulseIn(ECHO_PIN, HIGH, ULTRASONIC_TIMEOUT);
    distance = duration * 0.034 / 2.0;

    if (distance > MIN_DISTANCE && distance <= MAX_DISTANCE) {
      readingValid = true;

      waterHeight = PIT_DEPTH - distance;
      if (waterHeight < 0)         waterHeight = 0;
      if (waterHeight > PIT_DEPTH) waterHeight = PIT_DEPTH;

      waterLevel = (waterHeight / PIT_DEPTH) * 10.0;
      if (waterLevel < 0)  waterLevel = 0;
      if (waterLevel > 10) waterLevel = 10;

      if (ultrasonicHealth.status != DEV_WORKING) {
        updateDeviceStatus(ultrasonicHealth, DEV_WORKING, "HC-SR04 operational");
        printDeviceStatusChange("HC-SR04", ultrasonicHealth);
      }
      ultrasonicHealth.consecutiveSuccess++;
      ultrasonicHealth.consecutiveErrors = 0;
      ultrasonicHealth.hasEverWorked = true;

      static float         lastPrintedLevel = -1;
      static unsigned long lastPrintTime    = 0;
      bool shouldPrint = false;

      if (abs(waterLevel - lastPrintedLevel) >= 0.5) shouldPrint = true;
      if (waterLevel >= 6.0 && lastPrintedLevel < 6.0) shouldPrint = true;
      if (waterLevel >= 8.0) shouldPrint = true;
      if (millis() - lastPrintTime > 30000) shouldPrint = true;

      if (shouldPrint) {
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Serial.println("💧 WATER LEVEL - Area 2");
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Serial.printf("📏 Distance: %.1f cm\n", distance);
        Serial.printf("📊 Water Height: %.1f cm\n", waterHeight);
        Serial.printf("📈 Level (0-10): %.1f\n", waterLevel);

        if (waterLevel >= 8.0) {
          Serial.println("⚠️  WARNING: CRITICAL LEVEL!");
        } else if (waterLevel >= 6.0) {
          Serial.println("⚠️  WARNING: High Level");
        } else {
          Serial.println("✓ Status: Normal");
        }
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        lastPrintedLevel = waterLevel;
        lastPrintTime    = millis();
      }

    } else {
      ultrasonicHealth.consecutiveErrors++;
      ultrasonicHealth.consecutiveSuccess = 0;

      if (attempt == ULTRASONIC_RETRIES - 1) {
        if (ultrasonicHealth.consecutiveErrors >= 3 && ultrasonicHealth.status != DEV_ERROR) {
          updateDeviceStatus(ultrasonicHealth, DEV_ERROR, "No valid reading");
          if (millis() - ultrasonicHealth.lastErrorReport > ERROR_DEBOUNCE_TIME) {
            Serial.println("⚠️  HC-SR04: No valid reading (check wiring)");
            ultrasonicHealth.lastErrorReport = millis();
          }
        } else if (!ultrasonicHealth.hasEverWorked && ultrasonicHealth.status != DEV_DISCONNECTED) {
          updateDeviceStatus(ultrasonicHealth, DEV_DISCONNECTED, "Not detected");
          if (millis() - ultrasonicHealth.lastErrorReport > ERROR_DEBOUNCE_TIME) {
            Serial.println("⚠️  HC-SR04: Sensor not detected (will retry)");
            ultrasonicHealth.lastErrorReport = millis();
          }
        }
      }
    }

    if (!readingValid && attempt < ULTRASONIC_RETRIES - 1) {
      delay(50);
    }
  }
}

// ==================== CURRENT SENSOR READING ====================
void readCurrent() {
  float sumSquares = 0;
  int   validSamples = 0;
  float rawADCSum = 0;

  for (int i = 0; i < CURRENT_SAMPLES; i++) {
    int adcValue = analogRead(CURRENT_PIN);
    rawADCSum += adcValue;

    float voltage = (adcValue / (float)ADC_RESOLUTION) * VREF;
    voltage = voltage - (VREF / 2.0);

    if (abs(voltage) < (VREF / 2.0)) {
      sumSquares += voltage * voltage;
      validSamples++;
    }

    delayMicroseconds(200);
  }

  float avgADC = rawADCSum / CURRENT_SAMPLES;
  bool sensorDisconnected = (avgADC < 100 || avgADC > 3996);

  if (sensorDisconnected) {
    currentRMS = 0;

    if (currentSensorHealth.status != DEV_DISCONNECTED) {
      updateDeviceStatus(currentSensorHealth, DEV_DISCONNECTED, "Sensor not connected");
      if (millis() - currentSensorHealth.lastErrorReport > ERROR_DEBOUNCE_TIME) {
        Serial.println("⚠️  SCT013: Sensor not detected (ADC out of range)");
        Serial.printf("   ADC Value: %.0f (expected ~2048)\n", avgADC);
        Serial.println("   Please connect SCT013 sensor");
        currentSensorHealth.lastErrorReport = millis();
      }
    }
    return;
  }

  if (validSamples > CURRENT_SAMPLES / 2) {
    float rmsVoltage = sqrt(sumSquares / validSamples);
    currentRMS = rmsVoltage * 30.0;  // SCT013-030 30A/1V

    if (currentRMS > CURRENT_NOISE_THRESHOLD) {
      if (currentSensorHealth.consecutiveErrors == 0) {
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Serial.println("⚠️  CURRENT SENSOR WARNING");
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Serial.printf("📊 Noise Level: %.1fA (too high!)\n", currentRMS);
        Serial.println("🔧 Possible causes:");
        Serial.println("   - SCT013 not clamped properly");
        Serial.println("   - Loose wire connection");
        Serial.println("   - External interference");
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      }

      currentRMS = 0;
      currentSensorHealth.consecutiveErrors++;

      if (currentSensorHealth.consecutiveErrors >= 5 && currentSensorHealth.status != DEV_ERROR) {
        updateDeviceStatus(currentSensorHealth, DEV_ERROR, "High noise - check connection");
        if (millis() - currentSensorHealth.lastErrorReport > ERROR_DEBOUNCE_TIME) {
          Serial.println("⚠️  SCT013: Persistent high noise - please check sensor");
          currentSensorHealth.lastErrorReport = millis();
        }
      }
    } else {
      if (currentSensorHealth.status != DEV_WORKING) {
        updateDeviceStatus(currentSensorHealth, DEV_WORKING, "Operational");
        printDeviceStatusChange("SCT013", currentSensorHealth);

        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Serial.println("✓ CURRENT SENSOR OK");
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Serial.printf("📊 Current: %.2f A\n", currentRMS);
        Serial.println("✓ Sensor connected properly");
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      }

      currentSensorHealth.consecutiveSuccess++;
      if (currentSensorHealth.consecutiveErrors > 0) {
        currentSensorHealth.consecutiveErrors--;
      }
      currentSensorHealth.hasEverWorked = true;
    }

    // Jika SCT WORKING, status pompa ikut arus aktual
    if (currentSensorHealth.status == DEV_WORKING) {
      bool currentPumpStatus = (currentRMS >= PUMP_THRESHOLD);
      if (currentPumpStatus != pumpStatus) {
        pumpStatus = currentPumpStatus;

        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Serial.println("⚡ PUMP STATUS CHANGE - Area 2 (by current)");
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
        Serial.printf("📊 Current: %.2f A\n", currentRMS);
        Serial.printf("🔌 Pump: %s\n", pumpStatus ? "ON ✓" : "OFF ✗");
        Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      }
    }

  } else {
    if (currentSensorHealth.status != DEV_ERROR) {
      updateDeviceStatus(currentSensorHealth, DEV_ERROR, "Too many invalid samples");
    }
    currentRMS = 0;
  }
}

// ==================== FIREBASE UPDATE ====================
void updateFirebase() {
  if (!Firebase.ready()) {
    if (firebaseHealth.status != DEV_ERROR) {
      updateDeviceStatus(firebaseHealth, DEV_ERROR, "Not ready");
    }
    return;
  }

  // Kalau SCT TIDAK WORKING, status pompa dikunci ke perintah terakhir
  if (currentSensorHealth.status != DEV_WORKING) {
    pumpStatus = lastPumpCommand;
  }

  FirebaseJson json;
  json.set("waterLevel",  waterLevel);
  json.set("waterHeight", waterHeight);
  json.set("pumpStatus",  pumpStatus);
  json.set("current",     currentRMS);
  json.set("timestamp",   getFormattedTime());
  json.set("online",      true);

  // tambahan opsional: laporkan sensorOnline ke web
  json.set("sensorOnline", ultrasonicHealth.status == DEV_WORKING);

  if (Firebase.RTDB.updateNode(&fbdo, "/area2", &json)) {
    if (firebaseHealth.status != DEV_WORKING) {
      updateDeviceStatus(firebaseHealth, DEV_WORKING, "Synced");
    }
    firebaseHealth.consecutiveSuccess++;
    firebaseHealth.consecutiveErrors = 0;

    Serial.printf("→ Firebase sync: pumpCommand=%s, pumpStatus=%s\n",
                  lastPumpCommand ? "true" : "false",
                  pumpStatus      ? "true" : "false");
  } else {
    firebaseHealth.consecutiveErrors++;
    if (firebaseHealth.consecutiveErrors >= 3 && firebaseHealth.status != DEV_ERROR) {
      updateDeviceStatus(firebaseHealth, DEV_ERROR, "Update failed");
      if (millis() - firebaseHealth.lastErrorReport > ERROR_DEBOUNCE_TIME) {
        Serial.printf("⚠️  Firebase: %s\n", fbdo.errorReason().c_str());
        firebaseHealth.lastErrorReport = millis();
      }
    }
  }
}

// ==================== CHECK FIREBASE COMMAND ====================
void checkFirebaseCommand() {
  if (!Firebase.ready()) return;

  if (Firebase.RTDB.getBool(&fbdo, "/area2/pumpCommand")) {
    bool command = fbdo.boolData();

    if (command != lastPumpCommand) {
      lastPumpCommand = command;

      // Kalau SCT belum WORKING, status pompa virtual ikut perintah
      if (currentSensorHealth.status != DEV_WORKING) {
        pumpStatus = command;
      }

      Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
      Serial.println("📱 COMMAND FROM WEB (Area 2)");
      Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
      Serial.printf("🎛️  Command: %s\n", command ? "START PUMP" : "STOP PUMP");
      Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      // Jalankan relay
      controlRelay(command);

      // Kalau current sensor belum WORKING, status pompa ikut perintah
      if (currentSensorHealth.status != DEV_WORKING) {
        pumpStatus = command;
      }

      // KIRIM KONFIRMASI LANGSUNG ke Firebase
      updateFirebase();
      
    }
  }
}

// ==================== RELAY CONTROL ====================
void controlRelay(bool on) {
  if (on) {
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("⚡ RELAY ON (CONTINUOUS)");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    digitalWrite(RELAY_PIN, RELAY_ON_STATE);
    updateDeviceStatus(relayHealth, DEV_WORKING, "Relay ON");
  } else {
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━");
    Serial.println("⚡ RELAY OFF");
    Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    digitalWrite(RELAY_PIN, RELAY_OFF_STATE);
    updateDeviceStatus(relayHealth, DEV_WORKING, "Relay OFF");
  }
}

// ==================== DEVICE STATUS HELPERS ====================
void updateDeviceStatus(DeviceHealth &device, DeviceStatus newStatus, String statusText) {
  if (device.status != newStatus) {
    device.status      = newStatus;
    device.statusText  = statusText;
    device.lastStateChange = millis();
  } else {
    device.statusText = statusText;
  }
}

void printDeviceStatusChange(String name, DeviceHealth &device) {
  Serial.printf("[%s] %s %s → %s\n",
                getFormattedTime().c_str(),
                getDeviceStatusIcon(device.status).c_str(),
                name.c_str(),
                device.statusText.c_str());
}

// ==================== STARTUP HEALTH CHECK ====================
void printStartupHealthCheck() {
  Serial.println("\n=============================================");
  Serial.println(" 🔍 DEVICE HEALTH CHECK - Area 2");
  Serial.println("=============================================");
  Serial.println("┌─────────────────────────────────────────┐");

  Serial.printf("│ %s WiFi: %s\n",
                getDeviceStatusIcon(wifiHealth.status).c_str(),
                wifiHealth.statusText.c_str());

  Serial.printf("│ %s Firebase: %s\n",
                getDeviceStatusIcon(firebaseHealth.status).c_str(),
                firebaseHealth.statusText.c_str());

  Serial.printf("│ %s HC-SR04: %s\n",
                getDeviceStatusIcon(ultrasonicHealth.status).c_str(),
                ultrasonicHealth.statusText.c_str());

  Serial.printf("│ %s SCT013: %s\n",
                getDeviceStatusIcon(currentSensorHealth.status).c_str(),
                currentSensorHealth.statusText.c_str());

  Serial.printf("│ %s Relay: %s\n",
                getDeviceStatusIcon(relayHealth.status).c_str(),
                relayHealth.statusText.c_str());

  Serial.println("└─────────────────────────────────────────┘\n");
}

// ==================== PERIODIC HEALTH REPORT ====================
void printPeriodicHealthReport() {
  Serial.println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Serial.printf("📊 HEALTH REPORT [%s]\n", getFormattedTime().c_str());
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  Serial.printf("📶 WiFi: %s | Signal: %d dBm\n",
                getDeviceStatusText(wifiHealth.status).c_str(), WiFi.RSSI());

  Serial.printf("☁️  Firebase: %s\n",
                getDeviceStatusText(firebaseHealth.status).c_str());

  Serial.printf("📏 HC-SR04: %s",
                getDeviceStatusText(ultrasonicHealth.status).c_str());
  if (ultrasonicHealth.status == DEV_WORKING) {
    Serial.printf(" | Level: %.1f\n", waterLevel);
  } else {
    Serial.println();
  }

  Serial.printf("⚡ SCT013: %s",
                getDeviceStatusText(currentSensorHealth.status).c_str());
  if (currentSensorHealth.status == DEV_WORKING) {
    Serial.printf(" | Current: %.2fA\n", currentRMS);
  } else {
    Serial.println();
  }

  Serial.printf("🔌 Relay: %s\n", getDeviceStatusText(relayHealth.status).c_str());
  Serial.printf("💾 Free Heap: %d bytes\n", ESP.getFreeHeap());
  Serial.printf("⏱️  Uptime: %lu seconds\n", millis() / 1000);

  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

// ==================== STATUS ICON/TEXT ====================
String getDeviceStatusIcon(DeviceStatus status) {
  switch (status) {
    case DEV_WORKING:      return "✓";
    case DEV_CONNECTED:    return "◉";
    case DEV_CHECKING:     return "◌";
    case DEV_ERROR:        return "⚠";
    case DEV_DISCONNECTED: return "✗";
    default:               return "?";
  }
}

String getDeviceStatusText(DeviceStatus status) {
  switch (status) {
    case DEV_WORKING:      return "Working";
    case DEV_CONNECTED:    return "Connected";
    case DEV_CHECKING:     return "Checking";
    case DEV_ERROR:        return "Error";
    case DEV_DISCONNECTED: return "Disconnected";
    default:               return "Unknown";
  }
}

// ==================== TIME HELPER ====================
String getFormattedTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "N/A";
  }
  char timeString[30];
  strftime(timeString, sizeof(timeString), "%Y-%m-%d %H:%M:%S", &timeinfo);
  return String(timeString);
}

// ==================== END OF CODE ====================
