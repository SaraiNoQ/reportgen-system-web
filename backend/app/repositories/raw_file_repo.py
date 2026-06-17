from sqlalchemy import select

from app.models import ExtractedField as ExtractedFieldORM
from app.models import ParseEvent as ParseEventORM
from app.models import RawFile as RawFileORM
from app.repositories.base import BaseRepository
from app.schemas.domain import ExtractedField, ParseEvent, RawFile


class RawFileRepo(BaseRepository[RawFile]):
    @property
    def _model(self):
        return RawFileORM

    def to_schema(self, obj: RawFileORM) -> RawFile:
        return RawFile(
            id=obj.id,
            name=obj.name,
            type=obj.type,
            size=obj.size,
            uploadedAt=obj.uploaded_at,
            parseStatus=obj.parse_status,
            detectedType=obj.detected_type,
            typeConfirmed=obj.type_confirmed,
        )

    def create(self, schema: RawFile) -> RawFile:
        orm = RawFileORM(
            id=schema.id,
            name=schema.name,
            type=schema.type,
            size=schema.size,
            uploaded_at=schema.uploadedAt,
            parse_status=schema.parseStatus,
            detected_type=schema.detectedType,
            type_confirmed=schema.typeConfirmed,
        )
        self.session.add(orm)
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def update(self, id: str, schema: RawFile) -> RawFile | None:
        orm = self.session.get(RawFileORM, id)
        if orm is None:
            return None
        orm.name = schema.name
        orm.type = schema.type
        orm.size = schema.size
        orm.uploaded_at = schema.uploadedAt
        orm.parse_status = schema.parseStatus
        orm.detected_type = schema.detectedType
        orm.type_confirmed = schema.typeConfirmed
        self.session.commit()
        self.session.refresh(orm)
        return self.to_schema(orm)

    def get_parse_events(self, file_id: str) -> list[ParseEvent]:
        results = self.session.execute(
            select(ParseEventORM)
            .where(ParseEventORM.file_id == file_id)
            .order_by(ParseEventORM.sort_order)
        ).scalars().all()
        return [
            ParseEvent(time=r.time, label=r.label, state=r.state)
            for r in results
        ]

    def get_extracted_fields(self, file_id: str | None = None) -> list[ExtractedField]:
        stmt = select(ExtractedFieldORM)
        if file_id is not None:
            stmt = stmt.where(ExtractedFieldORM.file_id == file_id)
        results = self.session.execute(stmt).scalars().all()
        return [
            ExtractedField(id=r.id, name=r.name, value=r.value, confidence=r.confidence)
            for r in results
        ]
