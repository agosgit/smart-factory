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

NODE_ID = "node_1"
TOPIC = "factory/node1/telemetry"

print("=== NODE 1 TELEMETRY SIMULATOR ===")

# ==============================
# MQTT CLIENT
# ==============================
client = mqtt.Client(client_id="node_1_simulator")
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

        temperature = round(random.uniform(75, 90), 2)
        vibration = round(random.uniform(1.6, 2.5), 2)
        current = round(random.uniform(3.5, 5.0), 2)

    else:
        status = "NORMAL"

        temperature = round(random.uniform(45, 65), 2)
        vibration = round(random.uniform(0.2, 1.2), 2)
        current = round(random.uniform(1.0, 2.5), 2)

    payload = {
        "node_id": NODE_ID,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "sensor": {
            "temperature": temperature,
            "vibration": vibration,
            "current": current,
            "voltage": round(random.uniform(219, 223), 2)
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

        time.sleep(random.uniform(4, 5))

except KeyboardInterrupt:

    print("\nNode 1 stopped.")

finally:

    client.loop_stop()
    client.disconnect()

    print("Disconnected from broker.")