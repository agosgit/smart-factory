from django.apps import AppConfig
import os

class TelemetryConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'telemetry'

    def ready(self):
        # Mencegah duplikasi thread saat Django melakukan auto-reload di mode development
        # RUN_MAIN didefinisikan oleh Django hanya pada proses anak aktif pengelola request
        if os.environ.get('RUN_MAIN') == 'true' or not os.environ.get('RUN_MAIN'):
            # Jika dijalankan via command python manage.py runserver, RUN_MAIN harus bernilai 'true'
            # Ini mencegah thread berjalan ganda pada parent process Django
            import sys
            is_runserver = 'runserver' in sys.argv
            if is_runserver and os.environ.get('RUN_MAIN') != 'true':
                return
                
            from .mqtt import start_mqtt_listener
            start_mqtt_listener()
