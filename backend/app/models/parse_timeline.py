from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class ParseTimeline(Base):
    """默认解析时间线模板 — 页面初始化时展示的标准流程节点。"""

    __tablename__ = "parse_timeline"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    time: Mapped[str]
    label: Mapped[str]
    state: Mapped[str]
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
