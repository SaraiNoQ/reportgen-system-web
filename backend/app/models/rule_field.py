from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RuleField(Base):
    __tablename__ = "rule_fields"

    id: Mapped[str] = mapped_column(primary_key=True)
    template_id: Mapped[str] = mapped_column(
        ForeignKey("rule_templates.id", ondelete="CASCADE")
    )
    name: Mapped[str]
    code: Mapped[str]
    type: Mapped[str]
    required: Mapped[bool]
    source: Mapped[str]
    format: Mapped[str]
    validation: Mapped[str]
    example: Mapped[str]
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
