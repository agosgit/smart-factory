//node 1 - machine monitoring
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPIFFS.h>
#include <time.h>

#define SIMULATE_SENSOR_DATA true

const char* WIFI_SSID = "XinnThink";
const char* WIFI_PASSWORD = "23456789";

const char* GATEWAY_MQTT_HOST = "10.138.156.150";
const uint16_t GATEWAY_MQTT_PORT = 1883;
const char* MQTT_USER = "admin";
const char* MQTT_PASSWORD = "admin";

const char* NODE_ID = "node_1";
const char* TELEMETRY_TOPIC = "gateway/node1/telemetry";
const uint32_t SEND_INTERVAL_MS = 3000;
const int LED_PIN = 2;
const char* THRESHOLD_TOPIC = "gateway/config/threshold";
const char* THRESHOLD_FILE  = "/threshold.json";  // Path penyimpanan SPIFFS

// Threshold dinamis — diperbarui dari server via MQTT
float THRESHOLD_TEMP    = 70.0;   // °C
float THRESHOLD_VIB     = 1.5;    // g
float THRESHOLD_CURRENT = 10.0;   // A

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
unsigned long lastSend = 0;

void blinkLED() {
  digitalWrite(LED_PIN, HIGH);
  delay(100);
  digitalWrite(LED_PIN, LOW);
  delay(100);
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Connecting to WiFi");
  unsigned long start1 = millis();
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print('.');
    delay(500);
    if (millis() - start1 > 20000) {
      Serial.println("\nWiFi connection timeout.");
      return;
    }
  }

  Serial.println();
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());

  // configTime(0, 0, "pool.ntp.org", "time.google.com");
  configTime(25200, 0, "pool.ntp.org", "time.google.com");
  Serial.print("Waiting for NTP time sync");
  time_t now = time(nullptr);
  unsigned long start2 = millis();
  while (now < 1650000000 && millis() - start2 < 20000) {
    Serial.print('.');
    delay(500);
    now = time(nullptr);
  }
  Serial.println();
  if (now < 1650000000) {
    Serial.println("NTP time sync failed, proceeding with local uptime timestamp.");
  } else {
    struct tm timeinfo;
    // gmtime_r(&now, &timeinfo);
    localtime_r(&now, &timeinfo);
    char buffer[32];
    // strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    strftime(buffer,
         sizeof(buffer),
         "%Y-%m-%d %H:%M:%S",
         &timeinfo);
    Serial.print("NTP time synced: ");
    Serial.println(buffer);
  }
}

// Simpan threshold ke SPIFFS sebagai JSON
void saveThresholds() {
  File f = SPIFFS.open(THRESHOLD_FILE, FILE_WRITE);
  if (!f) {
    Serial.println("[SPIFFS] Gagal membuka file untuk tulis.");
    return;
  }
  StaticJsonDocument<128> doc;
  doc["temp_machine"] = THRESHOLD_TEMP;
  doc["vibration"]    = THRESHOLD_VIB;
  doc["current"]      = THRESHOLD_CURRENT;
  serializeJson(doc, f);
  f.close();
  Serial.println("[SPIFFS] Threshold disimpan ke " + String(THRESHOLD_FILE));
}

// Muat threshold dari SPIFFS saat boot (fallback ke default jika file belum ada)
void loadThresholds() {
  if (!SPIFFS.exists(THRESHOLD_FILE)) {
    Serial.println("[SPIFFS] File threshold belum ada, pakai nilai default.");
    return;
  }
  File f = SPIFFS.open(THRESHOLD_FILE, FILE_READ);
  if (!f) {
    Serial.println("[SPIFFS] Gagal membuka file threshold.");
    return;
  }
  StaticJsonDocument<128> doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();
  if (err) {
    Serial.println("[SPIFFS] JSON rusak, pakai nilai default.");
    return;
  }
  if (doc.containsKey("temp_machine")) THRESHOLD_TEMP    = doc["temp_machine"].as<float>();
  if (doc.containsKey("vibration"))    THRESHOLD_VIB     = doc["vibration"].as<float>();
  if (doc.containsKey("current"))      THRESHOLD_CURRENT = doc["current"].as<float>();
  Serial.println("[SPIFFS] Threshold dimuat dari flash:");
  Serial.printf("  temp_machine=%.1f C  vibration=%.2f g  current=%.1f A\n",
                THRESHOLD_TEMP, THRESHOLD_VIB, THRESHOLD_CURRENT);
}

// Callback: terima threshold baru dari server via gateway
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, THRESHOLD_TOPIC) != 0) return;

  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, msg) != DeserializationError::Ok) {
    Serial.println("[THRESHOLD] JSON parse error.");
    return;
  }

  bool updated = false;
  if (doc.containsKey("temp_machine"))  { THRESHOLD_TEMP    = doc["temp_machine"].as<float>(); updated = true; }
  if (doc.containsKey("vibration"))     { THRESHOLD_VIB     = doc["vibration"].as<float>();    updated = true; }
  if (doc.containsKey("current"))       { THRESHOLD_CURRENT = doc["current"].as<float>();      updated = true; }

  if (updated) {
    Serial.println("[THRESHOLD] Diperbarui dari server:");
    Serial.printf("  temp_machine=%.1f C  vibration=%.2f g  current=%.1f A\n",
                  THRESHOLD_TEMP, THRESHOLD_VIB, THRESHOLD_CURRENT);
    saveThresholds();  // Simpan ke SPIFFS agar persist setelah restart
  }
}

