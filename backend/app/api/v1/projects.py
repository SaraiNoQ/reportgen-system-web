from fastapi import APIRouter, HTTPException

from app.schemas.domain import (
    CreateProjectRequest,
    DeletedProjectRecord,
    Project,
    ProjectMetric,
    RestoreProjectResponse,
)
from app.services.mock_store import store

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[Project])
def list_projects() -> list[Project]:
    return store.snapshot(store.projects)


@router.get("/metrics", response_model=list[ProjectMetric])
def list_project_metrics() -> list[ProjectMetric]:
    return store.snapshot(store.project_metrics)


@router.post("", response_model=Project)
def create_project(payload: CreateProjectRequest) -> Project:
    return store.create_project(payload)


@router.get("/deleted", response_model=list[DeletedProjectRecord])
def list_deleted_projects() -> list[DeletedProjectRecord]:
    return store.snapshot(store.deleted_projects)


@router.delete("/{project_id}", response_model=DeletedProjectRecord)
def delete_project(project_id: str) -> DeletedProjectRecord:
    record = store.delete_project(project_id)
    if not record:
        raise HTTPException(status_code=404, detail="project not found")
    return record


@router.post("/{project_id}/restore", response_model=RestoreProjectResponse)
def restore_project(project_id: str) -> RestoreProjectResponse:
    project = store.restore_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="deleted project not found")
    return RestoreProjectResponse(project=project, restored=True)
