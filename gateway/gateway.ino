#include <WiFi.h>
#include <WiFiClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <SPIFFS.h>

const char* WIFI_SSID = "XinnThink";
const char* WIFI_PASSWORD = "23456789";

const char* LOCAL_MQTT_HOST = "172.29.242.150";
const uint16_t LOCAL_MQTT_PORT = 1883;
const char* REMOTE_MQTT_HOST = "172.29.242.150";
const uint16_t REMOTE_MQTT_PORT = 1883;
const char* MQTT_USER = "admin";
const char* MQTT_PASSWORD = "admin";

const char* LOCAL_TOPIC_FILTER = "gateway/+/telemetry";
const char* REMOTE_STATUS_TOPIC = "factory/gateway/status";
const char* OFFLINE_FILE = "/offline_buffer.txt";

WiFiClient localWifiClient;
WiFiClient remoteWifiClient;
PubSubClient localMqtt(localWifiClient);
PubSubClient remoteMqtt(remoteWifiClient);
unsigned long lastStatusSend = 0;
const uint32_t STATUS_INTERVAL_MS = 15000;
const int LED_PIN = 2;
const int ALARM_PIN = 5;

void blinkLED() {
  digitalWrite(LED_PIN, HIGH);
  delay(100);
  digitalWrite(LED_PIN, LOW);
  delay(100);
}

String serializeBufferedEntry(const String &topic, const String &payload) {
  StaticJsonDocument<512> doc;
  doc["topic"] = topic;
  doc["payload"] = payload;

  String line;
  serializeJson(doc, line);
  return line;
}

void saveOfflineMessage(const String &topic, const String &payload) {
  File file = SPIFFS.open(OFFLINE_FILE, FILE_APPEND);
  if (!file) {
    Serial.println("Failed to open offline buffer file.");
    return;
  }

  file.println(serializeBufferedEntry(topic, payload));
  file.close();
  Serial.println("Buffered message locally.");
}

void flushOfflineBuffer() {
  if (!SPIFFS.exists(OFFLINE_FILE)) return;

  File file = SPIFFS.open(OFFLINE_FILE, FILE_READ);
  if (!file) {
    Serial.println("Unable to read offline buffer.");
    return;
  }

  Serial.println("Flushing offline messages...");
  while (file.available()) {
    String line = file.readStringUntil('\n');
    if (line.length() == 0) continue;

    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, line);
    if (error) {
      Serial.println("Skipping malformed buffered entry.");
      continue;
    }

    const char* topic = doc["topic"];
    const char* payload = doc["payload"];
    if (!remoteMqtt.publish(topic, payload)) {
      Serial.println("Re-publish failed, keep remaining buffer.");
      file.close();
      return;
    }
    delay(50);
  }
  file.close();
  SPIFFS.remove(OFFLINE_FILE);
  Serial.println("Offline buffer cleared.");
}

void sendToRemoteBroker(const String &topic, const String &message) {
  if (!remoteMqtt.connected()) {
    saveOfflineMessage(topic, message);
    return;
  }

  if (!remoteMqtt.publish(topic.c_str(), message.c_str())) {
    Serial.printf("Publish failed for topic %s\n", topic.c_str());
    saveOfflineMessage(topic, message);
  } else {
    Serial.printf("Published to remote topic %s\n", topic.c_str());
  }
}

void publishGatewayStatus() {
  StaticJsonDocument<256> doc;
  doc["node_id"] = "gateway";
  doc["status"] = "online";
  doc["uptime_seconds"] = millis() / 1000;
  doc["free_heap"] = ESP.getFreeHeap();

  String payload;
  serializeJson(doc, payload);
  sendToRemoteBroker(REMOTE_STATUS_TOPIC, payload);
}

String getRemoteTopicForNode(const char *nodeId) {
  if (strcmp(nodeId, "node_1") == 0) {
    return String("factory/node1/telemetry");
  }
  if (strcmp(nodeId, "node_2") == 0) {
    return String("factory/node2/telemetry");
  }
  return String();
}

