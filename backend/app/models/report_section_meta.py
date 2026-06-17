from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ReportSectionMeta(Base):
    __tablename__ = "report_section_meta"

    section_id: Mapped[str] = mapped_column(
        ForeignKey("report_sections.id", ondelete="CASCADE"), primary_key=True
    )
    category_id: Mapped[str]
    revision_name: Mapped[str | None] = mapped_column(nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
