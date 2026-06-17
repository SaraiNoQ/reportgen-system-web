
from app.models import OperationLog as OperationLogORM
from app.repositories.base import BaseRepository
from app.schemas.domain import OperationLog


class OperationLogRepo(BaseRepository[OperationLog]):
    @property
    def _model(self):
        return OperationLogORM

    def to_schema(self, obj: OperationLogORM) -> OperationLog:
        return OperationLog(
            id=obj.id,
            module=obj.module,
            actor=obj.actor,
            action=obj.action,
            result=obj.result,
            time=obj.time,
        )

    def create(self, schema: OperationLog) -> OperationLog:
        orm = OperationLogORM(
            id=schema.id,
            module=schema.module,
            actor=schema.actor,
            action=schema.action,
            result=schema.result,
            time=schema.time,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: OperationLog) -> OperationLog | None:
        orm = self.session.get(OperationLogORM, id)
        if orm is None:
            return None
        orm.module = schema.module
        orm.actor = schema.actor
        orm.action = schema.action
        orm.result = schema.result
        orm.time = schema.time
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)
