from __future__ import annotations

from threading import Thread
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

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

router = APIRouter(prefix="/gen-report", tags=["gen-report"])


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
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.get_run_status(run_id)


@router.post("/runs/{run_id}/extract")
def extract_run(
    run_id: str,
    payload: StageRunRequest,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.extract_run(run_id, payload.section)


@router.get("/runs/{run_id}/review")
def review_run(
    run_id: str,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.review_run(run_id)


@router.post("/runs/{run_id}/approve")
def approve_run(
    run_id: str,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.approve_run(run_id)


@router.post("/runs/{run_id}/generate")
def generate_run(
    run_id: str,
    payload: StageRunRequest,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.generate_run(run_id, payload.section)


@router.post("/runs/{run_id}/set-field")
def set_field(
    run_id: str,
    payload: FieldUpdateRequest,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.set_field(run_id, payload.section, payload.field, payload.value)


@router.post("/runs/{run_id}/refresh-inputs")
def refresh_inputs(
    run_id: str,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.refresh_inputs(run_id)


@router.post("/runs/{run_id}/open-output")
def open_output(
    run_id: str,
    payload: OpenOutputRequest,
    service: Annotated[GenReportService, Depends(get_gen_report_service)],
) -> dict:
    return service.open_output(run_id, payload.target)
