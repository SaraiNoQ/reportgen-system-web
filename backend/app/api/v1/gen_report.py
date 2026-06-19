from __future__ import annotations

import json
from json import JSONDecodeError
from pathlib import Path
from threading import Thread
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.db.session import SessionLocal
from app.dependencies import Store, get_store
from app.schemas.domain import ExtractedField
from app.schemas.gen_report import (
    FieldUpdateRequest,
    ManifestValidateRequest,
    OpenOutputRequest,
    RunWorkflowRequest,
    StageRunRequest,
    WorkflowJobResponse,
)
from app.services.gen_report_service import GenReportService, get_gen_report_service
from app.services.jobs import job_registry
from app.services.manifest_builder import ManifestBuilder
from app.services.postgres_store import PostgresStore

router = APIRouter(prefix="/gen-report", tags=["gen-report"])


def _coerce_extracted_fields(raw_fields: list[dict]) -> list[ExtractedField]:
    fields: list[ExtractedField] = []
    for index, field in enumerate(raw_fields):
        name = str(field.get("name") or field.get("field") or f"field_{index + 1}")
        value = field.get("value")
        raw_confidence = field.get("confidence", 70)
        try:
            confidence = int(float(raw_confidence))
        except (TypeError, ValueError):
            confidence = 70
        confidence = max(0, min(100, confidence))
        fields.append(ExtractedField(
            id=str(field.get("id") or name or f"field-{index + 1}"),
            name=name,
            value="" if value is None else str(value),
            confidence=confidence,
            section=str(field.get("section") or "main"),
        ))
    return fields


def _mark_files_parse_success(
    file_ids: list[str],
    store: Store,
    extracted_fields: list[ExtractedField] | None = None,
    job_id: str | None = None,
    run_id: str | None = None,
    run_path: str | None = None,
) -> None:
    if not file_ids:
        return

    if isinstance(store, PostgresStore):
        db = SessionLocal()
        try:
            postgres_store = PostgresStore(db)
            postgres_store.bind_file_run_metadata(file_ids, job_id, run_id, run_path)
            for file_id in file_ids:
                postgres_store.update_file_status(file_id, "解析成功")
                if extracted_fields:
                    postgres_store.replace_file_fields(file_id, extracted_fields)
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        return

    store.bind_file_run_metadata(file_ids, job_id, run_id, run_path)
    for file_id in file_ids:
        store.update_file_status(file_id, "解析成功")
        if extracted_fields:
            store.replace_file_fields(file_id, extracted_fields)


def _mark_files_parse_failed(
    file_ids: list[str],
    store: Store,
    job_id: str | None = None,
    run_id: str | None = None,
    run_path: str | None = None,
) -> None:
    if not file_ids:
        return
    if isinstance(store, PostgresStore):
        db = SessionLocal()
        try:
            postgres_store = PostgresStore(db)
            postgres_store.bind_file_run_metadata(file_ids, job_id, run_id, run_path)
            for file_id in file_ids:
                postgres_store.update_file_status(file_id, "解析失败")
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
        return
    store.bind_file_run_metadata(file_ids, job_id, run_id, run_path)
    for file_id in file_ids:
        store.update_file_status(file_id, "解析失败")


def _register_persisted_run_path(
    run_id: str,
    store: Store,
    service: GenReportService,
) -> None:
    if not hasattr(store, "list_record_files"):
        return
    for file in store.list_record_files(None):
        if file.parseRunId != run_id or not file.parseRunPath:
            continue
        run_path = Path(file.parseRunPath)
        if (run_path / "status.json").is_file():
            service.register_run_path(run_id, run_path)
        return


