from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ReportDelivery(Base):
    __tablename__ = "report_deliveries"

    id: Mapped[str] = mapped_column(primary_key=True)
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    kind: Mapped[str]
    scope: Mapped[str]
    file_name: Mapped[str]
    format: Mapped[str]
    status: Mapped[str]
    section_id: Mapped[str | None] = mapped_column(
        ForeignKey("report_sections.id", ondelete="SET NULL"), nullable=True
    )
    actor_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
