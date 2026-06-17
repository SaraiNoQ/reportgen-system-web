
from app.models import User as UserORM
from app.repositories.base import BaseRepository
from app.schemas.domain import AppUser


class UserRepo(BaseRepository[AppUser]):
    @property
    def _model(self):
        return UserORM

    def to_schema(self, obj: UserORM) -> AppUser:
        return AppUser(
            id=obj.id,
            name=obj.name,
            role=obj.role,
            department=obj.department,
            status=obj.status,
            lastLogin=obj.last_login,
        )

    def create(self, schema: AppUser) -> AppUser:
        orm = UserORM(
            id=schema.id,
            name=schema.name,
            role=schema.role,
            department=schema.department,
            status=schema.status,
            last_login=schema.lastLogin,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: AppUser) -> AppUser | None:
        orm = self.session.get(UserORM, id)
        if orm is None:
            return None
        orm.name = schema.name
        orm.role = schema.role
        orm.department = schema.department
        orm.status = schema.status
        orm.last_login = schema.lastLogin
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)
