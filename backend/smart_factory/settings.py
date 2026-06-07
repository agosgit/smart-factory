import os
from pathlib import Path
import environ

# Inisialisasi Django-Environ
env = environ.Env(
    DEBUG=(bool, True),
    ALLOWED_HOSTS=(list, ['localhost', '127.0.0.1']),
    DB_PASSWORD=(str, ''),
    THRESHOLD_TEMP_MAX=(float, 70.0),
    THRESHOLD_VIB_MAX=(float, 1.5),
    THRESHOLD_GAS_MAX=(float, 300.0),
)

# Tentukan BASE_DIR
BASE_DIR = Path(__file__).resolve().parent.parent

# Baca file .env jika ada
environ.Env.read_env(os.path.join(BASE_DIR, '.env'))

# Keamanan Django
SECRET_KEY = env('SECRET_KEY', default='django-insecure-smart-factory-telemetry-key-xyz123')
DEBUG = env('DEBUG')
ALLOWED_HOSTS = env('ALLOWED_HOSTS')

# Aplikasi Terpasang
# PENTING: 'daphne' harus dideklarasikan SEBELUM 'django.contrib.staticfiles' agar ASGI server berjalan dengan benar saat development
INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Library Pihak Ketiga
    'corsheaders',
    'rest_framework',
    'channels',
    # Aplikasi Lokal
    'telemetry',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

CORS_ALLOW_ALL_ORIGINS = True

ROOT_URLCONF = 'smart_factory.urls'


TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# Server APLIKASI (ASGI & WSGI)
ASGI_APPLICATION = 'smart_factory.asgi.application'
WSGI_APPLICATION = 'smart_factory.wsgi.application'

# Konfigurasi Database MySQL 8
# Menggunakan kredensial dari file .env (port 3307, host 127.0.0.1, user root)
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': env('DB_NAME', default='smart_factory'),
        'USER': env('DB_USER', default='root'),
        'PASSWORD': env('DB_PASSWORD', default=''),
        'HOST': env('DB_HOST', default='127.0.0.1'),
        'PORT': env('DB_PORT', default='3307'),
        'OPTIONS': {
            'charset': 'utf8mb4',
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
        }
    }
}

# Validasi Password Django
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Internasionalisasi (Waktu dan Bahasa)
# Menyesuaikan zona waktu lokal Indonesia Barat (WIB) demi akurasi telemetri
LANGUAGE_CODE = 'id-id'
TIME_ZONE = 'Asia/Jakarta'
USE_I18N = True
USE_TZ = False

# Static Files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Konfigurasi Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.AllowAny', # Terbuka demi kemudahan pengembangan/pengujian Tugas Akhir
    ],
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ]
}

# Django Channels Layers (Untuk komunikasi WebSocket real-time)
# Menggunakan InMemoryChannelLayer yang ringan untuk kemudahan eksekusi Tugas Akhir tanpa setup Redis
# Catatan: Jika dideploy ke production multi-server, ganti ke channels_redis.
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}

# Parameter Ambang Batas Deteksi Anomali
# Memudahkan penyetelan batas peringatan sensor dari luar kode program
THRESHOLD_TEMP_MAX = env('THRESHOLD_TEMP_MAX')
THRESHOLD_VIB_MAX = env('THRESHOLD_VIB_MAX')
THRESHOLD_GAS_MAX = env('THRESHOLD_GAS_MAX')

# Konfigurasi MQTT Broker untuk Background Worker
MQTT_HOST = env('MQTT_HOST', default='127.0.0.1')
MQTT_PORT = env.int('MQTT_PORT', default=1883)
MQTT_USER = env('MQTT_USER', default='admin')
MQTT_PASSWORD = env('MQTT_PASSWORD', default='admin')
MQTT_CLIENT_ID = env('MQTT_CLIENT_ID', default='smart_factory_backend_listener')

