from rest_framework import serializers
from .models import TelemetryData, AnomalyLog, SensorThreshold

class TelemetryDataSerializer(serializers.ModelSerializer):
    """
    Serializer untuk model TelemetryData guna mendukung API endpoint data riwayat.
    """
    class Meta:
        model = TelemetryData
        fields = '__all__'


class AnomalyLogSerializer(serializers.ModelSerializer):
    """
    Serializer untuk model AnomalyLog guna mendukung API endpoint riwayat anomali.
    """
    class Meta:
        model = AnomalyLog
        fields = '__all__'


class SensorThresholdSerializer(serializers.ModelSerializer):
    """
    Serializer untuk model SensorThreshold guna mendukung API ambang batas dinamis.
    """
    class Meta:
        model = SensorThreshold
        fields = '__all__'