void onLocalMessage(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("Local MQTT received [");
  Serial.print(topic);
  Serial.print("] -> ");
  Serial.println(message);
  blinkLED();

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (error) {
    Serial.print("Invalid JSON from local node: ");
    Serial.println(error.c_str());
    return;
  }

  const char* nodeId = doc["node_id"];
  if (!nodeId) {
    Serial.println("Missing node_id in payload.");
    return;
  }

  String remoteTopic = getRemoteTopicForNode(nodeId);
  if (remoteTopic.length() == 0) {
    Serial.print("Unknown node_id received: ");
    Serial.println(nodeId);
    return;
  }

  bool anomaly = false;
  const char* status = doc["status"];
  if (status && strcmp(status, "ANOMALY") == 0) {
    anomaly = true;
  }

  if (anomaly) {
    digitalWrite(ALARM_PIN, HIGH);
    delay(150);
    digitalWrite(ALARM_PIN, LOW);
  }

  sendToRemoteBroker(remoteTopic, message);

  if (remoteMqtt.connected()) {
    flushOfflineBuffer();
  }
}

void connectWiFi() {
  Serial.printf("Connecting to WiFi %s...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > 20000) {
      Serial.println("WiFi connection failed.");
      return;
    }
    Serial.print('.');
    delay(500);
  }

  Serial.println();
  Serial.print("WiFi connected, IP: ");
  Serial.println(WiFi.localIP());
}

void connectLocalMqtt() {
  if (localMqtt.connected()) {
    return;
  }

  localMqtt.setServer(LOCAL_MQTT_HOST, LOCAL_MQTT_PORT);
  localMqtt.setCallback(onLocalMessage);

  Serial.print("Connecting to local MQTT broker at ");
  Serial.print(LOCAL_MQTT_HOST);
  Serial.print(":");
  Serial.println(LOCAL_MQTT_PORT);

  String clientId = String("gateway-local-") + WiFi.macAddress();
  while (!localMqtt.connected()) {
    if (localMqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD)) {
      Serial.println("Local MQTT connected.");
      if (localMqtt.subscribe(LOCAL_TOPIC_FILTER)) {
        Serial.print("Subscribed to local topic: ");
        Serial.println(LOCAL_TOPIC_FILTER);
      } else {
        Serial.println("Failed to subscribe to local topic.");
      }
      break;
    }
    Serial.print('.');
    delay(2000);
  }
}

void connectRemoteMqtt() {
  if (remoteMqtt.connected()) {
    return;
  }

  remoteMqtt.setServer(REMOTE_MQTT_HOST, REMOTE_MQTT_PORT);

  Serial.print("Connecting to remote MQTT broker at ");
  Serial.print(REMOTE_MQTT_HOST);
  Serial.print(":");
  Serial.println(REMOTE_MQTT_PORT);

  String clientId = String("gateway-remote-") + WiFi.macAddress();
  while (!remoteMqtt.connected()) {
    if (remoteMqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD)) {
      Serial.println("Remote MQTT connected.");
      break;
    }
    Serial.print('.');
    delay(2000);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  if (!SPIFFS.begin(true)) {
    Serial.println("SPIFFS mount failed.");
  }

  connectWiFi();
  connectLocalMqtt();
  connectRemoteMqtt();

  Serial.println("Gateway started.");
  Serial.print("Gateway MAC: ");
  Serial.println(WiFi.macAddress());

  publishGatewayStatus();
  flushOfflineBuffer();
  lastStatusSend = millis();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!localMqtt.connected()) {
    connectLocalMqtt();
  }

  if (!remoteMqtt.connected()) {
    connectRemoteMqtt();
  }

  localMqtt.loop();
  remoteMqtt.loop();

  if (millis() - lastStatusSend >= STATUS_INTERVAL_MS) {
    lastStatusSend = millis();
    publishGatewayStatus();
  }
}
