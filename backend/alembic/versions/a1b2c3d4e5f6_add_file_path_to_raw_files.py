"""add file_path to raw_files

Revision ID: a1b2c3d4e5f6
Revises: 89eeddb85afe
Create Date: 2026-06-17

Adds a nullable file_path column to raw_files so that uploaded
inspection records track their server-side storage location.
The column is populated by POST /records/upload-files when
multipart file content is received.
"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import Column, String


revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "89eeddb85afe"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("raw_files", Column("file_path", String(), nullable=True))


def downgrade() -> None:
    op.drop_column("raw_files", "file_path")
