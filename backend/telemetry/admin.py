from django.contrib import admin
from .models import TelemetryData, AnomalyLog, SensorThreshold

@admin.register(TelemetryData)
class TelemetryDataAdmin(admin.ModelAdmin):
    list_display = ('node_id', 'timestamp', 'temperature', 'vibration', 'current', 'voltage', 'humidity', 'gas_level')
    list_filter = ('node_id', 'timestamp')
    search_fields = ('node_id',)

@admin.register(AnomalyLog)
class AnomalyLogAdmin(admin.ModelAdmin):
    list_display = ('node_id', 'metric', 'value', 'threshold', 'timestamp')
    list_filter = ('node_id', 'metric', 'timestamp')
    search_fields = ('node_id', 'metric', 'message')

@admin.register(SensorThreshold)
class SensorThresholdAdmin(admin.ModelAdmin):
    list_display = ('label', 'metric', 'value', 'unit', 'updated_at')
    search_fields = ('metric', 'label')
