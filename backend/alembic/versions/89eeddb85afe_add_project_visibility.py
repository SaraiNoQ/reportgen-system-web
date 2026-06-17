"""add_project_visibility

Revision ID: 89eeddb85afe
Revises: 47063a03df94
Create Date: 2026-06-17 14:44:36.213490

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '89eeddb85afe'
down_revision: Union[str, Sequence[str], None] = '47063a03df94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add visibility and allowed_user_ids columns to projects."""
    op.add_column(
        "projects",
        sa.Column("visibility", sa.String(), nullable=False, server_default="public"),
    )
    op.add_column(
        "projects",
        sa.Column("allowed_user_ids", sa.ARRAY(sa.String()), nullable=True),
    )


def downgrade() -> None:
    """Remove visibility and allowed_user_ids columns."""
    op.drop_column("projects", "allowed_user_ids")
    op.drop_column("projects", "visibility")
