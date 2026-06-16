from fastapi import APIRouter, HTTPException

from app.schemas.domain import (
    AddManualFieldRequest,
    ExtractedField,
    FilePreviewResponse,
    ParseEvent,
    RawFile,
    RecordsExportRequest,
    RecordsExportResponse,
    UpdateFileTypeRequest,
    UpdateParseStatusRequest,
    UploadRequest,
    UploadResponse,
    UpsertFieldRequest,
)
from app.services.mock_store import store

router = APIRouter(prefix="/records", tags=["records"])


@router.get("/files", response_model=list[RawFile])
def list_files() -> list[RawFile]:
    return store.snapshot(store.raw_files)


@router.get("/parse-timeline", response_model=list[ParseEvent])
def default_parse_timeline() -> list[ParseEvent]:
    return store.snapshot(store.default_parse_events)


@router.get("/files/{file_id}/parse-events", response_model=list[ParseEvent])
def file_parse_events(file_id: str) -> list[ParseEvent]:
    return store.snapshot(store.parse_events.get(file_id, []))


@router.get("/fields", response_model=list[ExtractedField])
def default_fields() -> list[ExtractedField]:
    return store.snapshot(store.base_fields)


@router.get("/fields-by-file", response_model=dict[str, list[ExtractedField]])
def fields_by_file() -> dict[str, list[ExtractedField]]:
    return store.snapshot(store.fields_by_file)


@router.get("/files/{file_id}/fields", response_model=list[ExtractedField])
def file_fields(file_id: str) -> list[ExtractedField]:
    return store.snapshot(store.fields_by_file.get(file_id, []))


@router.post("/uploads", response_model=UploadResponse)
def create_uploads(payload: UploadRequest) -> UploadResponse:
    created = store.upload_files(payload.files)
    return UploadResponse(
        files=created,
        parseEvents={file.id: store.parse_events[file.id] for file in created},
        fields={file.id: store.fields_by_file[file.id] for file in created},
    )


@router.post("/exports", response_model=RecordsExportResponse)
def export_records(payload: RecordsExportRequest) -> RecordsExportResponse:
    file_name = store.export_records(payload.formats)
    return RecordsExportResponse(
        fileName=file_name,
        formats=payload.formats,
        status="ready",
    )


@router.get("/files/{file_id}/preview", response_model=FilePreviewResponse)
def preview_file(file_id: str) -> FilePreviewResponse:
    file = store.register_file_preview(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="file not found")
    return FilePreviewResponse(
        file=file,
        previewType=file.type,
        message=f"{file.name} 预览已就绪",
    )


@router.patch("/files/{file_id}/type", response_model=RawFile)
def update_file_type(file_id: str, payload: UpdateFileTypeRequest) -> RawFile:
    updated = store.update_file_type(file_id, payload.detectedType)
    if not updated:
        raise HTTPException(status_code=404, detail="file not found")
    return updated


@router.patch("/files/{file_id}/status", response_model=RawFile)
def update_file_status(file_id: str, payload: UpdateParseStatusRequest) -> RawFile:
    updated = store.update_file_status(file_id, payload.parseStatus)
    if not updated:
        raise HTTPException(status_code=404, detail="file not found")
    return updated


@router.delete("/files/{file_id}")
def delete_file(file_id: str) -> dict[str, bool]:
    if not store.delete_file(file_id):
        raise HTTPException(status_code=404, detail="file not found")
    return {"ok": True}


@router.patch("/files/{file_id}/fields/{field_id}", response_model=ExtractedField)
def update_field(file_id: str, field_id: str, payload: UpsertFieldRequest) -> ExtractedField:
    field = store.upsert_field(
        file_id,
        field_id,
        AddManualFieldRequest(name=payload.name or "", value=payload.value),
    )
    return field


@router.post("/files/{file_id}/fields", response_model=ExtractedField)
def add_manual_field(file_id: str, payload: AddManualFieldRequest) -> ExtractedField:
    return store.upsert_field(file_id, None, payload)
