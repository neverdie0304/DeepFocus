from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, FocusSession, SessionEvent

admin.site.register(User, UserAdmin)
admin.site.register(FocusSession)
admin.site.register(SessionEvent)
