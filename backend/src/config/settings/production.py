from django.core.exceptions import ImproperlyConfigured

from .base import *

DEBUG = False

SECRET_KEY = env("DJANGO_SECRET_KEY")

if (
    len(SECRET_KEY) < 50
    or SECRET_KEY == "REEMPLAZAR_CON_CLAVE_ALEATORIA"
    or SECRET_KEY == "change-this-secret-key-in-production"
    or SECRET_KEY.startswith("django-insecure-")
):
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY debe ser una clave aleatoria fuerte en producción."
    )

# WhiteNoise sirve los archivos estáticos compilados dentro de la imagen.
MIDDLEWARE.insert(
    1,
    "whitenoise.middleware.WhiteNoiseMiddleware",
)

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": (
            "whitenoise.storage.CompressedManifestStaticFilesStorage"
        ),
    },
}

# El sistema opera normalmente mediante Nginx en localhost.
ALLOWED_HOSTS = env.list(
    "DJANGO_ALLOWED_HOSTS",
    default=["localhost", "127.0.0.1"],
)

CSRF_TRUSTED_ORIGINS = env.list(
    "DJANGO_CSRF_TRUSTED_ORIGINS",
    default=["http://localhost", "http://127.0.0.1"],
)

# Nginx comunica el protocolo original mediante este encabezado.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# En la instalación local inicial se utilizará HTTP sobre localhost.
# Estas opciones pueden activarse si posteriormente se configura HTTPS.
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=False)
SESSION_COOKIE_SECURE = env.bool("DJANGO_SESSION_COOKIE_SECURE", default=False)
CSRF_COOKIE_SECURE = env.bool("DJANGO_CSRF_COOKIE_SECURE", default=False)

SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"

X_FRAME_OPTIONS = "DENY"

SECURE_HSTS_SECONDS = env.int("DJANGO_SECURE_HSTS_SECONDS", default=0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
SECURE_HSTS_PRELOAD = False

CONN_MAX_AGE = env.int("DJANGO_DB_CONN_MAX_AGE", default=60)
DATABASES["default"]["CONN_MAX_AGE"] = CONN_MAX_AGE
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": (
                "{asctime} {levelname} "
                "{name} pid={process:d} thread={thread:d} {message}"
            ),
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": env("DJANGO_LOG_LEVEL", default="INFO"),
    },
    "loggers": {
        "django.security": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}