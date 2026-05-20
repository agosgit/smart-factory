import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

# Set modul settings default Django untuk asgi
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smart_factory.settings')

# Inisialisasi aplikasi Django ASGI di awal untuk memastikan AppRegistry terisi 
# sebelum mengimpor file yang menggunakan Django ORM/Models.
django_asgi_app = get_asgi_application()

# Import routing setelah get_asgi_application dipanggil
import telemetry.routing

application = ProtocolTypeRouter({
    # Menangani request HTTP standard (REST API, Admin Panel)
    "http": django_asgi_app,
    
    # Menangani koneksi real-time WebSocket dengan autentikasi session standard
    "websocket": AuthMiddlewareStack(
        URLRouter(
            telemetry.routing.websocket_urlpatterns
        )
    ),
})
