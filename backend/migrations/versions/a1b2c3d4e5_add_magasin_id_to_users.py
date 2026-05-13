"""add magasin_id to users

Revision ID: a1b2c3d4e5
Revises: f4484718d3db
Create Date: 2026-05-12
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5'
down_revision = 'f4484718d3db'  # ← ton dernier migration ID
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('users',
        sa.Column('magasin_id', sa.String(), nullable=True)
    )

def downgrade():
    op.drop_column('users', 'magasin_id')