void connectMqtt() {
  if (mqttClient.connected()) {
    return;
  }

  mqttClient.setServer(GATEWAY_MQTT_HOST, GATEWAY_MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);

  Serial.print("Connecting to MQTT broker at ");
  Serial.print(GATEWAY_MQTT_HOST);
  Serial.print(":");
  Serial.println(GATEWAY_MQTT_PORT);

  String clientId = String(NODE_ID) + "-" + WiFi.macAddress();

  while (!mqttClient.connected()) {
    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD)) {
      Serial.println("MQTT connected.");
      mqttClient.subscribe(THRESHOLD_TOPIC);
      Serial.print("Subscribed to: ");
      Serial.println(THRESHOLD_TOPIC);
      break;
    }
    Serial.print('.');
    delay(2000);
  }
}

float readTemperature() {
#if SIMULATE_SENSOR_DATA
  return random(450, 650) / 10.0;
#else
  // Ganti dengan pembacaan sensor DHT/DS18B20 nyata
  return 0.0;
#endif
}

float readVibration() {
#if SIMULATE_SENSOR_DATA
  return random(20, 120) / 100.0;
#else
  // Ganti dengan pembacaan sensor MPU6050 nyata
  return 0.0;
#endif
}

float readCurrent() {
#if SIMULATE_SENSOR_DATA
  return random(10, 50) / 10.0;
#else
  // Ganti dengan pembacaan sensor PZEM004T / ACS712 nyata
  return 0.0;
#endif
}

float readVoltage() {
#if SIMULATE_SENSOR_DATA
  return random(2190, 2230) / 10.0;
#else
  // Ganti dengan pembacaan sensor tegangan nyata
  return 0.0;
#endif
}

void buildTelemetryPayload(String &payload) {
  StaticJsonDocument<256> doc;
  doc["node_id"] = NODE_ID;

  time_t now = time(nullptr);
  if (now >= 1650000000) {
    struct tm timeinfo;
    // gmtime_r(&now, &timeinfo);
    localtime_r(&now, &timeinfo);
    char buffer[32];
    // strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    strftime(buffer,
         sizeof(buffer),
         "%Y-%m-%d %H:%M:%S",
         &timeinfo);
    doc["timestamp"] = buffer;
    doc["timestamp_ms"] = (unsigned long)now * 1000 + (millis() % 1000);
  } else {
    doc["timestamp"] = String(millis());
    doc["timestamp_ms"] = millis();
  }

  float temperature = readTemperature();
  float vibration = readVibration();
  float current = readCurrent();
  float voltage = readVoltage();

  bool anomaly = (temperature > THRESHOLD_TEMP) || (vibration > THRESHOLD_VIB) || (current > THRESHOLD_CURRENT);
  doc["status"] = anomaly ? "ANOMALY" : "NORMAL";

  JsonObject sensor = doc.createNestedObject("sensor");
  sensor["temperature"] = temperature;
  sensor["vibration"] = vibration;
  sensor["current"] = current;
  sensor["voltage"] = voltage;

  serializeJson(doc, payload);
}

void publishTelemetry() {
  if (!mqttClient.connected()) {
    Serial.println("MQTT disconnected, reattempting connection...");
    connectMqtt();
  }

  if (!mqttClient.connected()) {
    Serial.println("Unable to publish: MQTT not connected.");
    return;
  }

  String payload;
  buildTelemetryPayload(payload);

  if (mqttClient.publish(TELEMETRY_TOPIC, payload.c_str())) {
    Serial.println("Published Node 1 telemetry:");
    Serial.println(payload);
    blinkLED();
  } else {
    Serial.println("Publish failed for Node 1 telemetry.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // Mount SPIFFS dan load threshold tersimpan sebelum connect
  if (!SPIFFS.begin(true)) {
    Serial.println("[SPIFFS] Mount gagal!");
  } else {
    Serial.println("[SPIFFS] Mount OK.");
    loadThresholds();
  }

  randomSeed(analogRead(0));
  connectWiFi();
  mqttClient.setServer(GATEWAY_MQTT_HOST, GATEWAY_MQTT_PORT);
  connectMqtt();

  Serial.println("Node 1 Machine Monitoring initialized.");
  Serial.print("Device MAC: ");
  Serial.println(WiFi.macAddress());
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqttClient.connected()) {
    connectMqtt();
  }

  mqttClient.loop();

  if (millis() - lastSend >= SEND_INTERVAL_MS) {
    lastSend = millis();
    publishTelemetry();
  }
}
