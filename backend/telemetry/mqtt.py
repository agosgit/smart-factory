import os
import json
import time
import threading
from datetime import datetime
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.conf import settings
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import paho.mqtt.client as mqtt

from telemetry.models import TelemetryData, AnomalyLog

def start_mqtt_listener():
    # Jalankan loop MQTT dalam thread daemon terpisah agar tidak memblokir port utama Django
    thread = threading.Thread(target=_mqtt_loop, daemon=True)
    thread.start()
    print("[OK] MQTT background listener thread spawned successfully!")

def _mqtt_loop():
    channel_layer = get_channel_layer()
    client_id = f"{settings.MQTT_CLIENT_ID}_thread"
    client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)
    
    client.username_pw_set(
        username=settings.MQTT_USER,
        password=settings.MQTT_PASSWORD
    )
    
    def on_connect(client, userdata, flags, rc):
        if rc == 0:
            print("[OK] MQTT Thread successfully connected to Mosquitto Broker!")
            client.subscribe("factory/+/telemetry", qos=1)
            client.subscribe("factory/gateway/status", qos=1)
        else:
            print(f"[ERROR] MQTT Thread connection failed with code: {rc}")
            
    def on_message(client, userdata, msg):
        topic = msg.topic
        payload_str = msg.payload.decode('utf-8')
        try:
            payload = json.loads(payload_str)
            if "status" in topic:
                process_gateway_status(payload, channel_layer)
            else:
                process_telemetry_data(payload, channel_layer)
        except Exception as e:
            print(f"[ERROR] MQTT Thread failed to process incoming message: {e}")
            
    client.on_connect = on_connect
    client.on_message = on_message
    
    broker_host = settings.MQTT_HOST
    broker_port = settings.MQTT_PORT
    
    connected = False
    while not connected:
        try:
            client.connect(broker_host, broker_port, keepalive=60)
            connected = True
        except Exception as e:
            print(f"MQTT Thread reconnecting to broker in 5s... ({e})")
            time.sleep(5)
            
    client.loop_forever()

