"""add file path to report deliveries

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-06-19 00:00:00.000000
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "d5e6f7a8b9c0"
down_revision: str | Sequence[str] | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("report_deliveries", sa.Column("file_path", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("report_deliveries", "file_path")
