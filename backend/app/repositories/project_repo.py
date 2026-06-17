
from app.models import Project as ProjectORM
from app.repositories.base import BaseRepository
from app.schemas.domain import Project


class ProjectRepo(BaseRepository[Project]):
    @property
    def _model(self):
        return ProjectORM

    def to_schema(self, obj: ProjectORM) -> Project:
        return Project(
            id=obj.id,
            name=obj.name,
            code=obj.code,
            type=obj.type,
            owner=obj.owner,
            status=obj.status,
            progress=obj.progress,
            updatedAt=obj.updated_at.strftime("%Y-%m-%d %H:%M") if obj.updated_at else "",
        )

    def create(self, schema: Project) -> Project:
        orm = ProjectORM(
            id=schema.id,
            name=schema.name,
            code=schema.code,
            type=schema.type,
            owner=schema.owner,
            status=schema.status,
            progress=schema.progress,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: Project) -> Project | None:
        orm = self.session.get(ProjectORM, id)
        if orm is None:
            return None
        orm.name = schema.name
        orm.code = schema.code
        orm.type = schema.type
        orm.owner = schema.owner
        orm.status = schema.status
        orm.progress = schema.progress
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)
