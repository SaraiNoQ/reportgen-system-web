from datetime import datetime

from sqlalchemy import ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ExtractedField(Base):
    __tablename__ = "extracted_fields"

    id: Mapped[str] = mapped_column(primary_key=True)
    file_id: Mapped[str | None] = mapped_column(
        ForeignKey("raw_files.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str]
    value: Mapped[str]
    confidence: Mapped[int]
    section: Mapped[str | None] = mapped_column(nullable=True)
    is_base: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
