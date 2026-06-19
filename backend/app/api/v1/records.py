from __future__ import annotations

import shutil
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from app.dependencies import Store, get_store
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
    UploadItem,
    UploadRequest,
    UploadResponse,
    UpsertFieldRequest,
)

router = APIRouter(prefix="/records", tags=["records"])


@router.get("/files", response_model=list[RawFile])
def list_files(
    store: Annotated[Store, Depends(get_store)],
    projectId: Annotated[str | None, Query()] = None,
) -> list[RawFile]:
    if hasattr(store, "list_record_files"):
        if hasattr(store, "validate_record_workspaces"):
            store.validate_record_workspaces(projectId)
        return store.list_record_files(projectId)
    files = store.raw_files
    if projectId:
        files = [file for file in files if file.projectId == projectId]
    return store.snapshot(files)


@router.get("/parse-timeline", response_model=list[ParseEvent])
def default_parse_timeline(
    store: Annotated[Store, Depends(get_store)],
) -> list[ParseEvent]:
    return store.snapshot(store.default_parse_events)


@router.get("/files/{file_id}/parse-events", response_model=list[ParseEvent])
def file_parse_events(
    file_id: str,
    store: Annotated[Store, Depends(get_store)],
) -> list[ParseEvent]:
    return store.snapshot(store.parse_events.get(file_id, []))


@router.get("/fields", response_model=list[ExtractedField])
def default_fields(
    store: Annotated[Store, Depends(get_store)],
) -> list[ExtractedField]:
    return store.snapshot(store.base_fields)


@router.get("/fields-by-file", response_model=dict[str, list[ExtractedField]])
def fields_by_file(
    store: Annotated[Store, Depends(get_store)],
    projectId: Annotated[str | None, Query()] = None,
) -> dict[str, list[ExtractedField]]:
    if not projectId:
        return store.snapshot(store.fields_by_file)
    if hasattr(store, "list_record_files"):
        files = store.list_record_files(projectId)
    else:
        files = [file for file in store.raw_files if file.projectId == projectId]
    file_ids = {file.id for file in files}
    return store.snapshot({
        file_id: fields
        for file_id, fields in store.fields_by_file.items()
        if file_id in file_ids
    })


@router.get("/files/{file_id}/fields", response_model=list[ExtractedField])
def file_fields(
    file_id: str,
    store: Annotated[Store, Depends(get_store)],
) -> list[ExtractedField]:
    return store.snapshot(store.fields_by_file.get(file_id, []))


@router.post("/uploads", response_model=UploadResponse)
def create_uploads(
    payload: UploadRequest,
    store: Annotated[Store, Depends(get_store)],
) -> UploadResponse:
    created = store.upload_files(payload.files, payload.projectId)
    return UploadResponse(
        files=created,
        parseEvents={file.id: store.parse_events[file.id] for file in created},
        fields={file.id: store.fields_by_file.get(file.id, []) for file in created},
    )


UPLOAD_ROOT = Path("uploads")


@router.post("/upload-files", response_model=UploadResponse)
def upload_files_with_content(
    projectId: Annotated[str, Form()],
    files: Annotated[list[UploadFile], File()],
    store: Annotated[Store, Depends(get_store)],
) -> UploadResponse:
    """Accept multipart file uploads, persist to disk, and register metadata."""
    items: list[UploadItem] = []
    paths: dict[str, str] = {}  # temp_id → serverPath

    for upload in files:
        if not upload.filename:
            continue
        safe_name = Path(upload.filename).name
        temp_id = f"uploading-{safe_name}"
        dest_dir = UPLOAD_ROOT / projectId / temp_id
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / safe_name
        with dest.open("wb") as f:
            shutil.copyfileobj(upload.file, f)
        items.append(
            UploadItem(
                name=safe_name,
                type=_infer_type(safe_name),
                size=_format_upload_size(dest.stat().st_size),
            )
        )
        paths[temp_id] = str(dest.resolve())

    created = store.upload_files(items, projectId)
    for file in created:
        for temp_id, spath in paths.items():
            if temp_id.endswith(file.name):
                store.set_file_path(file.id, spath)
                file.serverPath = spath
                break

    return UploadResponse(
        files=created,
        parseEvents={file.id: store.parse_events[file.id] for file in created},
        fields={file.id: store.fields_by_file.get(file.id, []) for file in created},
    )


def _infer_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    mapping = {
        ".pdf": "PDF",
        ".doc": "Word",
        ".docx": "Word",
        ".xls": "Excel",
        ".xlsx": "Excel",
        ".jpg": "JPG",
        ".jpeg": "JPG",
        ".png": "PNG",
    }
    return mapping.get(ext, "文件")


def _format_upload_size(size_bytes: int) -> str:
    if size_bytes < 1024 * 1024:
        return f"{max(1, round(size_bytes / 1024))} KB"
    return f"{size_bytes / 1024 / 1024:.2f} MB"


@router.post("/exports", response_model=RecordsExportResponse)
def export_records(
    payload: RecordsExportRequest,
    store: Annotated[Store, Depends(get_store)],
) -> RecordsExportResponse:
    file_name = store.export_records(payload.formats)
    return RecordsExportResponse(
        fileName=file_name,
        formats=payload.formats,
        status="ready",
    )


@router.get("/files/{file_id}/preview", response_model=FilePreviewResponse)
def preview_file(
    file_id: str,
    store: Annotated[Store, Depends(get_store)],
) -> FilePreviewResponse:
    file = store.register_file_preview(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="file not found")
    return FilePreviewResponse(
        file=file,
        previewType=file.type,
        message=f"{file.name} 预览已就绪",
    )


@router.patch("/files/{file_id}/type", response_model=RawFile)
def update_file_type(
    file_id: str,
    payload: UpdateFileTypeRequest,
    store: Annotated[Store, Depends(get_store)],
) -> RawFile:
    updated = store.update_file_type(file_id, payload.detectedType)
    if not updated:
        raise HTTPException(status_code=404, detail="file not found")
    return updated


@router.patch("/files/{file_id}/status", response_model=RawFile)
def update_file_status(
    file_id: str,
    payload: UpdateParseStatusRequest,
    store: Annotated[Store, Depends(get_store)],
) -> RawFile:
    updated = store.update_file_status(file_id, payload.parseStatus)
    if not updated:
        raise HTTPException(status_code=404, detail="file not found")
    return updated


@router.delete("/files/{file_id}")
def delete_file(
    file_id: str,
    store: Annotated[Store, Depends(get_store)],
) -> dict[str, bool]:
    if not store.delete_file(file_id):
        raise HTTPException(status_code=404, detail="file not found")
    return {"ok": True}


@router.patch("/files/{file_id}/fields/{field_id}", response_model=ExtractedField)
def update_field(
    file_id: str,
    field_id: str,
    payload: UpsertFieldRequest,
    store: Annotated[Store, Depends(get_store)],
) -> ExtractedField:
    field = store.upsert_field(
        file_id,
        field_id,
        AddManualFieldRequest(name=payload.name or "", value=payload.value),
    )
    return field


@router.post("/files/{file_id}/fields", response_model=ExtractedField)
def add_manual_field(
    file_id: str,
    payload: AddManualFieldRequest,
    store: Annotated[Store, Depends(get_store)],
) -> ExtractedField:
    return store.upsert_field(file_id, None, payload)
