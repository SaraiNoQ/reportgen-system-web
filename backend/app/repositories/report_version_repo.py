
from app.models import ReportVersion as ReportVersionORM
from app.repositories.base import BaseRepository
from app.schemas.domain import ReportVersion


class ReportVersionRepo(BaseRepository[ReportVersion]):
    @property
    def _model(self):
        return ReportVersionORM

    def to_schema(self, obj: ReportVersionORM) -> ReportVersion:
        return ReportVersion(
            id=obj.id,
            label=obj.label,
            createdAt=obj.created_at.strftime("%Y-%m-%d %H:%M") if obj.created_at else "",
            actor=obj.actor,
            kind=obj.kind,
        )

    def create(self, schema: ReportVersion) -> ReportVersion:
        orm = ReportVersionORM(
            id=schema.id,
            label=schema.label,
            actor=schema.actor,
            kind=schema.kind,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: ReportVersion) -> ReportVersion | None:
        orm = self.session.get(ReportVersionORM, id)
        if orm is None:
            return None
        orm.label = schema.label
        orm.actor = schema.actor
        orm.kind = schema.kind
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)
