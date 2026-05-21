import os
import sys
from django.apps import AppConfig

class TelemetryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'telemetry'

    def ready(self):
        from .mqtt import start_mqtt_listener

        # Jalankan MQTT listener otomatis hanya saat server ASGI dijalankan,
        # bukan saat menjalankan migrasi, shell, atau perintah manajemen lain.
        # Di mode DEBUG dengan autoreload, pastikan hanya proses utama yang memulai listener.
        server_commands = {'runserver', 'daphne', 'uvicorn', 'gunicorn'}
        if os.environ.get('RUN_MAIN') == 'true' and any(command in sys.argv for command in server_commands):
            print(f"[DEBUG] TelemetryConfig.ready(): RUN_MAIN={os.environ.get('RUN_MAIN')} sys.argv={sys.argv}")
            start_mqtt_listener()
        else:
            print(f"[DEBUG] TelemetryConfig.ready(): listener not started. RUN_MAIN={os.environ.get('RUN_MAIN')} sys.argv={sys.argv}")
