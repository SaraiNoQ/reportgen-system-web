
from app.models import SystemMessage as SystemMessageORM
from app.repositories.base import BaseRepository
from app.schemas.domain import SystemMessage


class SystemMessageRepo(BaseRepository[SystemMessage]):
    @property
    def _model(self):
        return SystemMessageORM

    def to_schema(self, obj: SystemMessageORM) -> SystemMessage:
        return SystemMessage(
            id=obj.id,
            title=obj.title,
            content=obj.content,
            module=obj.module,
            type=obj.type,
            read=obj.read,
            time=obj.time,
            projectId=obj.project_id,
        )

    def create(self, schema: SystemMessage) -> SystemMessage:
        orm = SystemMessageORM(
            id=schema.id,
            title=schema.title,
            content=schema.content,
            module=schema.module,
            type=schema.type,
            read=schema.read,
            time=schema.time,
            project_id=schema.projectId,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: SystemMessage) -> SystemMessage | None:
        orm = self.session.get(SystemMessageORM, id)
        if orm is None:
            return None
        orm.title = schema.title
        orm.content = schema.content
        orm.module = schema.module
        orm.type = schema.type
        orm.read = schema.read
        orm.time = schema.time
        orm.project_id = schema.projectId
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)
