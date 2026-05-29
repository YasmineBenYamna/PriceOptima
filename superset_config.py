import os

DB_HOST     = os.environ.get("DATABASE_HOST", "postgres")
DB_PORT     = os.environ.get("DATABASE_PORT", "5432")
DB_USER     = os.environ.get("DATABASE_USER", "postgres")
DB_PASSWORD = os.environ.get("DATABASE_PASSWORD", "admin123")
SUPERSET_DB = os.environ.get("DATABASE_DB", "superset_db")


FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,
    "ROW_LEVEL_SECURITY": True,
    "ENABLE_TEMPLATE_PROCESSING": True,
}

DATA_CACHE_CONFIG = {"CACHE_TYPE": "NullCache"}
HTTP_HEADERS = {}
TALISMAN_ENABLED = False
WTF_CSRF_ENABLED = False
CONTENT_SECURITY_POLICY_WARNING = False

CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": ["*"],
    "resources":     ["*"],
    "origins":       ["http://localhost:3000", "http://localhost:8088"],
}
ENABLE_CORS = True
SUPERSET_WEBSERVER_DOMAINS = None
GUEST_ROLE_NAME = "EmbeddedViewer"
GUEST_TOKEN_JWT_EXP_SECONDS = 3600