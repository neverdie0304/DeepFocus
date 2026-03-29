from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.conf import settings

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
]

# In production, serve the React SPA for all non-API routes
if not settings.DEBUG or settings.FRONTEND_DIR.exists():
    urlpatterns += [
        re_path(r'^(?!api/|admin/|static/).*$', TemplateView.as_view(template_name='index.html')),
    ]
