# superset_config.py — place at project root (next to docker-compose.yml)

FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,
}

# Allow embedding in iframes from the frontend
HTTP_HEADERS = {}

TALISMAN_ENABLED = False
WTF_CSRF_ENABLED = False

CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers":        ["*"],
    "resources":            ["*"],
    "origins":              ["http://localhost:3000", "http://localhost:8088"],
}

ENABLE_CORS = True

# Allow all domains to embed dashboards in iframes
SUPERSET_WEBSERVER_DOMAINS = None