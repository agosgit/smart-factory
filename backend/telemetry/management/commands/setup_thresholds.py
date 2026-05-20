"""
Management Command: setup_thresholds
=====================================
Membersihkan data threshold lama (metric 'temperature' yang sudah tidak sesuai 
arsitektur) dan memastikan 6 threshold baru sesuai arsitektur TA sudah ada di database:

NODE 1 — Machine Monitoring (ESP32 #1):
  - temp_machine : Suhu Mesin (°C)
  - vibration    : Getaran Mesin (g)
  - current      : Arus Listrik (A)

NODE 2 — Environment Monitoring (ESP32 #2):
  - temp_room    : Suhu Ruangan (°C)
  - humidity     : Kelembaban Udara (%)
  - gas_level    : Kadar Gas/Asap (ppm)

Cara menjalankan:
  python manage.py setup_thresholds
  python manage.py setup_thresholds --reset   (hapus semua dan buat ulang dari nol)
"""

from django.core.management.base import BaseCommand
from telemetry.models import SensorThreshold


THRESHOLDS_ARCHITECTURE = [
    {
        "metric": "temp_machine",
        "value": 70.0,
        "label": "Suhu Mesin Maksimum (Node 1)",
        "unit": "°C",
        "description": "Batas aman suhu operasional mesin dari sensor di Node 1 (ESP32 #1 Machine Monitoring). Melebihi batas ini mengindikasikan overheat pada motor/mesin."
    },
    {
        "metric": "vibration",
        "value": 1.5,
        "label": "Getaran Mesin Maksimum (Node 1)",
        "unit": "g",
        "description": "Batas aman getaran mesin dari sensor MPU6050 di Node 1. Getaran tinggi menunjukkan potensi malfungsi atau ketidakseimbangan fisik pada mesin."
    },
    {
        "metric": "current",
        "value": 10.0,
        "label": "Arus Listrik Maksimum (Node 1)",
        "unit": "A",
        "description": "Batas aman konsumsi arus listrik mesin dari sensor ACS712 di Node 1. Arus berlebih dapat mengindikasikan beban mesin overload atau korsleting."
    },
    {
        "metric": "temp_room",
        "value": 35.0,
        "label": "Suhu Ruangan Maksimum (Node 2)",
        "unit": "°C",
        "description": "Batas aman suhu ruangan pabrik dari sensor DHT22 di Node 2 (ESP32 #2 Environment Monitoring). Suhu terlalu tinggi membahayakan pekerja dan perangkat elektronik."
    },
    {
        "metric": "humidity",
        "value": 80.0,
        "label": "Kelembaban Ruangan Maksimum (Node 2)",
        "unit": "%",
        "description": "Batas aman kelembaban udara ruangan dari sensor DHT22 di Node 2. Kelembaban berlebih dapat menyebabkan korosi dan kerusakan komponen elektronik."
    },
    {
        "metric": "gas_level",
        "value": 300.0,
        "label": "Kadar Gas/Asap Maksimum (Node 2)",
        "unit": "ppm",
        "description": "Batas aman konsentrasi gas/asap dari sensor MQ-2 di Node 2. Nilai di atas batas mengindikasikan kebocoran gas berbahaya atau potensi kebakaran."
    },
]

# Metric lama yang sudah tidak digunakan (harus dihapus)
OBSOLETE_METRICS = ["temperature"]


