"""add_unique_username_constraint

Revision ID: 47063a03df94
Revises: 778ea963c5a5
Create Date: 2026-06-17 14:40:58.829703

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '47063a03df94'
down_revision: Union[str, Sequence[str], None] = '778ea963c5a5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Deduplicate usernames then add unique constraint."""
    conn = op.get_bind()

    # ── Step 1: rename duplicate usernames to {name}_{id} ──
    # Keep the lowest-id row per name; rename the rest.
    dupes = conn.execute(
        sa.text("""
            SELECT id, name FROM users
            WHERE name IN (
                SELECT name FROM users GROUP BY name HAVING COUNT(*) > 1
            )
            ORDER BY name, id
        """)
    ).fetchall()

    seen: set[str] = set()
    for user_id, name in dupes:
        if name in seen:
            new_name = f"{name}_{user_id}"
            conn.execute(
                sa.text("UPDATE users SET name = :new_name WHERE id = :uid"),
                {"new_name": new_name, "uid": user_id},
            )
        else:
            seen.add(name)

    # ── Step 2: create unique constraint ──
    op.create_unique_constraint("uq_users_name", "users", ["name"])


def downgrade() -> None:
    """Drop unique constraint on username."""
    op.drop_constraint("uq_users_name", "users", type_="unique")
