"""add section to extracted fields

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-06-19
"""

from collections.abc import Sequence

from sqlalchemy import Column, String

from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("extracted_fields", Column("section", String(), nullable=True))


def downgrade() -> None:
    op.drop_column("extracted_fields", "section")
