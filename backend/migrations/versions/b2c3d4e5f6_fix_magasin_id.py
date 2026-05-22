"""fix magasin_id: replace MD5(nom_enseigne) with real magasin_id from silver.magasin

Revision ID: b2c3d4e5f6
Revises: a1b2c3d4e5
Create Date: 2026-05-21
"""
from alembic import op
from sqlalchemy import text
import os

revision = 'b2c3d4e5f6'
down_revision = 'a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    # Connexion à data_pricer (connexion courante d'Alembic)
    app_conn = op.get_bind()

    # Connexion séparée à retail_pricing (même host, base différente)
    market_url = (
        f"postgresql+psycopg2://"
        f"{os.environ['POSTGRES_USER']}:{os.environ['POSTGRES_PASSWORD']}"
        f"@{os.environ['POSTGRES_HOST']}:{os.environ['POSTGRES_PORT']}"
        f"/{os.environ['POSTGRES_DB']}"  # retail_pricing
    )
    from sqlalchemy import create_engine
    market_engine = create_engine(market_url)

    # Récupère tous les users
    users = app_conn.execute(text(
        "SELECT id, company_name FROM users WHERE company_name IS NOT NULL"
    )).fetchall()

    with market_engine.connect() as market_conn:
        for user_id, company_name in users:
            # Cherche le vrai magasin_id dans silver.magasin
            row = market_conn.execute(text("""
                SELECT magasin_id
                FROM silver.magasin
                WHERE nom_enseigne ILIKE :name
                LIMIT 1
            """), {"name": f"%{company_name}%"}).fetchone()

            if row:
                app_conn.execute(text("""
                    UPDATE users
                    SET magasin_id = :magasin_id
                    WHERE id = :user_id
                """), {"magasin_id": row[0], "user_id": user_id})

    market_engine.dispose()


def downgrade():
    pass