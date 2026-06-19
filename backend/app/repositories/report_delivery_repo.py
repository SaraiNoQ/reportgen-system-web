
from app.models import ReportDelivery as ReportDeliveryORM
from app.repositories.base import BaseRepository
from app.schemas.domain import ReportDelivery


class ReportDeliveryRepo(BaseRepository[ReportDelivery]):
    @property
    def _model(self):
        return ReportDeliveryORM

    def to_schema(self, obj: ReportDeliveryORM) -> ReportDelivery:
        return ReportDelivery(
            id=obj.id,
            kind=obj.kind,
            scope=obj.scope,
            fileName=obj.file_name,
            filePath=obj.file_path,
            format=obj.format,
            status=obj.status,
            sectionId=obj.section_id,
            createdAt=obj.created_at.strftime("%Y-%m-%d %H:%M") if obj.created_at else "",
        )

    def create(self, schema: ReportDelivery) -> ReportDelivery:
        orm = ReportDeliveryORM(
            id=schema.id,
            kind=schema.kind,
            scope=schema.scope,
            file_name=schema.fileName,
            file_path=schema.filePath,
            format=schema.format,
            status=schema.status,
            section_id=schema.sectionId,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: ReportDelivery) -> ReportDelivery | None:
        orm = self.session.get(ReportDeliveryORM, id)
        if orm is None:
            return None
        orm.kind = schema.kind
        orm.scope = schema.scope
        orm.file_name = schema.fileName
        orm.file_path = schema.filePath
        orm.format = schema.format
        orm.status = schema.status
        orm.section_id = schema.sectionId
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)
