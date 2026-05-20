import json
import time
import random
from datetime import datetime, timezone
import paho.mqtt.client as mqtt

# ==============================
# MQTT CONFIG
# ==============================
MQTT_HOST = "127.0.0.1"
MQTT_PORT = 1883
MQTT_USER = "admin"
MQTT_PASSWORD = "admin"

NODE_ID = "node_2"
TOPIC = "factory/node2/telemetry"

print("=== NODE 2 TELEMETRY SIMULATOR ===")

# ==============================
# MQTT CLIENT
# ==============================
client = mqtt.Client(client_id="node_2_simulator")
client.username_pw_set(MQTT_USER, MQTT_PASSWORD)

try:
    client.connect(MQTT_HOST, MQTT_PORT, 60)
    client.loop_start()

    print(f"Connected to MQTT Broker {MQTT_HOST}:{MQTT_PORT}")

except Exception as e:
    print(f"Connection failed: {e}")
    exit()

# ==============================
# GENERATE RANDOM DATA
# ==============================
def generate_data():

    anomaly = random.choice([True, False])

    if anomaly:
        status = "ANOMALY"

        gas_level = round(random.uniform(320, 500), 2)

    else:
        status = "NORMAL"

        gas_level = round(random.uniform(80, 250), 2)

    payload = {
        "node_id": NODE_ID,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sensor": {
            "temperature": round(random.uniform(24, 35), 2),
            "humidity": round(random.uniform(45, 85), 2),
            "gas_level": gas_level
        }
    }

    return payload

# ==============================
# LOOP PUBLISH
# ==============================
try:

    while True:

        payload = generate_data()

        payload_json = json.dumps(payload)

        client.publish(TOPIC, payload_json, qos=1)

        print(f"\n[PUBLISH] {TOPIC}")
        print(payload_json)

        time.sleep(random.uniform(1, 3))

except KeyboardInterrupt:

    print("\nNode 2 stopped.")

finally:

    client.loop_stop()
    client.disconnect()

    print("Disconnected from broker.")