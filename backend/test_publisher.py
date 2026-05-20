import json
import time
import random
from datetime import datetime, timezone
import paho.mqtt.client as mqtt

# ==============================
# Konfigurasi MQTT Broker
# ==============================
MQTT_HOST = "127.0.0.1"
MQTT_PORT = 1883
MQTT_USER = "admin"
MQTT_PASSWORD = "admin"

print("=== Smart Factory Telemetry Simulator (Random Loop) ===")

# ==============================
# MQTT Client
# ==============================
client = mqtt.Client(client_id="smart_factory_mock_hardware")
client.username_pw_set(username=MQTT_USER, password=MQTT_PASSWORD)

try:
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_start()

    print(f"Berhasil terhubung ke Broker MQTT di {MQTT_HOST}:{MQTT_PORT}\n")

except Exception as e:
    print(f"Gagal terhubung ke Broker: {e}")
    exit(1)

# ==============================
# Publish Function
# ==============================
def publish_data(topic, data):
    data["timestamp"] = datetime.now(timezone.utc).isoformat()

    payload_str = json.dumps(data)

    client.publish(topic, payload_str, qos=1)

    print(f"[PUBLISH] [{topic}]")
    print(payload_str)
    print("-" * 60)


# ==============================
# Generate Random Telemetry
# ==============================
def generate_node1_data():
    anomaly = random.choice([True, False])

    if anomaly:
        # Kondisi anomali
        return {
            "node_id": "node_1",
            "status": "ANOMALY",
            "sensor": {
                "temperature": round(random.uniform(75, 90), 2),
                "vibration": round(random.uniform(1.6, 2.5), 2),
                "current": round(random.uniform(3.5, 5.0), 2),
                "voltage": round(random.uniform(210, 220), 2)
            }
        }
    else:
        # Kondisi normal
        return {
            "node_id": "node_1",
            "status": "NORMAL",
            "sensor": {
                "temperature": round(random.uniform(45, 65), 2),
                "vibration": round(random.uniform(0.2, 1.2), 2),
                "current": round(random.uniform(1.0, 2.5), 2),
                "voltage": round(random.uniform(219, 223), 2)
            }
        }


def generate_node2_data():
    anomaly = random.choice([True, False])

    if anomaly:
        # Gas bocor
        return {
            "node_id": "node_2",
            "status": "ANOMALY",
            "sensor": {
                "temperature": round(random.uniform(28, 35), 2),
                "humidity": round(random.uniform(60, 85), 2),
                "gas_level": round(random.uniform(320, 500), 2)
            }
        }
    else:
        # Normal
        return {
            "node_id": "node_2",
            "status": "NORMAL",
            "sensor": {
                "temperature": round(random.uniform(24, 30), 2),
                "humidity": round(random.uniform(45, 65), 2),
                "gas_level": round(random.uniform(80, 250), 2)
            }
        }


# ==============================
# Main Loop
# ==============================
try:
    while True:

        # Node 1
        payload_node1 = generate_node1_data()
        publish_data("factory/node1/telemetry", payload_node1)

        # Delay random
        time.sleep(random.uniform(1, 3))

        # Node 2
        payload_node2 = generate_node2_data()
        publish_data("factory/node2/telemetry", payload_node2)

        # Delay random
        time.sleep(random.uniform(1, 3))

except KeyboardInterrupt:
    print("\nSimulator dihentikan oleh user.")

finally:
    client.loop_stop()
    client.disconnect()

    print("MQTT disconnected.")