def process_telemetry_data(payload, channel_layer):
    node_id = payload.get("node_id")
    timestamp_str = payload.get("timestamp")
    sensor_data = payload.get("sensor", {})
    
    if not node_id:
        return

    if timestamp_str:
        timestamp = parse_datetime(timestamp_str)
        if not timestamp:
            timestamp = timezone.now()
    else:
        timestamp = timezone.now()

    temperature = sensor_data.get("temperature")
    vibration = sensor_data.get("vibration")
    current = sensor_data.get("current")
    voltage = sensor_data.get("voltage")
    humidity = sensor_data.get("humidity")
    gas_level = sensor_data.get("gas_level")

    anomalies_detected = []

    # Ambil ambang batas dari database secara dinamis dengan fallback aman ke settings / default
    try:
        from telemetry.models import SensorThreshold
        # Pisah threshold suhu: temp_machine (Node 1) vs temp_room (Node 2)
        if node_id == 'node_1':
            temp_obj = SensorThreshold.objects.filter(metric="temp_machine").first()
            temp_max = temp_obj.value if temp_obj else float(getattr(settings, 'THRESHOLD_TEMP_MAX', 70.0))
        else:
            temp_obj = SensorThreshold.objects.filter(metric="temp_room").first()
            temp_max = temp_obj.value if temp_obj else float(getattr(settings, 'THRESHOLD_TEMP_ROOM_MAX', 35.0))
    except Exception:
        temp_max = 70.0 if node_id == 'node_1' else 35.0

    try:
        from telemetry.models import SensorThreshold
        vib_obj = SensorThreshold.objects.filter(metric="vibration").first()
        vib_max = vib_obj.value if vib_obj else float(getattr(settings, 'THRESHOLD_VIB_MAX', 1.5))
    except Exception:
        vib_max = 1.5

    try:
        from telemetry.models import SensorThreshold
        current_obj = SensorThreshold.objects.filter(metric="current").first()
        current_max = current_obj.value if current_obj else float(getattr(settings, 'THRESHOLD_CURRENT_MAX', 10.0))
    except Exception:
        current_max = 10.0

    try:
        from telemetry.models import SensorThreshold
        humidity_obj = SensorThreshold.objects.filter(metric="humidity").first()
        humidity_max = humidity_obj.value if humidity_obj else float(getattr(settings, 'THRESHOLD_HUMIDITY_MAX', 80.0))
    except Exception:
        humidity_max = 80.0

    try:
        from telemetry.models import SensorThreshold
        gas_obj = SensorThreshold.objects.filter(metric="gas_level").first()
        gas_max = gas_obj.value if gas_obj else float(getattr(settings, 'THRESHOLD_GAS_MAX', 300.0))
    except Exception:
        gas_max = 300.0


    if temperature is not None and temperature > temp_max:
        metric_name = "temp_machine" if node_id == "node_1" else "temp_room"
        label = "Suhu Mesin" if node_id == "node_1" else "Suhu Ruangan"
        anomalies_detected.append({
            "metric": metric_name,
            "value": temperature,
            "threshold": temp_max,
            "message": f"{label} tinggi terdeteksi! Nilai: {temperature}°C melebihi batas aman {temp_max}°C."
        })

    if vibration is not None and vibration > vib_max:
        anomalies_detected.append({
            "metric": "vibration",
            "value": vibration,
            "threshold": vib_max,
            "message": f"Getaran tidak wajar terdeteksi pada mesin! Getaran: {vibration}g melebihi ambang batas {vib_max}g."
        })

    if current is not None and current > current_max:
        anomalies_detected.append({
            "metric": "current",
            "value": current,
            "threshold": current_max,
            "message": f"Arus listrik berlebih terdeteksi! Arus: {current}A melebihi batas aman {current_max}A."
        })

    if humidity is not None and humidity > humidity_max:
        anomalies_detected.append({
            "metric": "humidity",
            "value": humidity,
            "threshold": humidity_max,
            "message": f"Kelembaban ruangan berlebih! Nilai: {humidity}% melebihi batas aman {humidity_max}%."
        })

    if gas_level is not None and gas_level > gas_max:
        anomalies_detected.append({
            "metric": "gas_level",
            "value": gas_level,
            "threshold": gas_max,
            "message": f"Konsentrasi gas berbahaya tinggi! Terbaca: {gas_level} ppm melebihi batas normal {gas_max} ppm."
        })

    anomaly_payloads = []
    for anomaly in anomalies_detected:
        anomaly_obj = AnomalyLog.objects.create(
            node_id=node_id,
            timestamp=timestamp,
            metric=anomaly["metric"],
            value=anomaly["value"],
            threshold=anomaly["threshold"],
            message=anomaly["message"]
        )
        anomaly_payloads.append({
            "id": anomaly_obj.id,
            "metric": anomaly["metric"],
            "value": anomaly["value"],
            "threshold": anomaly["threshold"],
            "message": anomaly["message"],
            "created_at": anomaly_obj.created_at.isoformat()
        })

    telemetry_record = TelemetryData.objects.create(
        node_id=node_id,
        timestamp=timestamp,
        temperature=temperature,
        vibration=vibration,
        current=current,
        voltage=voltage,
        humidity=humidity,
        gas_level=gas_level,
        raw_payload=payload
    )

    websocket_payload = {
        "telemetry_id": telemetry_record.id,
        "node_id": node_id,
        "timestamp": timestamp.isoformat() if hasattr(timestamp, 'isoformat') else str(timestamp),
        "sensor": {
            "temperature": temperature,
            "vibration": vibration,
            "current": current,
            "voltage": voltage,
            "humidity": humidity,
            "gas_level": gas_level
        },
        "anomalies": anomaly_payloads
    }

    if channel_layer:
        async_to_sync(channel_layer.group_send)(
            'factory_telemetry',
            {
                'type': 'send_telemetry_update',
                'data': websocket_payload
            }
        )

def process_gateway_status(payload, channel_layer):
    node_id = payload.get("node_id", "gateway")
    status = payload.get("status", "unknown")
    uptime = payload.get("uptime", 0)
    timestamp = timezone.now()

    if channel_layer:
        async_to_sync(channel_layer.group_send)(
            'factory_telemetry',
            {
                'type': 'send_telemetry_update',
                'data': {
                    "event": "gateway_status",
                    "node_id": node_id,
                    "status": status,
                    "uptime": uptime,
                    "timestamp": timestamp.isoformat()
                }
            }
        )
