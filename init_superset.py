import psycopg2
import os
import subprocess
import sys

# ─────────────────────────────────────────
# ÉTAPE 1 — Créer superset_db si elle n'existe pas
# ─────────────────────────────────────────
print(">>> Vérification superset_db...")
conn = psycopg2.connect(
    host=os.environ["DATABASE_HOST"],
    port=os.environ["DATABASE_PORT"],
    user=os.environ["DATABASE_USER"],
    password=os.environ["DATABASE_PASSWORD"],
    dbname="postgres"
)
conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT 1 FROM pg_database WHERE datname='superset_db'")
if not cur.fetchone():
    cur.execute("CREATE DATABASE superset_db")
    print(">>> superset_db créée.")
else:
    print(">>> superset_db existe déjà.")
conn.close()

# ─────────────────────────────────────────
# ÉTAPE 2 — Migration base de données Superset
# ─────────────────────────────────────────
print(">>> Migration base de données Superset...")
result = subprocess.run(["superset", "db", "upgrade"], capture_output=False)
if result.returncode != 0:
    print("ERREUR: superset db upgrade a échoué")
    sys.exit(1)

# ─────────────────────────────────────────
# ÉTAPE 3 — Création admin
# ─────────────────────────────────────────
print(">>> Création admin...")
subprocess.run([
    "superset", "fab", "create-admin",
    "--username", os.environ["ADMIN_USERNAME"],
    "--firstname", "Admin",
    "--lastname", "DataPricer",
    "--email", "admin@datapricer.com",
    "--password", os.environ["ADMIN_PASSWORD"],
], capture_output=False)
print(">>> Admin créé ou déjà existant.")

# ─────────────────────────────────────────
# ÉTAPE 4 — Initialisation Superset (rôles, permissions)
# ─────────────────────────────────────────
print(">>> Initialisation Superset...")
result = subprocess.run(["superset", "init"], capture_output=False)
if result.returncode != 0:
    print("ERREUR: superset init a échoué")
    sys.exit(1)

# ─────────────────────────────────────────
# ÉTAPE 5 — Permissions supplémentaires pour Gamma (embed)
# ─────────────────────────────────────────
print(">>> Ajout permissions embed au rôle Gamma...")
try:
    from superset import create_app
    from superset.extensions import db
    from superset import security_manager

    app = create_app()
    with app.app_context():
        gamma_role = security_manager.find_role("Gamma")
        if gamma_role:
            extra_perms = [
                ("can read",  "CssTemplateAsyncModelView"),
                ("can read",  "CssTemplateModelView"),
                ("can read",  "ReportSchedule"),
                ("can read",  "Log"),
                ("can this form get", "CssTemplateAsyncModelView"),
                ("can this form post", "CssTemplateAsyncModelView"),
                ("can read",  "FilterSets"),
            ]
            for action, view in extra_perms:
                pvm = security_manager.find_permission_view_menu(action, view)
                if pvm:
                    security_manager.add_permission_role(gamma_role, pvm)
                    print(f"  ✓ {action} on {view}")
                else:
                    print(f"  ⚠ Permission non trouvée: {action} on {view} (ignoré)")
            db.session.commit()
            print(">>> Permissions Gamma mises à jour.")
        else:
            print(">>> Rôle Gamma introuvable, skip.")
except Exception as e:
    print(f">>> AVERTISSEMENT permissions Gamma: {e} (non bloquant)")

print(">>> Superset prêt. Démarrage Gunicorn...")
