
from app.models import RuleField as RuleFieldORM
from app.repositories.base import BaseRepository
from app.schemas.domain import RuleField


class RuleFieldRepo(BaseRepository[RuleField]):
    @property
    def _model(self):
        return RuleFieldORM

    def to_schema(self, obj: RuleFieldORM) -> RuleField:
        return RuleField(
            id=obj.id,
            name=obj.name,
            code=obj.code,
            type=obj.type,
            required=obj.required,
            source=obj.source,
            format=obj.format,
            validation=obj.validation,
            example=obj.example,
        )

    def create(self, schema: RuleField, template_id: str) -> RuleField:
        orm = RuleFieldORM(
            id=schema.id,
            template_id=template_id,
            name=schema.name,
            code=schema.code,
            type=schema.type,
            required=schema.required,
            source=schema.source,
            format=schema.format,
            validation=schema.validation,
            example=schema.example,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: RuleField) -> RuleField | None:
        orm = self.session.get(RuleFieldORM, id)
        if orm is None:
            return None
        orm.name = schema.name
        orm.code = schema.code
        orm.type = schema.type
        orm.required = schema.required
        orm.source = schema.source
        orm.format = schema.format
        orm.validation = schema.validation
        orm.example = schema.example
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)
