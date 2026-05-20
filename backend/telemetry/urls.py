from django.urls import path
from .views import TelemetryDataListView, AnomalyLogListView, system_status, login_api, sensor_thresholds_api

urlpatterns = [
    # Rute autentikasi frontend
    path('login/', login_api, name='api-login'),

    # Rute untuk mengambil riwayat telemetri (GET /api/telemetry/?node_id=node_1&limit=50)
    path('telemetry/', TelemetryDataListView.as_view(), name='telemetry-list'),
    
    # Rute untuk mengambil log anomali sensor (GET /api/anomalies/?node_id=node1)
    path('anomalies/', AnomalyLogListView.as_view(), name='anomaly-list'),
    
    # Rute utilitas untuk mengecek kesehatan backend (GET /api/status/)
    path('status/', system_status, name='system-status'),

    # Rute untuk mengelola ambang batas dinamis sensor (GET / POST)
    path('thresholds/', sensor_thresholds_api, name='threshold-api'),
]

