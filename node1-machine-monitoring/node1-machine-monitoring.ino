#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

#define SIMULATE_SENSOR_DATA true

const char* WIFI_SSID = "XinnThink";
const char* WIFI_PASSWORD = "23456789";

const char* GATEWAY_MQTT_HOST = "172.29.242.150";
const uint16_t GATEWAY_MQTT_PORT = 1883;
const char* MQTT_USER = "admin";
const char* MQTT_PASSWORD = "admin";

const char* NODE_ID = "node_1";
const char* TELEMETRY_TOPIC = "gateway/node1/telemetry";
const uint32_t SEND_INTERVAL_MS = 3000;
const int LED_PIN = 2;

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

  configTime(0, 0, "pool.ntp.org", "time.google.com");
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
    gmtime_r(&now, &timeinfo);
    char buffer[32];
    strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
    Serial.print("NTP time synced: ");
    Serial.println(buffer);
  }
}

void connectMqtt() {
  if (mqttClient.connected()) {
    return;
  }

  mqttClient.setServer(GATEWAY_MQTT_HOST, GATEWAY_MQTT_PORT);

  Serial.print("Connecting to MQTT broker at ");
  Serial.print(GATEWAY_MQTT_HOST);
  Serial.print(":");
  Serial.println(GATEWAY_MQTT_PORT);

  String clientId = String(NODE_ID) + "-" + WiFi.macAddress();

  while (!mqttClient.connected()) {
    if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD)) {
      Serial.println("MQTT connected.");
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
    gmtime_r(&now, &timeinfo);
    char buffer[32];
    strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
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

  bool anomaly = (temperature > 70.0) || (vibration > 1.5) || (current > 10.0);
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
