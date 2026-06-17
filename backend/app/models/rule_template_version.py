from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RuleTemplateVersion(Base):
    __tablename__ = "rule_template_versions"

    id: Mapped[str] = mapped_column(primary_key=True)
    template_id: Mapped[str] = mapped_column(
        ForeignKey("rule_templates.id", ondelete="CASCADE")
    )
    version: Mapped[str]
    label: Mapped[str]
    status: Mapped[str]
    actor: Mapped[str]
    actor_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
