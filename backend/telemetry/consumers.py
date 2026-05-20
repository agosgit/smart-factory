import json
from channels.generic.websocket import JsonWebsocketConsumer
from asgiref.sync import async_to_sync

class TelemetryConsumer(JsonWebsocketConsumer):
    """
    WebSocket Consumer untuk mengirimkan data telemetri terdistribusi secara real-time
    kepada React Frontend menggunakan Native WebSocket API.
    """
    
    def connect(self):
        self.room_group_name = 'factory_telemetry'

        # Masukkan channel koneksi baru ini ke dalam Group broadcast
        async_to_sync(self.channel_layer.group_add)(
            self.room_group_name,
            self.channel_name
        )
        
        # Terima jabat tangan koneksi WebSocket (connection handshake)
        self.accept()
        
        # Kirim konfirmasi penyambungan awal ke frontend
        self.send_json({
            "event": "connection_status",
            "status": "connected",
            "message": "Koneksi WebSocket real-time terjalin dengan server telemetri."
        })

    def disconnect(self, close_code):
        # Keluarkan channel dari Group broadcast saat klien menutup koneksi
        async_to_sync(self.channel_layer.group_discard)(
            self.room_group_name,
            self.channel_name
        )

    def receive_json(self, content, **kwargs):
        """
        Handler saat menerima data dari klien (frontend).
        Walaupun sistem bertipe one-way stream (ESP32 -> Backend -> Web),
        fitur ini dapat dipakai frontend untuk ping-pong test atau kontrol node di masa depan.
        """
        action = content.get('action')
        if action == 'ping':
            self.send_json({
                "event": "pong",
                "message": "Server responsif."
            })

    def send_telemetry_update(self, event):
        """
        Handler kustom untuk event 'send_telemetry_update'.
        Dipanggil otomatis oleh Channels Layer saat script background MQTT background listener 
        memancarkan event pembaruan data telemetri ke Group 'factory_telemetry'.
        """
        # Ambil muatan pesan dari event layer
        payload = event['data']
        
        # Kirimkan pesan JSON real-time langsung ke browser client
        self.send_json({
            "event": "telemetry_update",
            "data": payload
        })
