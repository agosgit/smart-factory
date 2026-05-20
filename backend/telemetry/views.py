from rest_framework import generics
from rest_framework.response import Response
from rest_framework.decorators import api_view
from .models import TelemetryData, AnomalyLog
from .serializers import TelemetryDataSerializer, AnomalyLogSerializer

class TelemetryDataListView(generics.ListAPIView):
    """
    API View untuk mendapatkan riwayat data telemetri.
    Mendukung filter query parameter 'node_id' dan batas jumlah data 'limit' (default 100).
    """
    serializer_class = TelemetryDataSerializer

    def get_queryset(self):
        queryset = TelemetryData.objects.all()
        node_id = self.request.query_params.get('node_id')
        if node_id is not None:
            queryset = queryset.filter(node_id=node_id)
            
        limit = self.request.query_params.get('limit', 100)
        try:
            limit = int(limit)
        except ValueError:
            limit = 100
        return queryset[:limit]


class AnomalyLogListView(generics.ListAPIView):
    """
    API View untuk mendapatkan riwayat log anomali sensor.
    Mendukung filter query parameter 'node_id' dan batas jumlah log 'limit' (default 50).
    """
    serializer_class = AnomalyLogSerializer

    def get_queryset(self):
        queryset = AnomalyLog.objects.all()
        node_id = self.request.query_params.get('node_id')
        if node_id is not None:
            queryset = queryset.filter(node_id=node_id)
            
        limit = self.request.query_params.get('limit', 50)
        try:
            limit = int(limit)
        except ValueError:
            limit = 50
        return queryset[:limit]


@api_view(['GET'])
def system_status(request):
    """
    Endpoint utilitas (Health Check) untuk memantau status server, 
    menampilkan statistik akumulasi data, dan timestamp entri terakhir.
    """
    total_logs = TelemetryData.objects.count()
    total_anomalies = AnomalyLog.objects.count()
    latest_log = TelemetryData.objects.first()
    
    return Response({
        "status": "healthy",
        "total_telemetry_records": total_logs,
        "total_anomaly_records": total_anomalies,
        "latest_telemetry_timestamp": latest_log.timestamp if latest_log else None
    })

from django.contrib.auth import authenticate

@api_view(['POST'])
def login_api(request):
    """
    API View untuk memverifikasi kredensial login (username & password).
    Menerima JSON: {"username": "...", "password": "..."}
    """
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return Response({"success": False, "message": "Username dan password diperlukan"}, status=400)
        
    user = authenticate(username=username, password=password)
    
    if user is not None:
        # Dummy token / success indicator untuk dashboard front-end
        return Response({
            "success": True, 
            "message": "Login berhasil",
            "token": "admin-session-token-xyz123",
            "user": {"username": user.username, "is_superuser": user.is_superuser}
        })
    else:
        return Response({"success": False, "message": "Kredensial tidak valid"}, status=401)


