from django.urls import re_path
from . import consumers

# Pola URL untuk menangani koneksi WebSocket pada backend Django Channels
websocket_urlpatterns = [
    # Router mencocokkan koneksi dengan path ws://<server_address>/ws/telemetry/
    re_path(r'ws/telemetry/$', consumers.TelemetryConsumer.as_asgi()),
]
