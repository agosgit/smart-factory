# Firmware Architecture for MQTT Node->Gateway->Server

## Overview
This firmware implements the corrected architecture:
- Node 1 and Node 2 publish telemetry to the gateway using MQTT.
- The gateway subscribes to local node topics and forwards the payload to the backend server broker.
- Backend listens on `factory/node1/telemetry` and `factory/node2/telemetry`.
- Gateway also publishes its own status to `factory/gateway/status`.
- **All devices (nodes and gateway) connect to the same MQTT broker** (default: 127.0.0.1:1883)

## Node firmware
### `node1-machine-monitoring/Node1MachineMonitoring.ino`
- Publishes to `gateway/node1/telemetry`
- MQTT broker: 127.0.0.1:1883 (same as backend)
- Sends JSON with:
  - `node_id`
  - `timestamp` (ISO format if NTP synced, else millis)
  - `timestamp_ms`
  - `status`
  - `sensor` values

### `node2-environment-monitoring/Node2EnvironmentMonitoring.ino`
- Publishes to `gateway/node2/telemetry`
- MQTT broker: 127.0.0.1:1883 (same as backend)
- Sends JSON with similar fields for environment sensors.

## Gateway firmware
### `gateway/GatewayControlCenter.ino`
- Maintains 2 internal MQTT connections (both to same broker for resilience)
- Subscribes to `gateway/+/telemetry` on local connection
- Republishes to backend topics on remote connection:
  - `factory/node1/telemetry`
  - `factory/node2/telemetry`
- Sends gateway heartbeat/status to `factory/gateway/status`
- Buffers outgoing messages in SPIFFS if connection drops

## Configuration
Update these values before flashing:
- `WIFI_SSID` (in all firmware)
- `WIFI_PASSWORD` (in all firmware)
- `MQTT_HOST` defaults to **127.0.0.1** (same as backend; change only if needed)
- `MQTT_PORT`: 1883
- `MQTT_USER` / `MQTT_PASSWORD`: admin / admin (same as backend)

## Backend integration
Backend MQTT configuration (from `backend/smart_factory/settings.py`):
```
MQTT_HOST = 127.0.0.1
MQTT_PORT = 1883
MQTT_USER = admin
MQTT_PASSWORD = admin
```

Backend subscribes to:
- `factory/node1/telemetry`
- `factory/node2/telemetry`
- `factory/gateway/status`

## Notes
- Do not use ESP-NOW for node to gateway communication in this architecture.
- All devices use WiFi + MQTT for communication.
- The gateway bridge logic allows graceful handling of broker disconnections via SPIFFS buffering.
