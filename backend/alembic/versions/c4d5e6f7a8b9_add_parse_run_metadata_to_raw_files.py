"""add parse run metadata to raw files

Revision ID: c4d5e6f7a8b9
Revises: b7c8d9e0f1a2
Create Date: 2026-06-19 00:00:00.000000
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("raw_files", sa.Column("parse_job_id", sa.String(), nullable=True))
    op.add_column("raw_files", sa.Column("parse_run_id", sa.String(), nullable=True))
    op.add_column("raw_files", sa.Column("parse_run_path", sa.String(), nullable=True))
    op.add_column("raw_files", sa.Column("fields_approved", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("raw_files", sa.Column("approved_at", sa.String(), nullable=True))
    op.alter_column("raw_files", "fields_approved", server_default=None)


def downgrade() -> None:
    op.drop_column("raw_files", "approved_at")
    op.drop_column("raw_files", "fields_approved")
    op.drop_column("raw_files", "parse_run_path")
    op.drop_column("raw_files", "parse_run_id")
    op.drop_column("raw_files", "parse_job_id")
