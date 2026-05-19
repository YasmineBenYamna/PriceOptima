import os

# ─────────────────────────────────────────
# SÉCURITÉ
# ─────────────────────────────────────────
SECRET_KEY = "data_pricer_superset_secret_key_2024_xK9p_secure!"

# Désactiver Talisman (sinon il réécrit les headers de sécurité)
TALISMAN_ENABLED = False

# Autoriser embedding dans iframe
HTTP_HEADERS = {
    "X-Frame-Options": "ALLOWALL",
}

# Certaines versions utilisent plutôt OVERRIDE_HTTP_HEADERS pour écraser les headers
OVERRIDE_HTTP_HEADERS = {
    "X-Frame-Options": "ALLOWALL",
}

# Au cas où Superset lit aussi ce paramètre
X_FRAME_OPTIONS = "ALLOWALL"

# Désactiver CSRF (nécessaire pour guest token et embed simple)
WTF_CSRF_ENABLED = False

# ─────────────────────────────────────────
# BASE DE DONNÉES SUPERSET (métadonnées)
# ─────────────────────────────────────────
SQLALCHEMY_DATABASE_URI = "postgresql+psycopg2://postgres:admin123@postgres:5432/superset_db"

# ─────────────────────────────────────────
# FEATURE FLAGS
# ─────────────────────────────────────────
FEATURE_FLAGS = {
    "EMBEDDED_SUPERSET": True,          # Embed dans React
    "ENABLE_TEMPLATE_PROCESSING": True, # Filtres dynamiques via Jinja
    "DASHBOARD_NATIVE_FILTERS": True,   # Filtres natifs dans les dashboards
    "DASHBOARD_CROSS_FILTERS": True,    # Cross-filtering entre charts
    "DRILL_TO_DETAIL": True,            # Drill-down sur les données
    "DECK_GL_MAPS": True,               # Maps Deck.gl
}

# ─────────────────────────────────────────
# CORS — pour l'intégration React (port 3000)
# ─────────────────────────────────────────
ENABLE_CORS = True
CORS_OPTIONS = {
    "supports_credentials": True,
    "allow_headers": ["*"],
    "resources": ["*"],
    "origins": [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
}

# ─────────────────────────────────────────
# EMBED — domaines / rôle autorisés
# ─────────────────────────────────────────
GUEST_ROLE_NAME = "Gamma"
GUEST_TOKEN_JWT_EXP_SECONDS = 3600

# ─────────────────────────────────────────
# SESSION
# ─────────────────────────────────────────
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = False  # False car HTTP local (pas HTTPS)
SESSION_COOKIE_HTTPONLY = True

# ─────────────────────────────────────────
# CACHE (optionnel — améliore les perfs)
# ─────────────────────────────────────────
CACHE_CONFIG = {
    "CACHE_TYPE": "SimpleCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
}

# ─────────────────────────────────────────
# ROW LIMIT
# ─────────────────────────────────────────
ROW_LIMIT = 100000
VIZ_ROW_LIMIT = 50000