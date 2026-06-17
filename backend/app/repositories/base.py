from abc import ABC, abstractmethod
from typing import Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

T = TypeVar("T")


class BaseRepository(ABC, Generic[T]):
    def __init__(self, session: Session) -> None:
        self.session = session

    @property
    @abstractmethod
    def _model(self):
        ...

    @abstractmethod
    def to_schema(self, obj) -> T:
        ...

    def get_by_id(self, id: str | int) -> T | None:
        result = self.session.get(self._model, id)
        return self.to_schema(result) if result is not None else None

    def list_all(self) -> list[T]:
        results = self.session.execute(select(self._model)).scalars().all()
        return [self.to_schema(r) for r in results]

    @abstractmethod
    def create(self, schema: T) -> T:
        ...

    @abstractmethod
    def update(self, id: str | int, schema: T) -> T | None:
        ...

    def delete(self, id: str | int) -> bool:
        obj = self.session.get(self._model, id)
        if obj is None:
            return False
        self.session.delete(obj)
        self.session.commit()
        return True
