from sqlalchemy import select

from app.models import UserPreference as UserPreferenceORM
from app.repositories.base import BaseRepository
from app.schemas.domain import UserPreference


class UserPreferenceRepo(BaseRepository[UserPreference]):
    @property
    def _model(self):
        return UserPreferenceORM

    def to_schema(self, obj: UserPreferenceORM) -> UserPreference:
        return UserPreference(
            userId=obj.user_id,
            currentProjectId=obj.current_project_id,
        )

    def create(self, schema: UserPreference) -> UserPreference:
        orm = UserPreferenceORM(
            user_id=schema.userId,
            current_project_id=schema.currentProjectId,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: int, schema: UserPreference) -> UserPreference | None:
        orm = self.session.get(UserPreferenceORM, id)
        if orm is None:
            return None
        orm.user_id = schema.userId
        orm.current_project_id = schema.currentProjectId
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def get_by_user_id(self, user_id: str) -> UserPreference | None:
        result = self.session.execute(
            select(UserPreferenceORM).where(UserPreferenceORM.user_id == user_id)
        ).scalar_one_or_none()
        return self.to_schema(result) if result is not None else None
