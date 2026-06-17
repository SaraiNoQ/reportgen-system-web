
from app.models import ReportSection as ReportSectionORM
from app.models import ReportSectionMeta as ReportSectionMetaORM
from app.repositories.base import BaseRepository
from app.schemas.domain import ReportSection, ReportSectionMeta


class ReportSectionRepo(BaseRepository[ReportSection]):
    @property
    def _model(self):
        return ReportSectionORM

    def to_schema(self, obj: ReportSectionORM) -> ReportSection:
        return ReportSection(
            id=obj.id,
            title=obj.title,
            content=obj.content,
            status=obj.status,
        )

    def create(self, schema: ReportSection) -> ReportSection:
        orm = ReportSectionORM(
            id=schema.id,
            title=schema.title,
            content=schema.content,
            status=schema.status,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: ReportSection) -> ReportSection | None:
        orm = self.session.get(ReportSectionORM, id)
        if orm is None:
            return None
        orm.title = schema.title
        orm.content = schema.content
        orm.status = schema.status
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def get_section_meta(self, section_id: str) -> ReportSectionMeta | None:
        result = self.session.get(ReportSectionMetaORM, section_id)
        if result is None:
            return None
        return ReportSectionMeta(
            sectionId=result.section_id,
            categoryId=result.category_id,
            revisionName=result.revision_name,
        )
