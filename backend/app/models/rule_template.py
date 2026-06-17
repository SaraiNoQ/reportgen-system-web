from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RuleTemplate(Base):
    __tablename__ = "rule_templates"

    id: Mapped[str] = mapped_column(primary_key=True)
    category: Mapped[str]
    name: Mapped[str]
    version: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)