def _rebuild_fill_payload_from_record_fields(
    run_id: str,
    section: str,
    field_name: str,
    field_value: str,
    store: Store,
) -> bool:
    if not hasattr(store, "list_record_files"):
        return False
    for file in store.list_record_files(None):
        if file.parseRunId != run_id or not file.parseRunPath:
            continue
        run_path = Path(file.parseRunPath)
        if not run_path.is_dir():
            return False
        if hasattr(store, "get_fields_by_file"):
            fields = store.get_fields_by_file(file.id)
        else:
            fields = store.fields_by_file.get(file.id, [])  # type: ignore[union-attr]
        section_fields = [
            field for field in fields
            if (field.section or "main") == section
        ]
        if not any(field.name == field_name for field in section_fields):
            section_fields.append(ExtractedField(
                id=field_name,
                name=field_name,
                value=field_value,
                confidence=100,
                section=section,
            ))
        payload = [
            {
                "placeholder": field.name,
                "value": field.value,
                "content_type": "text",
                "source": "record_fields",
                "evidence": {
                    "source": "core_api_record_fields",
                    "locator": file.id,
                },
            }
            for field in section_fields
        ]
        payload_path = run_path / "fill_payloads" / (
            "main.json" if section == "main" else f"{section}.json"
        )
        payload_path.parent.mkdir(parents=True, exist_ok=True)
        payload_path.write_text(
            json.dumps(payload, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        return True
    return False


@router.post("/manifests/validate")
def validate_manifest(
    payload: ManifestValidateRequest,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.validate_manifest(payload.manifestPath)


@router.post("/manifests/prepare")
def prepare_manifest(
    payload: ManifestValidateRequest,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.prepare_manifest(payload.manifestPath)


@router.post(
    "/runs",
    response_model=WorkflowJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_workflow(
    payload: RunWorkflowRequest,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    job = job_registry.create()

    def worker() -> None:
        job_registry.update(job.job_id, status="running", message="Workflow started.")
        try:
            result = service.run_workflow(
                payload.manifestPath,
                payload.mode,
                progress_callback=lambda message: job_registry.add_progress(job.job_id, message),
            )
            if hasattr(service, "register_result_runs"):
                run_paths = service.register_result_runs(result)
            else:
                run_paths = {
                    str(run["run_id"]): str(run["run_path"])
                    for run in result.get("runs", [])
                    if run.get("run_id") and run.get("run_path")
                }
            final_status = "succeeded" if result.get("status") in {"ok", "partial"} else "failed"
            job_registry.update(
                job.job_id,
                status=final_status,
                message=result.get("message", "Workflow completed."),
                run_paths=run_paths,
                result=result,
                error=None if final_status == "succeeded" else result.get("message"),
            )
        except Exception as exc:  # pragma: no cover - exercised through API failure state
            job_registry.update(
                job.job_id,
                status="failed",
                message="Workflow failed.",
                error=str(exc),
            )

    Thread(target=worker, daemon=True).start()
    return job.to_response()


@router.get("/jobs/{job_id}", response_model=WorkflowJobResponse)
def get_job(job_id: str) -> dict:
    job = job_registry.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Unknown job_id '{job_id}'.")
    return job.to_response()


@router.get("/runs/{run_id}/status")
def get_run_status(
    run_id: str,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    _register_persisted_run_path(run_id, store, service)
    return service.get_run_status(run_id)


@router.get("/runs/{run_id}/fields")
def get_run_fields(
    run_id: str,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    _register_persisted_run_path(run_id, store, service)
    return service.get_fields(run_id)


@router.post("/runs/{run_id}/extract")
def extract_run(
    run_id: str,
    payload: StageRunRequest,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    _register_persisted_run_path(run_id, store, service)
    return service.extract_run(run_id, payload.section)


@router.get("/runs/{run_id}/review")
def review_run(
    run_id: str,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    _register_persisted_run_path(run_id, store, service)
    return service.review_run(run_id)


@router.post("/runs/{run_id}/approve")
def approve_run(
    run_id: str,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    _register_persisted_run_path(run_id, store, service)
    result = service.approve_run(run_id)
    store.mark_files_fields_approved(run_id)
    return result


@router.post("/runs/{run_id}/generate")
def generate_run(
    run_id: str,
    payload: StageRunRequest,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    _register_persisted_run_path(run_id, store, service)
    return service.generate_run(run_id, payload.section)


@router.post("/runs/{run_id}/set-field")
def set_field(
    run_id: str,
    payload: FieldUpdateRequest,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    _register_persisted_run_path(run_id, store, service)
    try:
        result = service.set_field(run_id, payload.section, payload.field, payload.value)
    except JSONDecodeError as exc:
        repaired = _rebuild_fill_payload_from_record_fields(
            run_id,
            payload.section,
            payload.field,
            payload.value,
            store,
        )
        if not repaired:
            raise HTTPException(
                status_code=409,
                detail="字段工作区 payload 已损坏，请重新解析后再保存字段。",
            ) from exc
        result = service.set_field(run_id, payload.section, payload.field, payload.value)
    if result.get("status") == "ok":
        if hasattr(store, "update_run_field_value"):
            store.update_run_field_value(run_id, payload.section, payload.field, payload.value)
        else:
            store.reset_run_approval(run_id)
    return result


@router.post("/runs/{run_id}/refresh-inputs")
def refresh_inputs(
    run_id: str,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    _register_persisted_run_path(run_id, store, service)
    return service.refresh_inputs(run_id)


@router.post("/runs/{run_id}/open-output")
def open_output(
    run_id: str,
    payload: OpenOutputRequest,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    _register_persisted_run_path(run_id, store, service)
    return service.open_output(run_id, payload.target)


class ProjectRunRequest(BaseModel):
    projectId: str = Field(min_length=1)


def _build_project_run_context(
    project_id: str,
    store: Store,
    service: GenReportService,
) -> tuple[str, str, Path, list[str]]:
    projects = store.list_projects_for_user("__system__", "管理员")  # type: ignore[arg-type]
    project = next((p for p in projects if p.id == project_id), None)
    if project is None:
        raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found.")

    rule_templates = store.rule_templates  # type: ignore[union-attr]
    if hasattr(store, "list_record_files"):
        raw_files = store.list_record_files(project_id)
    else:
        raw_files = store.raw_files  # type: ignore[union-attr]
    pending_file_ids = [file.id for file in raw_files if file.parseStatus == "解析中"]

    builder = ManifestBuilder()
    try:
        manifest_meta = builder.build(
            project=project.model_dump(),
            rule_templates=[rt.model_dump() for rt in rule_templates],
            source_files=[rf.model_dump() for rf in raw_files],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to build manifest: {exc}",
        ) from exc

    manifest_path = manifest_meta["manifest_path"]
    workspace_path = manifest_meta["workspace_path"]
    run_id = manifest_meta["run_id"]
    run_path = Path(workspace_path) / "work" / run_id
    service.register_run_path(run_id, run_path)
    return manifest_path, run_id, run_path, pending_file_ids


@router.post(
    "/projects/extract",
    response_model=WorkflowJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def extract_project_fields(
    payload: ProjectRunRequest,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    """Build a project workspace and run only the field extraction stage."""
    (
        manifest_path,
        fallback_run_id,
        fallback_run_path,
        pending_file_ids,
    ) = _build_project_run_context(payload.projectId, store, service)
    job = job_registry.create()
    store.bind_file_run_metadata(
        pending_file_ids,
        job_id=job.job_id,
        run_id=fallback_run_id,
        run_path=str(fallback_run_path.resolve()),
    )

    def worker() -> None:
        job_registry.update(job.job_id, status="running", message="Field extraction started.")
        try:
            prepare_result = service.prepare_manifest(manifest_path)
            run_paths = service.register_result_runs(prepare_result)
            if not run_paths:
                run_paths = {fallback_run_id: str(fallback_run_path.resolve())}
            results: list[dict] = []
            failed_count = 0
            extracted_count = 0

            for run_id, run_path in run_paths.items():
                job_registry.add_progress(job.job_id, f"Run {run_id}: extract started")
                result = service.extract_run(run_id)
                job_registry.add_progress(job.job_id, f"Run {run_id}: extract completed")
                extract_status = str(result.get("status", "error"))
                if extract_status == "error":
                    failed_count += 1
                else:
                    extracted_count += 1
                results.append({
                    "run_id": run_id,
                    "status": extract_status,
                    "run_path": run_path,
                    "message": result.get("message", "Extraction completed."),
                })

            run_id_for_fields = next(iter(run_paths.keys()), fallback_run_id)
            raw_fields = service.get_fields(run_id_for_fields).get("fields", [])
            if raw_fields:
                _mark_files_parse_success(
                    pending_file_ids,
                    store,
                    _coerce_extracted_fields(raw_fields),
                    job_id=job.job_id,
                    run_id=run_id_for_fields,
                    run_path=run_paths.get(run_id_for_fields),
                )

            final_status = "succeeded" if extracted_count > 0 and raw_fields else "failed"
            message = (
                f"Field extraction completed for {extracted_count} run(s)."
                if final_status == "succeeded"
                else "Field extraction failed."
            )
            result_payload = {
                "status": "ok" if final_status == "succeeded" else "error",
                "message": message,
                "runs": results,
                "extracted_count": extracted_count,
                "failed_count": failed_count,
            }
            job_registry.update(
                job.job_id,
                status=final_status,
                message=message,
                run_paths=run_paths,
                result=result_payload,
                error=None if final_status == "succeeded" else message,
            )
            if final_status == "failed":
                _mark_files_parse_failed(
                    pending_file_ids,
                    store,
                    job_id=job.job_id,
                    run_id=run_id_for_fields,
                    run_path=run_paths.get(run_id_for_fields),
                )
        except Exception as exc:  # pragma: no cover
            _mark_files_parse_failed(
                pending_file_ids,
                store,
                job_id=job.job_id,
                run_id=fallback_run_id,
                run_path=str(fallback_run_path.resolve()),
            )
            job_registry.update(
                job.job_id,
                status="failed",
                message="Field extraction failed.",
                error=str(exc),
            )

    Thread(target=worker, daemon=True).start()
    return job.to_response()


@router.post(
    "/projects/runs",
    response_model=WorkflowJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_project_workflow(
    payload: ProjectRunRequest,
    store: Annotated[Store, Depends(get_store)],
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    """Generate a manifest from project data and run the full report workflow.

    Looks up the project's rule templates and source files, creates a
    workspace with manifest.yaml, then launches the gen-report pipeline
    as an async job.  The client polls ``GET /jobs/{job_id}`` for progress.
    """
    manifest_path, run_id, _run_path, pending_file_ids = _build_project_run_context(
        payload.projectId,
        store,
        service,
    )

    # --- launch async workflow ---
    job = job_registry.create()
    store.bind_file_run_metadata(pending_file_ids, job_id=job.job_id, run_id=run_id)

    def worker() -> None:
        job_registry.update(job.job_id, status="running", message="Workflow started.")
        try:
            result = service.run_workflow(
                manifest_path,
                "full",
                progress_callback=lambda message: job_registry.add_progress(job.job_id, message),
            )
            run_paths = service.register_result_runs(result)
            final_status = "succeeded" if result.get("status") in {"ok", "partial"} else "failed"
            run_id_for_fields = next(iter(run_paths.keys()), run_id)
            raw_fields = service.get_fields(run_id_for_fields).get("fields", [])
            if raw_fields:
                _mark_files_parse_success(
                    pending_file_ids,
                    store,
                    _coerce_extracted_fields(raw_fields),
                    job_id=job.job_id,
                    run_id=run_id_for_fields,
                    run_path=run_paths.get(run_id_for_fields),
                )
            job_registry.update(
                job.job_id,
                status=final_status,
                message=result.get("message", "Workflow completed."),
                run_paths=run_paths,
                result=result,
                error=None if final_status == "succeeded" else result.get("message"),
            )
        except Exception as exc:  # pragma: no cover
            job_registry.update(
                job.job_id,
                status="failed",
                message="Workflow failed.",
                error=str(exc),
            )

    Thread(target=worker, daemon=True).start()
    return job.to_response()
