from datetime import datetime

from sqlalchemy import ARRAY, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    code: Mapped[str]
    type: Mapped[str]
    owner: Mapped[str]
    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str]
    progress: Mapped[int] = mapped_column(default=0)
    visibility: Mapped[str] = mapped_column(default="public")
    allowed_user_ids: Mapped[list[str] | None] = mapped_column(
        ARRAY(String), nullable=True, default=[]
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)