class Command(BaseCommand):
    help = "Migrasi threshold sensor ke arsitektur baru TA (6 metric: temp_machine, vibration, current, temp_room, humidity, gas_level)"

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Hapus semua threshold yang ada dan buat ulang dari nol (nilai akan dikembalikan ke default pabrik)',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.MIGRATE_HEADING(
            "\n=== Setup Threshold Sensor -- Arsitektur TA ===\n"
        ))

        # --- Langkah 1: Hapus metric lama yang sudah obsolete ---
        self.stdout.write(self.style.WARNING("Langkah 1: Membersihkan threshold lama..."))
        deleted_count = 0
        for obsolete_metric in OBSOLETE_METRICS:
            deleted, _ = SensorThreshold.objects.filter(metric=obsolete_metric).delete()
            if deleted:
                self.stdout.write(f"  [HAPUS] '{obsolete_metric}' ({deleted} record dihapus)")
                deleted_count += deleted
            else:
                self.stdout.write(f"  [SKIP]  '{obsolete_metric}' tidak ditemukan (sudah bersih)")

        if deleted_count == 0:
            self.stdout.write(self.style.SUCCESS("  [OK] Tidak ada threshold lama yang perlu dibersihkan."))

        # --- Langkah 2: Reset opsional ---
        if options['reset']:
            self.stdout.write(self.style.WARNING("\nLangkah 2: Mode RESET -- menghapus semua threshold yang ada..."))
            total_deleted, _ = SensorThreshold.objects.all().delete()
            self.stdout.write(self.style.WARNING(
                f"  [RESET] Dihapus total {total_deleted} threshold. Membuat ulang dari nol..."
            ))

        # --- Langkah 3: Buat atau update 6 threshold baru ---
        self.stdout.write(self.style.MIGRATE_HEADING("\nLangkah 2: Memastikan 6 threshold arsitektur baru..."))
        
        created_count = 0
        updated_count = 0
        preserved_count = 0

        for threshold_data in THRESHOLDS_ARCHITECTURE:
            metric = threshold_data["metric"]
            
            existing = SensorThreshold.objects.filter(metric=metric).first()
            
            if existing:
                if options['reset']:
                    # Update semua field saat reset
                    existing.value = threshold_data["value"]
                    existing.label = threshold_data["label"]
                    existing.unit = threshold_data["unit"]
                    existing.description = threshold_data["description"]
                    existing.save()
                    self.stdout.write(
                        f"  [UPDATE] [{metric}] = {threshold_data['value']} {threshold_data['unit']}"
                    )
                    updated_count += 1
                else:
                    # Pertahankan nilai yang sudah dikonfigurasi operator
                    self.stdout.write(
                        f"  [ADA]    [{metric}] = {existing.value} {existing.unit} (nilai dipertahankan)"
                    )
                    # Tetap update label dan description kalau berubah
                    if existing.label != threshold_data["label"] or existing.unit != threshold_data["unit"]:
                        existing.label = threshold_data["label"]
                        existing.unit = threshold_data["unit"]
                        existing.description = threshold_data["description"]
                        existing.save()
                    preserved_count += 1
            else:
                # Buat record baru
                SensorThreshold.objects.create(
                    metric=metric,
                    value=threshold_data["value"],
                    label=threshold_data["label"],
                    unit=threshold_data["unit"],
                    description=threshold_data["description"]
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  [BARU]   [{metric}] = {threshold_data['value']} {threshold_data['unit']}"
                    )
                )
                created_count += 1

        # --- Ringkasan ---
        self.stdout.write(self.style.MIGRATE_HEADING("\n=== Selesai! Ringkasan ==="))
        self.stdout.write(f"  Dihapus (lama)  : {deleted_count} record")
        self.stdout.write(f"  Dibuat baru     : {created_count} record")
        self.stdout.write(f"  Diperbarui      : {updated_count} record")
        self.stdout.write(f"  Dipertahankan   : {preserved_count} record")
        
        total = SensorThreshold.objects.count()
        self.stdout.write(self.style.SUCCESS(
            f"\n  Total threshold aktif di database: {total} record\n"
        ))

        # Tampilkan semua threshold aktif
        self.stdout.write(self.style.MIGRATE_HEADING("=== Threshold Aktif Saat Ini ==="))
        all_thresholds = SensorThreshold.objects.all()
        for t in all_thresholds:
            self.stdout.write(f"  [{t.metric:15}] {t.value:>8} {t.unit:<5} - {t.label}")
        
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(
            "Setup threshold selesai! Dashboard frontend siap digunakan.\n"
        ))
