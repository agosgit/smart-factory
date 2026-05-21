import json
import time
from datetime import datetime
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.conf import settings
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import paho.mqtt.client as mqtt

from telemetry.models import TelemetryData, AnomalyLog

class Command(BaseCommand):
    help = "Menjalankan background service listener MQTT untuk menerima dan memproses data telemetri"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Memulai background listener MQTT..."))
        
        # 1. Hubungkan ke Channel Layer Django Channels untuk broadcast WebSocket
        self.channel_layer = get_channel_layer()
        
        # 2. Inisialisasi Paho MQTT Client
        # Menggunakan protokol MQTT v3.1.1 untuk kompatibilitas luas dengan ESP32
        client_id = settings.MQTT_CLIENT_ID
        self.client = mqtt.Client(client_id=client_id, protocol=mqtt.MQTTv311)
        
        # Pasang kredensial otentikasi (MQTT User & Pass) yang diminta user (admin / admin)
        self.client.username_pw_set(
            username=settings.MQTT_USER,
            password=settings.MQTT_PASSWORD
        )
        
        # Hubungkan callback event handler
        self.client.on_connect = self.on_connect
        self.client.on_disconnect = self.on_disconnect
        self.client.on_message = self.on_message
        
        # Ambil konfigurasi broker dari settings
        broker_host = settings.MQTT_HOST
        broker_port = settings.MQTT_PORT

        
        # 3. Logika Reconnect / Retry Awal saat Menghubungkan ke Broker
        connected = False
        retry_delay = 5 # detik
        while not connected:
            try:
                self.stdout.write(f"Mencoba menghubungkan ke broker MQTT di {broker_host}:{broker_port}...")
                self.client.connect(broker_host, broker_port, keepalive=60)
                connected = True
            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f"Gagal terhubung ke broker: {e}. Mencoba kembali dalam {retry_delay} detik..."
                ))
                time.sleep(retry_delay)
                
        # 4. Memulai Event Loop Paho MQTT secara blocking (loop_forever)
        # loop_forever() memiliki mekanisme internal reconnect otomatis jika socket terputus
        try:
            self.client.loop_forever()
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Menghentikan listener MQTT secara aman..."))
            self.client.disconnect()

    def on_connect(self, client, userdata, flags, rc):
        """
        Callback saat berhasil terhubung ke Broker MQTT.
        """
        if rc == 0:
            self.stdout.write(self.style.SUCCESS("Berhasil terhubung ke MQTT Broker!"))
            
            # Subscribe ke topic telemetry untuk seluruh node pabrik
            # Menggunakan single-level wildcard '+' untuk fleksibilitas node (node1, node2)
            # QoS 1 dipasang untuk menjamin penerimaan telemetri krusial
            topic = "factory/+/telemetry"
            self.client.subscribe(topic, qos=1)
            self.stdout.write(f"Subscribed ke topik: {topic} (QoS 1)")
            
            # Subscribe ke topik status gateway untuk memonitor heartbeat/online gateway
            status_topic = "factory/gateway/status"
            self.client.subscribe(status_topic, qos=1)
            self.stdout.write(f"Subscribed ke topik: {status_topic} (QoS 1)")
        else:
            self.stdout.write(self.style.ERROR(f"Koneksi gagal dengan return code: {rc}"))

    def on_disconnect(self, client, userdata, rc):
        """
        Callback saat koneksi dengan broker terputus.
        Logika auto-reconnect ditangani oleh loop_forever(), namun callback ini 
        memberikan log peringatan yang komprehensif.
        """
        self.stdout.write(self.style.WARNING(f"Koneksi MQTT terputus dengan return code: {rc}"))
        if rc != 0:
            self.stdout.write(self.style.WARNING("Terputus secara tidak terduga. Paho MQTT sedang mencoba auto-reconnect..."))

    def on_message(self, client, userdata, msg):
        """
        Callback utama ketika menerima pesan (payload JSON) dari topic yang di-subscribe.
        """
        topic = msg.topic
        payload_str = msg.payload.decode('utf-8')
        
        self.stdout.write(f"Menerima pesan dari [{topic}]: {payload_str}")
        
        try:
            # Parse payload ke format JSON Python
            payload = json.loads(payload_str)
            
            # Filter penanganan berdasarkan topik
            if "status" in topic:
                # Menangani update status dari gateway
                self.process_gateway_status(payload)
            else:
                # Menangani telemetri sensor utama
                self.process_telemetry_data(payload)
                
        except json.JSONDecodeError:
            self.stdout.write(self.style.ERROR(f"Format payload tidak valid (Bukan JSON): {payload_str}"))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Gagal memproses pesan: {str(e)}"))

    def process_telemetry_data(self, payload):
        """
        Parsing payload telemetri, deteksi anomali, simpan ke MySQL database, 
        dan broadcast ke WebSocket client.
        """
        node_id = payload.get("node_id")
        timestamp_str = payload.get("timestamp")
        sensor_data = payload.get("sensor", {})
        
        if not node_id:
            self.stdout.write(self.style.WARNING("Payload diabaikan: 'node_id' kosong."))
            return

        # LOGIKA OFFLINE BUFFERING COMPATIBILITY:
        # Jika Gateway mengirimkan data buffering offline (terlambat dikirim karena koneksi putus),
        # data tersebut dikirim dengan timestamp asli pembacaan sensor pada ESP32.
        # Dengan mem-parsing dan menyimpan timestamp asli ini (bukannya datetime.now() backend),
        # visualisasi grafik frontend akan tetap sinkron & runtut sesuai waktu aktual pembacaan di lapangan.
        if timestamp_str:
            timestamp = parse_datetime(timestamp_str)
            if not timestamp and isinstance(timestamp_str, str) and timestamp_str.isdigit():
                ts_int = int(timestamp_str)
                if ts_int > 1000000000000:
                    timestamp = datetime.fromtimestamp(ts_int / 1000.0, tz=timezone.utc)
                elif ts_int > 1000000000:
                    timestamp = datetime.fromtimestamp(ts_int, tz=timezone.utc)
                if timestamp:
                    timestamp = timezone.localtime(timestamp)
            if not timestamp:
                timestamp = timezone.now()
        else:
            timestamp_ms = payload.get("timestamp_ms")
            if isinstance(timestamp_ms, (int, float)) and timestamp_ms > 1000000000000:
                timestamp = datetime.fromtimestamp(timestamp_ms / 1000.0, tz=timezone.utc)
                timestamp = timezone.localtime(timestamp)
            elif isinstance(timestamp_ms, (int, float)) and timestamp_ms > 1000000000:
                timestamp = datetime.fromtimestamp(timestamp_ms, tz=timezone.utc)
                timestamp = timezone.localtime(timestamp)
            else:
                timestamp = timezone.now()

        # Ekstraksi metrik sensor individual (nullable jika sensor tidak ada di node pengirim)
        temperature = sensor_data.get("temperature")
        vibration = sensor_data.get("vibration")
        current = sensor_data.get("current")
        voltage = sensor_data.get("voltage")
        humidity = sensor_data.get("humidity")
        gas_level = sensor_data.get("gas_level")

        # 5. LOGIKA DETEKSI ANOMALI SENSOR
        # Membandingkan pembacaan aktual sensor dengan ambang batas (threshold) dari settings
        anomalies_detected = []

        if temperature is not None and temperature > settings.THRESHOLD_TEMP_MAX:
            anomalies_detected.append({
                "metric": "temperature",
                "value": temperature,
                "threshold": settings.THRESHOLD_TEMP_MAX,
                "message": f"Suhu tinggi terdeteksi! Nilai: {temperature}°C melebihi batas aman {settings.THRESHOLD_TEMP_MAX}°C."
            })

        if vibration is not None and vibration > settings.THRESHOLD_VIB_MAX:
            anomalies_detected.append({
                "metric": "vibration",
                "value": vibration,
                "threshold": settings.THRESHOLD_VIB_MAX,
                "message": f"Getaran tidak wajar terdeteksi pada mesin! Getaran: {vibration}g melebihi ambang batas {settings.THRESHOLD_VIB_MAX}g."
            })

        if gas_level is not None and gas_level > settings.THRESHOLD_GAS_MAX:
            anomalies_detected.append({
                "metric": "gas_level",
                "value": gas_level,
                "threshold": settings.THRESHOLD_GAS_MAX,
                "message": f"Konsentrasi gas berbahaya tinggi! Terbaca: {gas_level} ppm melebihi batas normal {settings.THRESHOLD_GAS_MAX} ppm."
            })

        # Simpan anomali ke MySQL database secara batch dan siapkan metadata untuk WebSocket
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
            self.stdout.write(self.style.WARNING(f"ALERT ANOMALI: {anomaly['message']}"))

        # Hindari duplikat ketika payload yang sama diproses lebih dari sekali
        if TelemetryData.objects.filter(node_id=node_id, raw_payload=payload).exists():
            self.stdout.write(self.style.WARNING(f"Duplicate telemetry ignored for {node_id} @ {timestamp}"))
            return

        # Simpan rekaman telemetri utama ke MySQL database
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

        # 6. LOGIKA ALUR WEBSOCKET REALTIME (PUSH BROADCAST)
        # Siapkan payload gabungan untuk dipush instan ke seluruh browser client React
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

        # Broadcast payload melalui Django Channel Layer Group 'factory_telemetry'
        # Event type 'send_telemetry_update' akan memicu pemanggilan fungsi dengan nama yang sama di consumers.py
        if self.channel_layer:
            async_to_sync(self.channel_layer.group_send)(
                'factory_telemetry',
                {
                    'type': 'send_telemetry_update',
                    'data': websocket_payload
                }
            )
            self.stdout.write(f"Berhasil mem-broadcast data telemetri {node_id} secara real-time.")

    def process_gateway_status(self, payload):
        """
        Memproses data pembaruan status / heartbeat gateway.
        """
        node_id = payload.get("node_id", "gateway")
        status = payload.get("status", "unknown")
        uptime = payload.get("uptime", 0)
        timestamp = timezone.now()

        self.stdout.write(self.style.NOTICE(f"Gateway Heartbeat: Status={status}, Uptime={uptime}s"))

        # Broadcast status Gateway secara real-time via WebSocket
        if self.channel_layer:
            async_to_sync(self.channel_layer.group_send)(
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
