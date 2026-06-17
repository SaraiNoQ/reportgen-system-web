from sqlalchemy import select

from app.models import RuleField as RuleFieldORM
from app.models import RuleTemplate as RuleTemplateORM
from app.repositories.base import BaseRepository
from app.schemas.domain import RuleField, RuleTemplate


class RuleTemplateRepo(BaseRepository[RuleTemplate]):
    @property
    def _model(self):
        return RuleTemplateORM

    def to_schema(self, obj: RuleTemplateORM) -> RuleTemplate:
        fields = self.session.execute(
            select(RuleFieldORM)
            .where(RuleFieldORM.template_id == obj.id)
            .order_by(RuleFieldORM.sort_order)
        ).scalars().all()
        return RuleTemplate(
            id=obj.id,
            category=obj.category,
            name=obj.name,
            version=obj.version,
            updatedAt=obj.updated_at.strftime("%Y-%m-%d") if obj.updated_at else "",
            fields=[
                RuleField(
                    id=f.id,
                    name=f.name,
                    code=f.code,
                    type=f.type,
                    required=f.required,
                    source=f.source,
                    format=f.format,
                    validation=f.validation,
                    example=f.example,
                )
                for f in fields
            ],
        )

    def create(self, schema: RuleTemplate) -> RuleTemplate:
        orm = RuleTemplateORM(
            id=schema.id,
            category=schema.category,
            name=schema.name,
            version=schema.version,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)

        for field_schema in schema.fields:
            field_orm = RuleFieldORM(
                id=field_schema.id,
                template_id=schema.id,
                name=field_schema.name,
                code=field_schema.code,
                type=field_schema.type,
                required=field_schema.required,
                source=field_schema.source,
                format=field_schema.format,
                validation=field_schema.validation,
                example=field_schema.example,
            )
            self.session.add(field_orm)
        self.session.commit()
        return self.to_schema(orm)

    def update(self, id: str, schema: RuleTemplate) -> RuleTemplate | None:
        orm = self.session.get(RuleTemplateORM, id)
        if orm is None:
            return None
        orm.category = schema.category
        orm.name = schema.name
        orm.version = schema.version
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)
