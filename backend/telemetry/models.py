from django.db import models

class TelemetryData(models.Model):
    """
    Model untuk menyimpan data telemetri yang dipublish oleh Node 1, Node 2, maupun Gateway.
    Seluruh kolom metrik bersifat nullable karena payload masing-masing node berbeda.
    """
    node_id = models.CharField(max_length=50, db_index=True, help_text="ID unik node pengirim (contoh: node_1, node_2)")
    timestamp = models.DateTimeField(db_index=True, help_text="Waktu pembacaan sensor dari node")
    
    # Metrik Sensor Node 1 (Machine Monitoring)
    temperature = models.FloatField(null=True, blank=True, help_text="Suhu Mesin / Suhu Lingkungan (°C)")
    vibration = models.FloatField(null=True, blank=True, help_text="Nilai getaran dari MPU6050 (g / m/s²)")
    current = models.FloatField(null=True, blank=True, help_text="Konsumsi arus listrik dari PZEM004T (Ampere)")
    voltage = models.FloatField(null=True, blank=True, help_text="Tegangan listrik dari PZEM004T (Volt)")
    
    # Metrik Sensor Node 2 (Environment Monitoring)
    humidity = models.FloatField(null=True, blank=True, help_text="Kelembaban udara dari DHT22 (%)")
    gas_level = models.FloatField(null=True, blank=True, help_text="Kadar gas/asap dari MQ-2 (ppm)")
    
    # Backup JSON Payload mentah untuk tujuan audit/debugging
    raw_payload = models.JSONField(null=True, blank=True, help_text="Payload JSON asli dari MQTT")
    
    created_at = models.DateTimeField(auto_now_add=True, help_text="Waktu data disimpan ke database backend")

    class Meta:
        ordering = ['-timestamp']
        verbose_name = "Telemetry Data"
        verbose_name_plural = "Telemetry Data Logs"

    def __str__(self):
        return f"{self.node_id} @ {self.timestamp.strftime('%Y-%m-%d %H:%M:%S')} (Temp: {self.temperature})"


class AnomalyLog(models.Model):
    """
    Model untuk mencatat deteksi anomali/kejadian di luar batas normal secara real-time.
    Berguna sebagai dasar pembuatan alerts di dashboard frontend.
    """
    node_id = models.CharField(max_length=50, db_index=True, help_text="Node asal terjadinya anomali")
    timestamp = models.DateTimeField(help_text="Waktu pembacaan sensor saat terdeteksi anomali")
    metric = models.CharField(max_length=50, help_text="Metrik yang bermasalah (contoh: temperature, vibration, gas_level)")
    value = models.FloatField(help_text="Nilai sensor aktual yang terbaca")
    threshold = models.FloatField(help_text="Nilai batas aman (threshold) yang dilanggar")
    message = models.TextField(help_text="Deskripsi atau pesan peringatan terkait anomali")
    created_at = models.DateTimeField(auto_now_add=True, help_text="Waktu pencatatan log anomali")

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Anomaly Log"
        verbose_name_plural = "Anomaly Logs"

    def __str__(self):
        return f"ANOMALY [{self.node_id}] - {self.metric}: {self.value} > {self.threshold}"


class SensorThreshold(models.Model):
    """
    Model untuk menyimpan batas aman (threshold) sensor secara dinamis di database.
    Memungkinkan operator pabrik mengubah batas aman langsung dari dashboard frontend.
    """
    metric = models.CharField(max_length=50, unique=True, db_index=True, help_text="Nama metrik sensor (contoh: temperature, vibration, gas_level)")
    value = models.FloatField(help_text="Nilai batas aman sensor")
    label = models.CharField(max_length=100, help_text="Label tampilan sensor (contoh: Batas Suhu Maksimum)")
    unit = models.CharField(max_length=20, default="", blank=True, help_text="Satuan sensor (contoh: °C, g, ppm)")
    description = models.TextField(blank=True, null=True, help_text="Deskripsi fungsi batas aman")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Sensor Threshold"
        verbose_name_plural = "Sensor Thresholds"

    def __str__(self):
        return f"{self.label} ({self.metric}): {self.value} {self.unit}"

