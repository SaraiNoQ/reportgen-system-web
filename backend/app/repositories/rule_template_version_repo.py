
from app.models import RuleTemplateVersion as RuleTemplateVersionORM
from app.repositories.base import BaseRepository
from app.schemas.domain import RuleTemplateVersion


class RuleTemplateVersionRepo(BaseRepository[RuleTemplateVersion]):
    @property
    def _model(self):
        return RuleTemplateVersionORM

    def to_schema(self, obj: RuleTemplateVersionORM) -> RuleTemplateVersion:
        return RuleTemplateVersion(
            id=obj.id,
            templateId=obj.template_id,
            version=obj.version,
            label=obj.label,
            status=obj.status,
            createdAt=obj.created_at.strftime("%Y-%m-%d") if obj.created_at else "",
            actor=obj.actor,
        )

    def create(self, schema: RuleTemplateVersion) -> RuleTemplateVersion:
        orm = RuleTemplateVersionORM(
            id=schema.id,
            template_id=schema.templateId,
            version=schema.version,
            label=schema.label,
            status=schema.status,
            actor=schema.actor,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: RuleTemplateVersion) -> RuleTemplateVersion | None:
        orm = self.session.get(RuleTemplateVersionORM, id)
        if orm is None:
            return None
        orm.template_id = schema.templateId
        orm.version = schema.version
        orm.label = schema.label
        orm.status = schema.status
        orm.actor = schema.actor
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)