@api_view(['GET', 'POST'])
def sensor_thresholds_api(request):
    """
    API View untuk mengelola ambang batas sensor secara dinamis.
    GET: Mengambil daftar semua ambang batas sensor, menginisialisasi dengan nilai default jika kosong.
    POST: Memperbarui ambang batas (mendukung objek tunggal atau array untuk bulk update).
    """
    from django.conf import settings
    from .models import SensorThreshold
    from .serializers import SensorThresholdSerializer

    # Inisialisasi awal jika database kosong demi kemudahan deploy
    # 6 metric sesuai arsitektur TA:
    # Node 1 (Machine): temp_machine, vibration, current
    # Node 2 (Environment): temp_room, humidity, gas_level
    metrics_defaults = [
        {
            "metric": "temp_machine",
            "value": float(getattr(settings, 'THRESHOLD_TEMP_MAX', 70.0)),
            "label": "Suhu Mesin Maksimum (Node 1)",
            "unit": "°C",
            "description": "Batas aman suhu operasional mesin dari sensor DHT22/DS18B20 di Node 1. Melebihi batas ini mengindikasikan overheat pada motor/mesin."
        },
        {
            "metric": "vibration",
            "value": float(getattr(settings, 'THRESHOLD_VIB_MAX', 1.5)),
            "label": "Getaran Mesin Maksimum (Node 1)",
            "unit": "g",
            "description": "Batas aman getaran mesin dari sensor MPU6050 di Node 1. Getaran tinggi menunjukkan potensi malfungsi atau ketidakseimbangan fisik."
        },
        {
            "metric": "current",
            "value": float(getattr(settings, 'THRESHOLD_CURRENT_MAX', 10.0)),
            "label": "Arus Listrik Maksimum (Node 1)",
            "unit": "A",
            "description": "Batas aman konsumsi arus listrik mesin dari sensor ACS712 di Node 1. Arus berlebih dapat mengindikasikan beban mesin overload atau korsleting."
        },
        {
            "metric": "temp_room",
            "value": float(getattr(settings, 'THRESHOLD_TEMP_ROOM_MAX', 35.0)),
            "label": "Suhu Ruangan Maksimum (Node 2)",
            "unit": "°C",
            "description": "Batas aman suhu ruangan pabrik dari sensor DHT22 di Node 2. Suhu ruangan yang terlalu tinggi dapat membahayakan pekerja dan perangkat elektronik."
        },
        {
            "metric": "humidity",
            "value": float(getattr(settings, 'THRESHOLD_HUMIDITY_MAX', 80.0)),
            "label": "Kelembaban Ruangan Maksimum (Node 2)",
            "unit": "%",
            "description": "Batas aman kelembaban udara ruangan dari sensor DHT22 di Node 2. Kelembaban berlebih dapat menyebabkan korosi dan kerusakan komponen elektronik."
        },
        {
            "metric": "gas_level",
            "value": float(getattr(settings, 'THRESHOLD_GAS_MAX', 300.0)),
            "label": "Kadar Gas/Asap Maksimum (Node 2)",
            "unit": "ppm",
            "description": "Batas aman konsentrasi gas/asap di ruangan dari sensor MQ-2 di Node 2. Nilai di atas batas mengindikasikan kebocoran gas berbahaya atau kebakaran."
        }
    ]

    # Pastikan database terisi dengan default jika belum ada
    for default in metrics_defaults:
        SensorThreshold.objects.get_or_create(
            metric=default["metric"],
            defaults={
                "value": default["value"],
                "label": default["label"],
                "unit": default["unit"],
                "description": default["description"]
            }
        )

    if request.method == 'GET':
        thresholds = SensorThreshold.objects.all()
        serializer = SensorThresholdSerializer(thresholds, many=True)
        return Response(serializer.data)

    elif request.method == 'POST':
        data = request.data
        if isinstance(data, list):
            updated_items = []
            for item in data:
                metric = item.get('metric')
                value = item.get('value')
                if metric is not None and value is not None:
                    try:
                        threshold = SensorThreshold.objects.get(metric=metric)
                        threshold.value = float(value)
                        threshold.save()
                        updated_items.append(threshold)
                    except SensorThreshold.DoesNotExist:
                        pass
            serializer = SensorThresholdSerializer(updated_items, many=True)
            return Response({
                "success": True, 
                "data": serializer.data, 
                "message": "Ambang batas berhasil diperbarui secara massal"
            })
        else:
            metric = data.get('metric')
            value = data.get('value')
            if not metric or value is None:
                return Response({"success": False, "message": "Data tidak lengkap"}, status=400)
            try:
                threshold = SensorThreshold.objects.get(metric=metric)
                threshold.value = float(value)
                threshold.save()
                serializer = SensorThresholdSerializer(threshold)
                return Response({
                    "success": True, 
                    "data": serializer.data, 
                    "message": "Ambang batas berhasil diperbarui"
                })
            except SensorThreshold.DoesNotExist:
                return Response({"success": False, "message": "Metrik tidak ditemukan"}, status=404)

