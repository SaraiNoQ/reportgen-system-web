"""FastAPI dependency injection — storage backend selection and DB session."""

from collections.abc import Generator

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.services.mock_store import MockStore
from app.services.postgres_store import PostgresStore

# Union type for store dependency — accepts either backend
Store = MockStore | PostgresStore


def get_db() -> Generator[Session, None, None]:
    """Yield a SQLAlchemy session, auto-closed after request."""
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_store(db: Session = Depends(get_db)) -> MockStore | PostgresStore:
    """Return the active storage backend.

    ``mock`` (default)  → singleton MockStore (JSON files).
    ``postgres``        → PostgresStore backed by SQLAlchemy repositories.
    """
    if settings.storage_backend == "postgres":
        return PostgresStore(db)
    from app.services.mock_store import store

    return store
